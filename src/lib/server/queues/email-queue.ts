/**
 * EmailQueue — durable email send pipeline.
 *
 * Combines two persistence layers:
 *   1. EmailJob row (Postgres) — full payload + status (PENDING/SENT/FAILED/DEAD).
 *      Survives Redis flushes; queryable for ops dashboards.
 *   2. JobQueue (Redis list) — work-to-do pointer holding only the EmailJob id.
 *      Survives backend restart.
 *
 * `enqueue(input)` writes the row first, then pushes the id. `processNext`
 * loads the row, calls the mailer, then transitions status. Dead-letter
 * marks the row DEAD so an operator can replay it later.
 */
import type { Redis } from '@upstash/redis';
import type { PrismaClient } from '@prisma/client';
import { JobQueue, type QueueJob } from './job-queue';
import type { Mailer, SendEmailInput } from '../email';

export interface EmailJobPayload {
  emailJobId: string;
}

/**
 * What one `drainOne()` call actually did.
 *
 * This used to be a boolean, and the boolean was a bug. A pointer whose
 * EmailJob row no longer exists, and a pointer whose row is already SENT,
 * both leave the queue without any mail moving — yet they were reported the
 * same way as a successful send. Callers counted them as sends: the
 * interactive path logged `drainNow { sent: 1 }` while the user's
 * verification code sat PENDING, and that line is what hid a four-day
 * outage. A caller cannot tell the difference unless the queue says so.
 *
 *   · `empty`   — nothing was waiting. Stop looping.
 *   · `sent`    — the mailer accepted a message. Real work happened.
 *   · `failed`  — a send was attempted and threw. The row is FAILED and the
 *                 job is scheduled for retry or dead-lettered.
 *   · `skipped` — the pointer was stale: the row is gone, or already
 *                 terminal. Nothing was sent and nothing is wrong; the
 *                 pointer is simply dropped.
 */
export type DrainOutcome = 'empty' | 'sent' | 'failed' | 'skipped';

export interface EmailQueueOptions {
  redis: Redis;
  prisma: PrismaClient;
  mailer: Mailer;
  /** Defaults to 5. */
  maxAttempts?: number;
  /** Defaults to "email". */
  name?: string;
  /** Per-attempt backoff. Defaults to 30s, 2m, 10m, 30m, 1h. */
  retryDelaysMs?: readonly number[];
  /** Visibility timeout for stuck jobs. Default 5 min. */
  visibilityMs?: number;
}

const DEFAULT_EMAIL_RETRY_DELAYS_MS: readonly number[] = [
  30_000, // 30s
  2 * 60_000, // 2 min
  10 * 60_000, // 10 min
  30 * 60_000, // 30 min
  60 * 60_000, // 1 h
];

export class EmailQueue extends JobQueue<EmailJobPayload> {
  private readonly prisma: PrismaClient;
  private readonly mailer: Mailer;

  constructor(opts: EmailQueueOptions) {
    super({
      redis: opts.redis,
      name: opts.name ?? 'email',
      maxAttempts: opts.maxAttempts ?? 5,
      retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_EMAIL_RETRY_DELAYS_MS,
      ...(opts.visibilityMs !== undefined ? { visibilityMs: opts.visibilityMs } : {}),
      onDeadLetter: async (job: QueueJob<EmailJobPayload>, lastError: unknown) => {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        try {
          await opts.prisma.emailJob.update({
            where: { id: job.payload.emailJobId },
            data: { status: 'DEAD', lastError: message },
          });
        } catch {
          // Row may have been deleted manually; swallow — already dropped from queue.
        }
      },
    });
    this.prisma = opts.prisma;
    this.mailer = opts.mailer;
  }

  /**
   * Persist the email payload + push the work pointer in one call.
   * Returns the EmailJob row id for callers that want to track status.
   */
  async enqueue(input: SendEmailInput): Promise<string> {
    const data: {
      to: string;
      subject: string;
      html: string;
      status: string;
      text?: string;
    } = {
      to: input.to,
      subject: input.subject,
      html: input.html,
      status: 'PENDING',
    };
    if (input.text !== undefined) data.text = input.text;

    const row = await this.prisma.emailJob.create({ data });
    await this.push({ emailJobId: row.id });
    return row.id;
  }

  /**
   * Drain one job from the queue, and say what happened — see `DrainOutcome`.
   * A caller that only wants "keep going?" compares against `'empty'`.
   */
  async drainOne(): Promise<DrainOutcome> {
    // Captured by the handler below. `processNext` only reports whether a job
    // was claimed, so the outcome has to travel out through the closure.
    let outcome: DrainOutcome = 'skipped';

    const claimed = await this.processNext(async (payload) => {
      const row = await this.prisma.emailJob.findUnique({ where: { id: payload.emailJobId } });
      if (!row) {
        // Row deleted out from under us — nothing to do; ack so it isn't
        // re-enqueued, and report it as skipped rather than as a send.
        outcome = 'skipped';
        return;
      }
      if (row.status === 'SENT' || row.status === 'DEAD') {
        // Idempotent: already terminal.
        outcome = 'skipped';
        return;
      }

      try {
        const sendInput: SendEmailInput = {
          to: row.to,
          subject: row.subject,
          html: row.html,
        };
        if (row.text !== null) sendInput.text = row.text;

        await this.mailer.send(sendInput);

        await this.prisma.emailJob.update({
          where: { id: row.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1 },
        });
        outcome = 'sent';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outcome = 'failed';
        await this.prisma.emailJob.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: message, attempts: row.attempts + 1 },
        });
        // Re-throw so JobQueue increments its own attempts counter and
        // either re-enqueues or dead-letters.
        throw err;
      }
    });

    return claimed ? outcome : 'empty';
  }
}
