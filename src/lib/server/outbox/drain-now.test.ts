import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { DrainOutcome } from '../queues/email-queue';

// `drain-now` reaches for the real Prisma client, the real singleton and the
// real dispatcher at module load, so all three are replaced here. The
// behaviour under test is the loop, not the plumbing.
const drainOne = vi.fn<() => Promise<DrainOutcome>>();
const queueMock = { drainOne };
const getEmailQueue = vi.fn<() => typeof queueMock | null>(() => queueMock);
const drainOutbox = vi.fn(async () => undefined);
const info = vi.fn();
const warn = vi.fn();

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: () => getEmailQueue(),
}));
vi.mock('./dispatcher', () => ({ drainOutbox: (...a: unknown[]) => drainOutbox(...(a as [])) }));
vi.mock('@/lib/server/logger', () => ({ createLogger: () => ({ info, warn, error: vi.fn() }) }));

beforeEach(() => {
  drainOne.mockReset();
  drainOutbox.mockClear();
  info.mockClear();
  warn.mockClear();
  getEmailQueue.mockReturnValue(queueMock);
});

/** The single `drainNow` log line, as an object. */
function reported(): Record<string, unknown> {
  const call = info.mock.calls.find(([msg]) => msg === 'drainNow');
  expect(call, 'drainNow logged nothing').toBeDefined();
  return call![1] as Record<string, unknown>;
}

describe('drainNow', () => {
  it('sends and reports one send', async () => {
    drainOne.mockResolvedValueOnce('sent').mockResolvedValue('empty');
    const { drainNow } = await import('./drain-now');
    await drainNow('req-1');
    expect(reported()).toMatchObject({ sent: 1, failed: 0, skipped: 0, requestId: 'req-1' });
  });

  // The regression. 25 pointers to deleted rows sat ahead of the live job;
  // each signup spent its one drain stepping over a single ghost, logged
  // `sent: 1`, and the real mail waited for a daily cron.
  it('steps over a wall of stale pointers and still gets the live mail out', async () => {
    for (let i = 0; i < 25; i++) drainOne.mockResolvedValueOnce('skipped');
    drainOne.mockResolvedValueOnce('sent').mockResolvedValue('empty');

    const { drainNow } = await import('./drain-now');
    await drainNow();

    expect(reported()).toMatchObject({ sent: 1, skipped: 25 });
  });

  it('never reports a skip as a send', async () => {
    drainOne.mockResolvedValueOnce('skipped').mockResolvedValue('empty');
    const { drainNow } = await import('./drain-now');
    await drainNow();
    expect(reported()).toMatchObject({ sent: 0, skipped: 1 });
  });

  it('spends its batch on real work, not on stale pointers', async () => {
    // Five sends is the batch; the skips before them must not consume it.
    drainOne
      .mockResolvedValueOnce('skipped')
      .mockResolvedValueOnce('skipped')
      .mockResolvedValue('sent');
    const { drainNow } = await import('./drain-now');
    await drainNow();
    expect(reported()).toMatchObject({ sent: 5, skipped: 2 });
    expect(drainOne).toHaveBeenCalledTimes(7);
  });

  it('counts a failed send against the batch, since it did real work', async () => {
    drainOne.mockResolvedValue('failed');
    const { drainNow } = await import('./drain-now');
    await drainNow();
    expect(reported()).toMatchObject({ sent: 0, failed: 5 });
  });

  it('gives up after a bounded number of stale pointers', async () => {
    // A queue that is nothing but ghosts must not loop for ever inside
    // `after()` — the invocation's duration is billed and capped. The bound
    // sits far above any plausible backlog on purpose: set tight, it stopped
    // one call short of the live job in the very case it was written for.
    drainOne.mockResolvedValue('skipped');
    const { drainNow } = await import('./drain-now');
    await drainNow();
    const r = reported();
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(200);
    expect(Number(r.skipped)).toBeGreaterThan(25); // the real backlog we hit
  });

  it('stops as soon as the queue reports empty', async () => {
    drainOne.mockResolvedValue('empty');
    const { drainNow } = await import('./drain-now');
    await drainNow();
    expect(drainOne).toHaveBeenCalledTimes(1);
    expect(reported()).toMatchObject({ sent: 0, failed: 0, skipped: 0 });
  });

  it('drains the outbox and warns, without throwing, when no queue is configured', async () => {
    getEmailQueue.mockReturnValue(null);
    const { drainNow } = await import('./drain-now');
    await expect(drainNow('req-2')).resolves.toBeUndefined();
    expect(drainOutbox).toHaveBeenCalledTimes(1);
    expect(drainOne).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(([m]) => String(m).includes('no email queue configured'))).toBe(
      true,
    );
  });

  it('never throws into its caller when the drain blows up', async () => {
    // It runs inside `after()`: a rejection there is an unhandled rejection,
    // and a failed drain must not turn a successful signup into a 500.
    drainOne.mockRejectedValue(new Error('upstash down'));
    const { drainNow } = await import('./drain-now');
    await expect(drainNow()).resolves.toBeUndefined();
    expect(warn.mock.calls.some(([m]) => String(m).includes('drainNow failed'))).toBe(true);
  });
});
