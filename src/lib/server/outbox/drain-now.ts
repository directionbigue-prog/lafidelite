/**
 * Post-response drain for the interactive path.
 *
 * WHY THIS EXISTS — read before deleting it as "duplicate cron logic".
 *
 * Vercel's Hobby plan refuses to deploy any cron that runs more than once a
 * day:
 *
 *     Hobby accounts are limited to daily cron jobs. This cron expression
 *     (* / 1 * * * *) would run more than once per day.
 *
 * `outbox-drain` and `email-queue-drain` were declared every minute, so the
 * deployment failed outright. Demoting them to daily would have deployed
 * cleanly and quietly killed signup instead: a verification code would leave
 * up to 24 hours after the user asked for it — and Hobby's scheduling
 * precision is ±59 minutes on top of that. A green deployment where nobody
 * can finish signing up is the worse of the two failures, because nothing
 * reports it.
 *
 * So the interactive path no longer waits for a schedule. A route that
 * enqueues a user-facing email calls `drainNow()` inside Next's `after()`,
 * which runs once the response has been flushed. The crons stay declared —
 * daily — as the catch-up net for whatever this path misses: a send that
 * failed and is now in backoff, a cold instance, the webhook path.
 *
 * THREE PROPERTIES THIS MUST KEEP.
 *
 * 1. It never throws into the caller. A failed drain must not turn a
 *    successful signup into a 500, and `after()` callbacks that reject are
 *    an unhandled rejection, not a caught error.
 *
 * 2. It takes NO lease, unlike the cron routes — deliberately. `withLease`
 *    exists there to stop several instances doing the same batch work every
 *    minute. Here, two people signing up in the same second must BOTH get
 *    their mail, and a shared lease would make the second one drain nothing
 *    and wait for tomorrow's cron. That is only safe because both layers
 *    below claim atomically: `drainOutbox` claims each row before working
 *    it, and `drainOne` pops from Redis and then re-reads the EmailJob,
 *    returning early when it is already SENT or DEAD. Concurrency here
 *    duplicates effort, never delivery.
 *
 * 3. It is time-bounded. `after()` work counts against the invocation's
 *    duration, and the auth routes declare no `maxDuration`, so they get the
 *    platform default. The budget below is small on purpose: the goal is to
 *    get THIS user's mail out, not to empty the queue.
 */
