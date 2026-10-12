import { describe, expect, it, vi } from 'vitest';
import type { Redis } from '@upstash/redis';
import type { PrismaClient } from '@prisma/client';
import { EmailQueue, type DrainOutcome } from './email-queue';
import type { Mailer } from '../email';

// ---------------------------------------------------------------------------
// A fake Upstash client, list- and zset-shaped, covering exactly the commands
// JobQueue issues: lpush / llen / lrange / lrem / lmove / zadd / zrange /
// zrem / zcard. In-flight bookkeeping matches entries by their exact
// serialized string, so the fake stores strings verbatim.
// ---------------------------------------------------------------------------
function fakeRedis() {
  const lists = new Map<string, string[]>();
  const zsets = new Map<string, Map<string, number>>();
  const list = (k: string) => lists.get(k) ?? (lists.set(k, []), lists.get(k)!);
  const zset = (k: string) => zsets.get(k) ?? (zsets.set(k, new Map()), zsets.get(k)!);

  return {
    lists,
    client: {
      lpush: async (k: string, ...v: string[]) => list(k).unshift(...v),
      llen: async (k: string) => list(k).length,
      lrange: async (k: string, a: number, b: number) =>
        list(k).slice(a, b === -1 ? undefined : b + 1),
      lrem: async (k: string, _count: number, value: string) => {
        const arr = list(k);
        const i = arr.indexOf(value);
        if (i === -1) return 0;
        arr.splice(i, 1);
        return 1;
      },
      lmove: async (from: string, to: string, _wherefrom: string, _whereto: string) => {
        const src = list(from);
        // 'right' -> 'left': FIFO, oldest out first.
        const raw = src.pop();
        if (raw === undefined) return null;
        list(to).unshift(raw);
        return raw;
      },
      zadd: async (k: string, entry: { score: number; member: string }) => {
        zset(k).set(entry.member, entry.score);
        return 1;
      },
      zrange: async (k: string, _min: string, max: number) =>
        [...zset(k).entries()].filter(([, s]) => s <= max).map(([m]) => m),
      zrem: async (k: string, member: string) => (zset(k).delete(member) ? 1 : 0),
      zcard: async (k: string) => zset(k).size,
    } as unknown as Redis,
  };
}

interface Row {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
}

function fakePrisma(rows: Row[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    rows: byId,
    client: {
      emailJob: {
        findUnique: async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          const row = byId.get(where.id);
          if (!row) throw new Error('no such row');
          Object.assign(row, data);
          return row;
        },
        create: async ({ data }: { data: Partial<Row> }) => {
          const row = { id: `row_${byId.size + 1}`, ...data } as Row;
          byId.set(row.id, row);
          return row;
        },
      },
    } as unknown as PrismaClient,
  };
}

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    to: `${id}@example.com`,
    subject: 'Votre code de vérification',
    html: '<p>x</p>',
    text: 'x',
    status: 'PENDING',
    attempts: 0,
    lastError: null,
    sentAt: null,
    ...over,
  };
}

function build(rows: Row[], mailer?: Mailer) {
  const r = fakeRedis();
  const p = fakePrisma(rows);
  const send = vi.fn(async () => ({ id: 'resend_1' }));
  const queue = new EmailQueue({
    redis: r.client,
    prisma: p.client,
    mailer: mailer ?? { send },
  });
  return { queue, redis: r, prisma: p, send };
}

describe('EmailQueue.drainOne', () => {
  it("reports 'empty' on an empty queue", async () => {
    const { queue } = build([]);
    await expect(queue.drainOne()).resolves.toBe('empty');
  });

  it("reports 'sent' and marks the row SENT", async () => {
    const live = row('live');
    const { queue, prisma, send } = build([live]);
    await queue.push({ emailJobId: 'live' });

    await expect(queue.drainOne()).resolves.toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const after = prisma.rows.get('live')!;
    expect(after.status).toBe('SENT');
    expect(after.attempts).toBe(1);
    expect(after.sentAt).toBeInstanceOf(Date);
  });

  // The heart of it. A pointer to a deleted row leaves the queue with no mail
  // sent, and used to be indistinguishable from a send.
  it("reports 'skipped' — not 'sent' — for a pointer whose row is gone", async () => {
    const { queue, send } = build([]);
    await queue.push({ emailJobId: 'deleted-row' });

    await expect(queue.drainOne()).resolves.toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });

  it("reports 'skipped' for a row that is already terminal", async () => {
    const { queue, send } = build([
      row('done', { status: 'SENT' }),
      row('dead', { status: 'DEAD' }),
    ]);
    await queue.push({ emailJobId: 'done' });
    await queue.push({ emailJobId: 'dead' });

    await expect(queue.drainOne()).resolves.toBe('skipped');
    await expect(queue.drainOne()).resolves.toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });

  it("reports 'failed' and records the error when the mailer throws", async () => {
    const send = vi.fn(async () => {
      throw new Error('Resend error: Invalid `to` field');
    });
    const { queue, prisma } = build([row('boom')], { send } as unknown as Mailer);
    await queue.push({ emailJobId: 'boom' });

    await expect(queue.drainOne()).resolves.toBe('failed');
    const after = prisma.rows.get('boom')!;
    expect(after.status).toBe('FAILED');
    expect(after.lastError).toContain('Invalid `to` field');
    // Re-thrown, so JobQueue scheduled a retry rather than acking it.
    expect((await queue.stats()).delayed).toBe(1);
  });

  it('drops a stale pointer instead of leaving it in the queue for ever', async () => {
    const { queue } = build([]);
    await queue.push({ emailJobId: 'deleted-row' });
    await queue.drainOne();
    expect(await queue.stats()).toMatchObject({ pending: 0, inFlight: 0 });
  });

  // The exact shape of the outage: rows deleted while their ids were still
  // queued, the live job stuck behind them.
  it('reaches a live job sitting behind a wall of stale pointers', async () => {
    const { queue, send } = build([row('live')]);
    for (let i = 0; i < 25; i++) await queue.push({ emailJobId: `ghost-${i}` });
    await queue.push({ emailJobId: 'live' });

    const outcomes: DrainOutcome[] = [];
    for (let i = 0; i < 30; i++) {
      const o = await queue.drainOne();
      outcomes.push(o);
      if (o === 'empty') break;
    }

    expect(outcomes.filter((o) => o === 'skipped')).toHaveLength(25);
    expect(outcomes.filter((o) => o === 'sent')).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