import 'server-only';
import { after } from 'next/server';
import { createLogger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/prisma';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { drainOutbox } from './dispatcher';

const log = createLogger();

/** Small: this is the interactive path, not the batch one. */
const BATCH = 5;

/**
 * Wall-clock ceiling for the SENDING stage, counted from the moment it
 * starts — not from the top of `drainNow`.
 *
 * A single shared budget was a real bug, and a quiet one. Stage 1 (drain the
 * outbox) costs several Postgres round trips per row, and Neon answers in
 * ~800 ms from a laptop. With two rows pending it ate the whole budget, so
 * the `while` below never ran a single iteration: the mail was correctly
 * queued in Redis and then simply not sent. The log said `sent: 0`, the
 * EmailJob sat at PENDING with no error, and the code never arrived —
 * failure by omission, which no error message describes.
 */
const SEND_BUDGET_MS = 8_000;

/**
 * Runaway guard on stale pointers stepped over in one drain — NOT a policy.
 *
 * A pointer is stale when its EmailJob row is gone or already terminal. It
 * leaves the queue without any mail moving, so it must not spend one of the
 * `BATCH` slots: that was the second half of a real outage. Twenty-five stale
 * pointers had piled up in Redis (rows deleted while their ids were still
 * queued), the live job sat behind them, and every signup spent its one drain
 * stepping over a single ghost. `drainNow` then logged `sent: 1`, which was
 * not true, and the mail waited four days for a daily cron.
 *
 * The number is deliberately far above any plausible backlog, and the first
 * attempt at it was a bug: set to 25, it stopped the loop on the 25th ghost —
 * one call short of the live job in exactly the case it was written for. A
 * count that can strand mail is the original defect moved one notch further
 * out.
 *
 * `SEND_BUDGET_MS` is the real bound, and it is latency-shaped. Each skip
 * costs a claim, a row lookup and an ack — three round trips. On Vercel with
 * Upstash and Neon in the same region that is tens of milliseconds, so 8 s
 * steps over a backlog in the dozens. From a laptop it is ~2 s per skip, and
 * the same 8 s bought FOUR steps when this was measured: locally, a deep
 * backlog needs the cron route (BATCH_SIZE=100) or `pnpm drain`, not a
 * signup request. This ceiling only exists so a pathological queue cannot
 * spin unbounded inside `after()`, whose duration is billed.
 */
const MAX_SKIPS = 200;

/**
 * Queue a drain to run once the response has been flushed.
 *
 * This is what routes call — not `drainNow` directly, and not `after()`
 * directly either.
 *
 * `after()` throws when there is no request scope around it, and the route
 * tests in this repo call handlers as plain functions with a hand-built
 * `NextRequest` (there is no jsdom and no Next server here — see CLAUDE.md).
 * Ten of them went red on `after was called outside a request scope`, which
 * is a fact about the test harness, not about the route. The drain is a
 * post-response optimisation, so skipping it outside a real request changes
 * nothing any of those tests assert.
 *
 * The catch is narrow on purpose: it swallows only the scheduling, never the
 * drain itself, and it says so out loud. If this warning ever shows up in
 * production logs it means mail has silently fallen back to the daily cron.
 */
export function scheduleDrain(requestId?: string): void {
  try {
    after(() => drainNow(requestId));
  } catch (err) {
    log.warn('scheduleDrain: no request scope, falling back to the daily cron', {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Flush the outbox and the email queue right now, best-effort.
 *
 * Exported for the cron routes and for tests; interactive routes go through
 * `scheduleDrain` so the work lands after the response. Returns normally
 * whatever happens.
 */
export async function drainNow(requestId?: string): Promise<void> {
  try {
    // `getEmailQueue()` is null when UPSTASH_* or RESEND_API_KEY are absent.
    // We still drain the outbox in that case: `notification.*` events do not
    // need the mailer, and `email.*` rows reschedule themselves with backoff
    // exactly as they do under the cron.
    const queue = getEmailQueue();

    // exactOptionalPropertyTypes: spread so `emailQueue` is absent rather
    // than present-and-undefined.
    await drainOutbox({ prisma, ...(queue ? { emailQueue: queue } : {}) }, BATCH);

    if (!queue) {
      log.warn('drainNow: no email queue configured, outbox drained only', { requestId });
      return;
    }

    // The budget starts HERE, once the outbox has finished feeding the queue.
    // `do…while` rather than `while`, so one send is always attempted even if
    // stage 1 already ran long — the whole point of this function is to get
    // the mail out, and a drain that never calls `drainOne` is useless.
    const deadline = Date.now() + SEND_BUDGET_MS;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    do {
      const outcome = await queue.drainOne();
      if (outcome === 'empty') break;
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'failed') failed += 1;
      else skipped += 1; // stale pointer — costs no BATCH slot, see MAX_SKIPS
    } while (sent + failed < BATCH && skipped < MAX_SKIPS && Date.now() < deadline);

    // All three counters, always. `sent` alone reads as success when the
    // queue is nothing but stale pointers, and that reading is what let a
    // silent mail outage survive four days of green logs.
    log.info('drainNow', { sent, failed, skipped, requestId });
  } catch (err) {
    // The daily cron is the backstop. Log loudly enough to notice a drain
    // that fails EVERY time — that would mean mail only ever leaves once a
    // day, which looks like "slow email" rather than a broken drain.
    log.warn('drainNow failed; the daily cron will catch up', {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
