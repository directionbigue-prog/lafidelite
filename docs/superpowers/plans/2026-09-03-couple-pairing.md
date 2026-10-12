# Signup & Couple Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Espace Couple" invitation and pairing flow (PRD R1) on top of izikit's existing email/password auth — from signup through both partners landing on a paired confirmation screen.

**Architecture:** One new Prisma model (`Couple`) with a 6-digit invite code, four new API route handlers under `/api/couples/*` and `/api/invites/[code]`, a small extension to the existing signup/me routes to add a required `name` field, and six new pages under `frontend/src/app/*` that reuse the kit's existing `@/lib/api` fetch wrapper and `AuthContext`.

**Tech Stack:** Next.js 16 App Router (route handlers + client components), Prisma 5 / PostgreSQL (Neon), Zod, Vitest + `vitest-mock-extended` for route tests, Tailwind v4 (existing `ink`/`cream`/`gold`/`plum`/`wine` tokens from `tailwind.config.ts`).

## Global Constraints

- Auth stays email + password (kit default) — no phone/OTP, no schema change to `User.email`/`passwordHash`.
- `User.name` column stays `String?` in the DB — "required" is enforced only in the signup Zod schema, not a DB migration on that column.
- Invite codes are 6 digits (`000000`–`999999`), matching PRD §9 R1 verbatim ("code à 6 chiffres"), valid 7 days.
- Signup keeps its enumeration-resistant contract (D-22): identical `{ ok: true }` 201 whether the email is new or already registered; inviteCode auto-join only happens on the genuinely-new-user branch.
- One active (`PENDING` or `ACTIVE`) `Couple` per user, enforced applicatively, not via a DB constraint.
- All new UI text is in French, styled with the existing `ink`/`cream`/`gold` palette and `font-serif`/`font-grotesk` — no generic `gray-*` Tailwind classes (that's the `examples/frontend-pages/*` placeholder style, not this product's).
- Every new/modified route: `export const runtime = 'nodejs'`, wrapped in `makeRequestContext` / `withRequestContext`, `'server-only'` import — matching every existing route in `frontend/src/app/api/**`.
- Prisma CLI does **not** read `frontend/.env.local` automatically (only Next.js does) — every migration command below injects `DATABASE_URL`/`DIRECT_URL` explicitly.

---

## Task 1: `Couple` Prisma model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create (generated): `frontend/prisma/migrations/<timestamp>_couple_pairing/migration.sql`
  (Prisma prefixes new migrations with a `YYYYMMDDHHMMSS` timestamp — the
  existing `0_init`, `1_oauth_accounts`, … folders were renamed by hand at
  some point in this repo's history; don't try to match that numbering,
  just let Prisma generate its normal timestamped folder name.)

**Interfaces:**
- Produces: `Couple` model with fields `id, status, creatorId, creator, partnerId, partner, inviteCode, inviteExpiresAt, pairedAt, dissolvedAt, createdAt, updatedAt`; `User.createdCouples` / `User.joinedCouples` inverse relations.

- [ ] **Step 1: Add the `Couple` model and `User` relations**

Open `frontend/prisma/schema.prisma`. Add these two fields inside `model User { ... }`, right after the existing `memberships` relation line (before the closing `@@index` block):

```prisma
  createdCouples     Couple[]            @relation("CoupleCreator")
  joinedCouples       Couple[]            @relation("CouplePartner")
```

Then append this new model at the end of the file:

```prisma
// ───────────────────────────────────────────────────────────────────────
// Cœur Fidèle — "Espace Couple" pairing (PRD §9 R1).
//
// One row per pairing attempt. `status`:
//   PENDING   — creator has generated an invite, waiting for a partner.
//   ACTIVE    — partner joined; the couple is live.
//   DISSOLVED — reserved for a future "leave/dissolve" flow (not exposed
//               by any endpoint yet — see PRUNING note in the design spec).
//
// "One active couple per user" is enforced applicatively (see
// lib/server/couples/queries.ts), not by a DB constraint — a DISSOLVED
// couple must be able to coexist with a new PENDING/ACTIVE one for the
// same user, which a unique index on creatorId/partnerId can't express.
// ───────────────────────────────────────────────────────────────────────
model Couple {
  id              String    @id @default(cuid())
  status          String    @default("PENDING") // PENDING | ACTIVE | DISSOLVED
  creatorId       String
  creator         User      @relation("CoupleCreator", fields: [creatorId], references: [id], onDelete: Restrict)
  partnerId       String?
  partner         User?     @relation("CouplePartner", fields: [partnerId], references: [id], onDelete: Restrict)
  inviteCode      String    @unique
  inviteExpiresAt DateTime
  pairedAt        DateTime?
  dissolvedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([creatorId])
  @@index([partnerId])
  @@index([inviteCode])
}
```

- [ ] **Step 2: Format and validate the schema**

Run: `cd frontend && npx prisma format`
Expected: exits 0, no output other than the reformatted file (Prisma auto-aligns the column spacing you just hand-typed).

- [ ] **Step 3: Generate the migration and apply it to Neon**

Prisma's CLI does not read `.env.local`. Run from the repo root:

```bash
node -e '
const fs = require("fs");
const raw = fs.readFileSync("frontend/.env.local", "utf8");
const env = { ...process.env };
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const { execSync } = require("child_process");
execSync("npx prisma migrate dev --name couple_pairing", { stdio: "inherit", env, cwd: "frontend" });
'
```

Expected: `Applying migration `<timestamp>_couple_pairing`` ... `Your database is now in sync with your schema.` A new
`frontend/prisma/migrations/<timestamp>_couple_pairing/migration.sql` file appears on disk (`CREATE TABLE "Couple" ...`) — note the actual folder name for the commit step below.

- [ ] **Step 4: Regenerate the Prisma Client and typecheck**

Run: `cd frontend && npx prisma generate && npx tsc --noEmit`
Expected: `✔ Generated Prisma Client` then no `tsc` output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "Add Couple model for Espace Couple pairing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Couple domain helpers (invite code + active-couple lookup)

**Files:**
- Create: `frontend/src/lib/server/couples/invite-code.ts`
- Create: `frontend/src/lib/server/couples/queries.ts`
- Test: `frontend/src/lib/server/couples/invite-code.test.ts`
- Test: `frontend/src/lib/server/couples/queries.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/server/prisma` (type only, for `queries.ts`'s `tx` parameter type).
- Produces: `generateInviteCode(): string`, `INVITE_TTL_MS: number` (7 days in ms), `INVITE_CODE_REGEX: RegExp` from `invite-code.ts`. `findActiveCoupleForUser(tx, userId: string): Promise<{ id: string } | null>` from `queries.ts` — used by Tasks 5 and 7.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/couples/invite-code.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateInviteCode, INVITE_CODE_REGEX, INVITE_TTL_MS } from './invite-code';

describe('generateInviteCode', () => {
  it('returns a 6-digit numeric string', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toMatch(INVITE_CODE_REGEX);
  });

  it('produces varied output across many calls (not a constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('zero-pads values below 100000', () => {
    // Statistically near-certain within a handful of tries; if this ever
    // flakes, the padding logic is broken, not the test.
    let sawPadded = false;
    for (let i = 0; i < 500; i++) {
      if (generateInviteCode().startsWith('0')) {
        sawPadded = true;
        break;
      }
    }
    expect(sawPadded).toBe(true);
  });
});

describe('INVITE_TTL_MS', () => {
  it('is exactly 7 days', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
```

Create `frontend/src/lib/server/couples/queries.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { findActiveCoupleForUser } from './queries';

describe('findActiveCoupleForUser', () => {
  it('queries for PENDING/ACTIVE couples where the user is creator or partner', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({ id: 'c1' } as never);
    const result = await findActiveCoupleForUser(prismaMock, 'user-1');
    expect(result).toEqual({ id: 'c1' });
    expect(prismaMock.couple.findFirst).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDING', 'ACTIVE'] },
        OR: [{ creatorId: 'user-1' }, { partnerId: 'user-1' }],
      },
      select: { id: true },
    });
  });

  it('returns null when the user has no active couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const result = await findActiveCoupleForUser(prismaMock, 'user-2');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/server/couples/ -t ""`
Expected: FAIL — `Cannot find module './invite-code'` and `'./queries'` (files don't exist yet).

- [ ] **Step 3: Implement `invite-code.ts`**

```typescript
// Invite code for the "Espace Couple" pairing flow (PRD §9 R1 — "code à 6
// chiffres"). Deliberately numeric-only and short: it's meant to be
// readable off a phone screen and typed by hand as a fallback to the
// invite link, not to carry cryptographic entropy on its own — the DB
// unique constraint plus a 7-day TTL is the actual security boundary.
import crypto from 'node:crypto';

export const INVITE_CODE_REGEX = /^\d{6}$/;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}
```

- [ ] **Step 4: Implement `queries.ts`**

```typescript
// Shared "does this user already have an active Espace Couple" check.
// Used by both POST /api/couples (create) and POST /api/couples/join —
// a user may be creator or partner of at most one PENDING/ACTIVE couple
// at a time (PRD §9 R1: "un seul utilisateur ne peut appartenir qu'à un
// seul Espace Couple actif").
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export async function findActiveCoupleForUser(
  client: QueryClient,
  userId: string,
): Promise<{ id: string } | null> {
  return client.couple.findFirst({
    where: {
      status: { in: ['PENDING', 'ACTIVE'] },
      OR: [{ creatorId: userId }, { partnerId: userId }],
    },
    select: { id: true },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/server/couples/`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/couples/
git commit -m "Add couple invite-code generator and active-couple lookup helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Extend signup with `name` + invite auto-join

**Files:**
- Modify: `frontend/src/app/api/auth/signup/route.ts`
- Modify: `frontend/src/app/api/auth/signup/route.test.ts`

**Interfaces:**
- Consumes: `generateInviteCode` is NOT used here (signup only *joins* an existing invite, never creates one). Uses `findActiveCoupleForUser`? No — the new user can never already have a couple, so that check is skipped here; it's the join-endpoint's job (Task 7) and the create-endpoint's job (Task 5).
- Produces: no change to the route's public response shape (`{ ok: true }`, 201) — `name` and `inviteCode` are new **input** fields only.

- [ ] **Step 1: Write the failing tests**

Add these cases to `frontend/src/app/api/auth/signup/route.test.ts`, inside the existing `describe('POST /api/auth/signup', ...)` block (after the last `it(...)`):

```typescript
  it('rejects signup without a name with VALIDATION_FAILED', async () => {
    const res = await POST(makeReq({ email: 'noname@example.com', password: 'a-strong-passphrase' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('creates the user with name when a valid inviteCode is absent', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-new' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);

    const res = await POST(
      makeReq({ email: 'awa@example.com', password: 'a-strong-passphrase', name: 'Awa' }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.user.create.mock.calls[0]?.[0];
    expect(createArg?.data?.name).toBe('Awa');
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });

  it('auto-joins a PENDING couple when inviteCode is valid and unexpired', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-partner' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);
    prismaMock.couple.findFirst.mockResolvedValue({
      id: 'c1',
      inviteExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    prismaMock.couple.update.mockResolvedValue({} as never);

    const res = await POST(
      makeReq({
        email: 'karim@example.com',
        password: 'a-strong-passphrase',
        name: 'Karim',
        inviteCode: '123456',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.couple.findFirst).toHaveBeenCalledWith({
      where: { inviteCode: '123456', status: 'PENDING' },
      select: { id: true, inviteExpiresAt: true },
    });
    expect(prismaMock.couple.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { partnerId: 'u-partner', status: 'ACTIVE', pairedAt: expect.any(Date) },
    });
  });

  it('creates the user but silently skips joining when inviteCode is expired', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-late' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);
    prismaMock.couple.findFirst.mockResolvedValue({
      id: 'c1',
      inviteExpiresAt: new Date(Date.now() - 60_000),
    } as never);

    const res = await POST(
      makeReq({
        email: 'late@example.com',
        password: 'a-strong-passphrase',
        name: 'Late',
        inviteCode: '654321',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });

  it('creates the user but silently skips joining when inviteCode does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-bad' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);
    prismaMock.couple.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeReq({
        email: 'bad@example.com',
        password: 'a-strong-passphrase',
        name: 'Bad',
        inviteCode: '000000',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });
```

Also update the two pre-existing passing tests (`'creates a new user...'` and the rate-limit test) to include `name: 'Test'` in their request bodies, since `name` is now required — without this they'll start failing with `VALIDATION_FAILED` once Step 3 lands.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd frontend && npx vitest run src/app/api/auth/signup/`
Expected: FAIL — `name` not in `Body` schema, `inviteCode` branch doesn't exist yet.

- [ ] **Step 3: Implement the route changes**

In `frontend/src/app/api/auth/signup/route.ts`:

Change the `Body` schema:

```typescript
const Body = z.object({
  email: zEmail,
  password: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  inviteCode: z.string().regex(/^\d{6}$/).optional(),
});
```

Change the destructure at the top of step 2 (`const { email, password } = parsed.data;`) to:

```typescript
    const { email, password, name, inviteCode } = parsed.data;
```

Replace the new-user transaction (step 5) with:

```typescript
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, name },
        select: { id: true },
      });
      await tx.verificationCode.create({
        data: {
          userId: user.id,
          code,
          type: 'EMAIL_VERIFY',
          expiresAt,
        },
      });
      await enqueueOutbox(tx, {
        kind: 'email.verification_code',
        payload: {
          to: email,
          code,
          expiresAt: expiresAt.toISOString(),
        },
      });

      // Auto-join an invite, if one was supplied and is still valid. Never
      // fails the signup over a bad/expired code (D-22-adjacent: a signup
      // that 500s or 400s here would leak invite-validity information and
      // block a legitimate account creation over an unrelated concern).
      if (inviteCode) {
        const couple = await tx.couple.findFirst({
          where: { inviteCode, status: 'PENDING' },
          select: { id: true, inviteExpiresAt: true },
        });
        if (couple && couple.inviteExpiresAt.getTime() > Date.now()) {
          await tx.couple.update({
            where: { id: couple.id },
            data: { partnerId: user.id, status: 'ACTIVE', pairedAt: new Date() },
          });
        }
      }
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/auth/signup/`
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/auth/signup/
git commit -m "Add required name + optional invite auto-join to signup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Surface `name` on `/api/auth/me` and in `AuthContext`

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts`
- Modify: `frontend/src/app/api/auth/me/route.test.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`

**Interfaces:**
- Produces: `User.name: string | null` — added to the `AuthContext`'s exported `User` interface, consumed by Tasks 11 and 13 (`/couple/creer`, `/couple/apparies`) via `useAuth().user.name`.

- [ ] **Step 1: Write the failing test**

Find the existing test in `frontend/src/app/api/auth/me/route.test.ts` that asserts the full success-response shape (search for `emailVerifiedAt` in the expected body) and add a `name` assertion next to it:

```typescript
    expect(body.user.name).toBe('Awa');
```

Update that test's `prismaMock.user.findUnique` mock to include `name: 'Awa'` in the resolved object.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/app/api/auth/me/`
Expected: FAIL — `body.user.name` is `undefined`.

- [ ] **Step 3: Add `name` to the route's select + response**

In `frontend/src/app/api/auth/me/route.ts`, add `name: true` to the `select` object (next to `email: true`), and add `name: dbUser?.name ?? null,` to the `user` response object (next to the `email` line).

- [ ] **Step 4: Add `name` to the `AuthContext` `User` interface**

In `frontend/src/contexts/AuthContext.tsx`, add to the `User` interface (after `email: string;`):

```typescript
  name: string | null;
```

- [ ] **Step 5: Run the test to verify it passes, then typecheck**

Run: `cd frontend && npx vitest run src/app/api/auth/me/ && npx tsc --noEmit`
Expected: test passes; no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/auth/me/ frontend/src/contexts/AuthContext.tsx
git commit -m "Surface user.name on /api/auth/me and AuthContext

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `POST /api/couples` (create)

**Files:**
- Create: `frontend/src/app/api/couples/route.ts`
- Create: `frontend/src/app/api/couples/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/server/middleware`; `findActiveCoupleForUser` from `@/lib/server/couples/queries` (Task 2); `generateInviteCode`, `INVITE_TTL_MS` from `@/lib/server/couples/invite-code` (Task 2).
- Produces: `POST /api/couples` → `201 { id, code, inviteUrl, expiresAt }` or `409 { error: 'ALREADY_IN_COUPLE' }` — consumed by Task 12 (`/couple/creer`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/couples/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/couples', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://coeurfidele.test';
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
});

describe('POST /api/couples', () => {
  it('creates a PENDING couple and returns the invite', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    prismaMock.couple.create.mockResolvedValue({
      id: 'c1',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c1',
      code: '123456',
      inviteUrl: 'https://coeurfidele.test/invite/123456',
      expiresAt: '2026-09-10T00:00:00.000Z',
    });
    expect(prismaMock.couple.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.couple.create.mock.calls[0]?.[0];
    expect(createArg?.data?.creatorId).toBe('user-1');
    expect(createArg?.data?.status).toBe('PENDING');
  });

  it('returns 409 ALREADY_IN_COUPLE when the user already has an active couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({ id: 'existing' } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_IN_COUPLE');
    expect(prismaMock.couple.create).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("source exports runtime = 'nodejs'", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/api/couples/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/couples/route.ts`:

```typescript
// POST /api/couples — create an "Espace Couple" (PRD §9 R1).
//
// The authenticated caller becomes the couple's creator, in PENDING status,
// with a fresh 6-digit invite code valid 7 days. A user may only have one
// PENDING/ACTIVE couple at a time (findActiveCoupleForUser).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActiveCoupleForUser } from '@/lib/server/couples/queries';
import { generateInviteCode, INVITE_TTL_MS } from '@/lib/server/couples/invite-code';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const existing = await findActiveCoupleForUser(prisma, auth.user.sub);
    if (existing) {
      return NextResponse.json(
        { error: 'ALREADY_IN_COUPLE', message: 'You already belong to an Espace Couple.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await prisma.couple.create({
      data: {
        creatorId: auth.user.sub,
        status: 'PENDING',
        inviteCode: generateInviteCode(),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, inviteCode: true, inviteExpiresAt: true },
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return NextResponse.json(
      {
        id: couple.id,
        code: couple.inviteCode,
        inviteUrl: `${appUrl}/invite/${couple.inviteCode}`,
        expiresAt: couple.inviteExpiresAt.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/couples/route.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/couples/route.ts frontend/src/app/api/couples/route.test.ts
git commit -m "Add POST /api/couples to create an Espace Couple

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `GET /api/couples/me`

**Files:**
- Create: `frontend/src/app/api/couples/me/route.ts`
- Create: `frontend/src/app/api/couples/me/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth`.
- Produces: `GET /api/couples/me` → `200 { couple: null | { status: 'PENDING', code, inviteUrl, expiresAt } | { status: 'ACTIVE', partnerName, pairedAt } }` — consumed by Tasks 12, 13, 14 (`/couple/creer`, `/couple/attente`, `/couple/apparies`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/couples/me/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/couples/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://coeurfidele.test';
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
});

describe('GET /api/couples/me', () => {
  it('returns { couple: null } when the user has no couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ couple: null });
  });

  it('returns PENDING with the invite when the user is the creator awaiting a partner', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'PENDING',
      creatorId: 'user-1',
      partnerId: null,
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: null,
      creator: { name: 'Awa' },
      partner: null,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      couple: {
        status: 'PENDING',
        code: '123456',
        inviteUrl: 'https://coeurfidele.test/invite/123456',
        expiresAt: '2026-09-10T00:00:00.000Z',
      },
    });
  });

  it('returns ACTIVE with the other partner name when paired', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      couple: { status: 'ACTIVE', partnerName: 'Karim', pairedAt: '2026-09-04T00:00:00.000Z' },
    });
  });

  it('shows the creator name when the CURRENT user is the partner', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-2', email: 'karim@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.couple.partnerName).toBe('Awa');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/api/couples/me/`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/couples/me/route.ts`:

```typescript
// GET /api/couples/me — current user's Espace Couple status.
//
// Polled every 3s by the /couple/attente waiting screen (no WebSocket for
// this lot — see design spec "hors périmètre"). Shape depends on status:
//   no couple → { couple: null }
//   PENDING   → the invite (code + link), so the waiting screen can render
//               without a second round-trip
//   ACTIVE    → the OTHER person's name (creator sees partner's, and
//               vice versa), so the confirmation screen can greet both.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const userId = auth.user.sub;
    const couple = await prisma.couple.findFirst({
      where: {
        status: { in: ['PENDING', 'ACTIVE'] },
        OR: [{ creatorId: userId }, { partnerId: userId }],
      },
      select: {
        status: true,
        creatorId: true,
        partnerId: true,
        inviteCode: true,
        inviteExpiresAt: true,
        pairedAt: true,
        creator: { select: { name: true } },
        partner: { select: { name: true } },
      },
    });

    if (!couple) {
      return NextResponse.json({ couple: null }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
    }

    if (couple.status === 'PENDING') {
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      return NextResponse.json(
        {
          couple: {
            status: 'PENDING' as const,
            code: couple.inviteCode,
            inviteUrl: `${appUrl}/invite/${couple.inviteCode}`,
            expiresAt: couple.inviteExpiresAt.toISOString(),
          },
        },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // ACTIVE — show the OTHER person's name.
    const partnerName = couple.creatorId === userId ? (couple.partner?.name ?? null) : couple.creator.name;
    return NextResponse.json(
      {
        couple: {
          status: 'ACTIVE' as const,
          partnerName,
          pairedAt: couple.pairedAt?.toISOString() ?? null,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/couples/me/`
Expected: all 4 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/couples/me/
git commit -m "Add GET /api/couples/me for pairing status polling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `POST /api/couples/join`

**Files:**
- Create: `frontend/src/app/api/couples/join/route.ts`
- Create: `frontend/src/app/api/couples/join/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `findActiveCoupleForUser` (Task 2), `createEmailLimiter` from `@/lib/server/middleware/rate-limit-by-email` (reused generically, keyed on userId instead of email — brute-forcing a 6-digit code against a logged-in session is the threat this closes).
- Produces: `POST /api/couples/join` `{ code }` → `200 { id, status: 'ACTIVE', partnerName, pairedAt }` or one of `400 VALIDATION_FAILED | 400 CANNOT_JOIN_OWN_COUPLE | 404 INVITE_NOT_FOUND | 410 INVITE_EXPIRED | 409 INVITE_ALREADY_USED | 409 ALREADY_IN_COUPLE` — consumed by Task 15 (`/invite/[code]`, for the already-logged-in case).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/couples/join/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/couples/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-2', email: 'karim@example.com' },
  });
});

describe('POST /api/couples/join', () => {
  it('joins a PENDING, unexpired couple', async () => {
    prismaMock.couple.findFirst
      .mockResolvedValueOnce(null) // findActiveCoupleForUser(joiner)
      .mockResolvedValueOnce({
        id: 'c1',
        creatorId: 'user-1',
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 60_000),
      } as never); // the invite lookup
    prismaMock.couple.update.mockResolvedValue({
      id: 'c1',
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      creator: { name: 'Awa' },
    } as never);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c1',
      status: 'ACTIVE',
      partnerName: 'Awa',
      pairedAt: '2026-09-04T00:00:00.000Z',
    });
    expect(prismaMock.couple.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { partnerId: 'user-2', status: 'ACTIVE', pairedAt: expect.any(Date) },
      select: { id: true, pairedAt: true, creator: { select: { name: true } } },
    });
  });

  it('returns 400 VALIDATION_FAILED for a non-6-digit code', async () => {
    const res = await POST(makeReq({ code: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('returns 409 ALREADY_IN_COUPLE when the joiner already has a couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_IN_COUPLE');
  });

  it('returns 404 INVITE_NOT_FOUND for an unknown code', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ code: '999999' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVITE_NOT_FOUND');
  });

  it('returns 410 INVITE_EXPIRED for an expired code', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'PENDING',
      inviteExpiresAt: new Date(Date.now() - 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('INVITE_EXPIRED');
  });

  it('returns 409 INVITE_ALREADY_USED when the couple is no longer PENDING', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'ACTIVE',
      inviteExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVITE_ALREADY_USED');
  });

  it('returns 400 CANNOT_JOIN_OWN_COUPLE when the creator tries to join their own invite', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-1', email: 'awa@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'PENDING',
      inviteExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CANNOT_JOIN_OWN_COUPLE');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/api/couples/join/`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/couples/join/route.ts`:

```typescript
// POST /api/couples/join — join an existing Espace Couple by 6-digit code.
//
// For an already-authenticated user (e.g. they already had an account and
// logged in before using the invite — see design spec §"Invité sans
// compte"). The brand-new-account path is handled inline by
// POST /api/auth/signup instead (Task 3) so it can join atomically with
// account creation.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActiveCoupleForUser } from '@/lib/server/couples/queries';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ code: z.string().regex(/^\d{6}$/) });

// Reused generically, keyed on userId (the "email" param is just a bucket
// key) — closes the "try many codes while logged in" brute-force path
// against the 1M-value code space.
const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'couples:join',
  windowMs: 60 * 1000,
  max: 10,
  code: 'TOO_MANY_JOIN_ATTEMPTS',
  message: 'Too many join attempts. Try again in a minute.',
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const rl = await limiter.check(req, userId);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { code } = parsed.data;

    const already = await findActiveCoupleForUser(prisma, userId);
    if (already) {
      return NextResponse.json(
        { error: 'ALREADY_IN_COUPLE', message: 'You already belong to an Espace Couple.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await prisma.couple.findFirst({
      where: { inviteCode: code },
      select: { id: true, creatorId: true, status: true, inviteExpiresAt: true },
    });
    if (!couple) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND', message: 'This invite code does not exist.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (couple.creatorId === userId) {
      return NextResponse.json(
        { error: 'CANNOT_JOIN_OWN_COUPLE', message: 'You cannot join your own invite.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (couple.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'INVITE_ALREADY_USED', message: 'This invite has already been used.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (couple.inviteExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'INVITE_EXPIRED', message: 'This invite has expired.' },
        { status: 410, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.couple.update({
      where: { id: couple.id },
      data: { partnerId: userId, status: 'ACTIVE', pairedAt: new Date() },
      select: { id: true, pairedAt: true, creator: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        id: updated.id,
        status: 'ACTIVE' as const,
        partnerName: updated.creator.name,
        pairedAt: updated.pairedAt?.toISOString() ?? null,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/couples/join/`
Expected: all 7 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/couples/join/
git commit -m "Add POST /api/couples/join to pair with an existing account

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `GET /api/invites/[code]` (public)

**Files:**
- Create: `frontend/src/app/api/invites/[code]/route.ts`
- Create: `frontend/src/app/api/invites/[code]/route.test.ts`

**Interfaces:**
- Consumes: nothing auth-related (public route).
- Produces: `GET /api/invites/[code]` → always `200 { valid: true, creatorName: string | null } | { valid: false, expired: boolean }` — consumed by Task 15 (`/invite/[code]`) and Task 9 (`/inscription?invite=`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/invites/[code]/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeReq(code: string): { req: NextRequest; ctx: { params: Promise<{ code: string }> } } {
  return {
    req: new NextRequest(`http://test/api/invites/${code}`),
    ctx: { params: Promise.resolve({ code }) },
  };
}

describe('GET /api/invites/[code]', () => {
  it('returns valid: true with the creator name for a live PENDING invite', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      inviteExpiresAt: new Date(Date.now() + 60_000),
      creator: { name: 'Awa' },
    } as never);
    const { req, ctx } = makeReq('123456');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true, creatorName: 'Awa' });
  });

  it('returns valid: false, expired: false for an unknown code', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const { req, ctx } = makeReq('000000');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, expired: false });
  });

  it('returns valid: false, expired: true for an expired invite', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      inviteExpiresAt: new Date(Date.now() - 60_000),
      creator: { name: 'Awa' },
    } as never);
    const { req, ctx } = makeReq('123456');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, expired: true });
  });

  it('rejects a malformed code with valid: false, expired: false without hitting the DB', async () => {
    const { req, ctx } = makeReq('abc');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, expired: false });
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/api/invites/`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/invites/[code]/route.ts`:

```typescript
// GET /api/invites/[code] — PUBLIC, no auth. Lets the /invite/[code] and
// /inscription pages show "X t'invite" (or "this link expired") before the
// visitor has an account. Never leaks anything beyond the creator's first
// name — no email, no user id, no couple id.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { INVITE_CODE_REGEX } from '@/lib/server/couples/invite-code';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { code } = await ctx.params;
    if (!INVITE_CODE_REGEX.test(code)) {
      return NextResponse.json(
        { valid: false, expired: false },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const couple = await prisma.couple.findFirst({
      where: { inviteCode: code, status: 'PENDING' },
      select: { inviteExpiresAt: true, creator: { select: { name: true } } },
    });

    if (!couple) {
      return NextResponse.json(
        { valid: false, expired: false },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (couple.inviteExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { valid: false, expired: true },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { valid: true, creatorName: couple.creator.name },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/api/invites/`
Expected: all 4 tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/invites/
git commit -m "Add public GET /api/invites/[code] for pre-signup invite preview

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `/inscription` page

**Files:**
- Create: `frontend/src/app/inscription/page.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError` from `@/lib/api`; `POST /api/auth/signup` (Task 3) with `{ email, password, name, inviteCode? }`; `GET /api/invites/[code]` (Task 8) shape `{ valid, creatorName? }` — read via the `?invite=` query param.
- Produces: navigates to `/verify-email?email=...` on success (existing route, unmodified — no `examples/frontend-pages/verify-email.tsx` changes needed for this plan).

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/inscription/page.tsx`:

```tsx
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface InviteInfo {
  valid: boolean;
  creatorName?: string;
  expired?: boolean;
}

export default function InscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    api<InviteInfo>(`/api/invites/${inviteCode}`)
      .then(setInvite)
      .catch(() => setInvite({ valid: false, expired: false }));
  }, [inviteCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          name,
          ...(inviteCode && invite?.valid ? { inviteCode } : {}),
        },
      });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 bg-ink font-grotesk text-cream">
      <div>
        <h1 className="font-serif text-3xl">Créer votre compte</h1>
        {inviteCode && invite?.valid && (
          <p className="mt-3 rounded-2xl border border-gold/34 bg-plum-card px-4 py-3 text-sm text-gold">
            {invite.creatorName ?? 'Votre partenaire'} vous invite à rejoindre Cœur Fidèle.
          </p>
        )}
        {inviteCode && invite && !invite.valid && (
          <p className="mt-3 rounded-2xl border border-cream/16 bg-plum-card px-4 py-3 text-sm text-cream/66">
            {invite.expired
              ? "Ce lien d'invitation a expiré, mais vous pouvez créer votre compte quand même."
              : "Ce lien d'invitation n'est plus valide, mais vous pouvez créer votre compte quand même."}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Prénom
          <input
            type="text"
            required
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-cream/20 bg-plum-card px-4 py-2.5 text-cream outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-cream/20 bg-plum-card px-4 py-2.5 text-cream outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Mot de passe
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-cream/20 bg-plum-card px-4 py-2.5 text-cream outline-none focus:border-gold"
          />
          <span className="text-xs text-cream/50">Au moins 10 caractères.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-wine">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gold px-5 py-3 text-sm font-bold text-ink hover:bg-cream disabled:opacity-50"
        >
          {submitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>

      <p className="text-sm text-cream/60">
        Déjà un compte ?{' '}
        <Link href="/connexion" className="text-gold hover:text-cream">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/inscription/`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `cd frontend && npx next dev --port 3010 --turbopack` (background), then open
`http://localhost:3010/inscription` — form renders on the dark theme. Stop the server after checking.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/inscription/
git commit -m "Add /inscription page with invite-aware signup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: `/connexion` page

**Files:**
- Create: `frontend/src/app/connexion/page.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `storeCsrfToken` from `@/lib/api`; `useAuth().refresh` from `@/contexts/AuthContext`; `POST /api/auth/login` (existing, unmodified).
- Produces: navigates to `/couple/creer` on success (the router for "where does a logged-in user land" — Task 12 handles branching to `/couple/attente` / `/couple/apparies` from there).

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/connexion/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function ConnexionPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/couple/creer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 bg-ink font-grotesk text-cream">
      <h1 className="font-serif text-3xl">Se connecter</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-cream/20 bg-plum-card px-4 py-2.5 text-cream outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Mot de passe
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-cream/20 bg-plum-card px-4 py-2.5 text-cream outline-none focus:border-gold"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-wine">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gold px-5 py-3 text-sm font-bold text-ink hover:bg-cream disabled:opacity-50"
        >
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="text-sm text-cream/60">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="text-gold hover:text-cream">
          Créer un compte
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/connexion/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/connexion/
git commit -m "Add /connexion login page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: `/couple/creer` page

**Files:**
- Create: `frontend/src/app/couple/creer/page.tsx`

**Interfaces:**
- Consumes: `useUser` from `@/contexts/AuthContext` (redirects to `/connexion` if logged out); `api` from `@/lib/api`; `GET /api/couples/me` (Task 6); `POST /api/couples` (Task 5).
- Produces: redirects to `/couple/attente` (Task 13) or `/couple/apparies` (Task 14).

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/couple/creer/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';

interface CoupleStatus {
  couple: null | { status: 'PENDING' } | { status: 'ACTIVE' };
}

export default function CreerCouplePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<CoupleStatus>('/api/couples/me')
      .then((res) => {
        if (res.couple?.status === 'PENDING') {
          router.replace('/couple/attente');
        } else if (res.couple?.status === 'ACTIVE') {
          router.replace('/couple/apparies');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [user, router]);

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      await api('/api/couples', { method: 'POST' });
      router.push('/couple/attente');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      setCreating(false);
    }
  }

  if (!user || checking) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center bg-ink font-grotesk text-cream">
      <h1 className="font-serif text-3xl">
        Bienvenue, <em className="text-gold not-italic">{user.name ?? user.email}</em>
      </h1>
      <p className="text-cream/70">
        Créez votre Espace Couple et invitez votre partenaire à vous rejoindre.
      </p>
      {error && (
        <p role="alert" className="text-sm text-wine">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="rounded-full bg-gold px-8 py-4 text-base font-bold text-ink hover:bg-cream disabled:opacity-50"
      >
        {creating ? 'Création…' : 'Créer notre Espace Couple'}
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/couple/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/couple/creer/
git commit -m "Add /couple/creer page to start an Espace Couple

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: `/couple/attente` page

**Files:**
- Create: `frontend/src/app/couple/attente/page.tsx`

**Interfaces:**
- Consumes: `useUser`; `api`; `GET /api/couples/me` (Task 6), polled every 3s.
- Produces: redirects to `/couple/apparies` (Task 14) once `status === 'ACTIVE'`.

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/couple/attente/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';

interface CoupleStatus {
  couple:
    | null
    | { status: 'PENDING'; code: string; inviteUrl: string; expiresAt: string }
    | { status: 'ACTIVE' };
}

const POLL_MS = 3000;

export default function AttenteCouplePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [invite, setInvite] = useState<{ code: string; inviteUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await api<CoupleStatus>('/api/couples/me');
        if (cancelled) return;
        if (!res.couple) {
          router.replace('/couple/creer');
          return;
        }
        if (res.couple.status === 'ACTIVE') {
          router.replace('/couple/apparies');
          return;
        }
        setInvite({ code: res.couple.code, inviteUrl: res.couple.inviteUrl });
      } catch {
        // Network hiccup — silently retry on the next tick (design spec:
        // no intrusive error UI while polling).
      }
    }

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, router]);

  async function copyLink() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!user || !invite) return null;

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `Rejoins-moi sur Cœur Fidèle : ${invite.inviteUrl}`,
  )}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center bg-ink font-grotesk text-cream">
      <h1 className="font-serif text-3xl">En attente de votre partenaire</h1>
      <p className="text-cream/70">Partagez ce lien ou ce code pour qu&rsquo;il/elle vous rejoigne.</p>

      <div className="w-full rounded-2xl border border-cream/16 bg-plum-card p-6">
        <div className="mb-1 text-xs uppercase tracking-[0.14em] text-cream/50">Code</div>
        <div className="font-serif text-4xl tracking-[0.2em] text-gold">{invite.code}</div>
      </div>

      <button
        type="button"
        onClick={copyLink}
        className="w-full rounded-full border border-cream/26 px-6 py-3 text-sm font-semibold text-cream hover:border-gold"
      >
        {copied ? 'Lien copié !' : 'Copier le lien'}
      </button>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noreferrer"
        className="w-full rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink hover:bg-cream"
      >
        Relancer sur WhatsApp
      </a>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/couple/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/couple/attente/
git commit -m "Add /couple/attente waiting screen with polling + WhatsApp relance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: `/couple/apparies` page

**Files:**
- Create: `frontend/src/app/couple/apparies/page.tsx`

**Interfaces:**
- Consumes: `useUser`; `api`; `GET /api/couples/me` (Task 6).
- Produces: terminal screen for this lot — no further navigation.

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/couple/apparies/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';

interface CoupleStatus {
  couple: null | { status: 'PENDING' } | { status: 'ACTIVE'; partnerName: string | null };
}

export default function AppariesCouplePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [partnerName, setPartnerName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    api<CoupleStatus>('/api/couples/me')
      .then((res) => {
        if (res.couple?.status === 'ACTIVE') {
          setPartnerName(res.couple.partnerName);
        } else if (res.couple?.status === 'PENDING') {
          router.replace('/couple/attente');
        } else {
          router.replace('/couple/creer');
        }
      })
      .catch(() => setPartnerName(null));
  }, [user, router]);

  if (!user || partnerName === undefined) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center bg-ink font-grotesk text-cream">
      <div className="mb-2 text-5xl">💛</div>
      <h1 className="font-serif text-4xl">Vous êtes appariés !</h1>
      <p className="text-lg text-cream/80">
        <em className="text-gold not-italic">{user.name ?? 'Vous'}</em> et{' '}
        <em className="text-gold not-italic">{partnerName ?? 'votre partenaire'}</em> formez
        maintenant un Espace Couple.
      </p>
      <p className="mt-4 text-sm text-cream/50">
        La première partie arrive bientôt — on vous prévient dès qu&rsquo;elle est prête.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/couple/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/couple/apparies/
git commit -m "Add /couple/apparies pairing confirmation screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: `/invite/[code]` page

**Files:**
- Create: `frontend/src/app/invite/[code]/page.tsx`

**Interfaces:**
- Consumes: `useAuth`; `api`, `ApiError`; `GET /api/invites/[code]` (Task 8); `POST /api/couples/join` (Task 7, for the already-logged-in branch).
- Produces: navigates to `/inscription?invite=CODE` (logged out) or directly joins + redirects to `/couple/apparies` (logged in).

- [ ] **Step 1: Implement the page**

Create `frontend/src/app/invite/[code]/page.tsx`:

```tsx
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface InviteInfo {
  valid: boolean;
  creatorName?: string;
  expired?: boolean;
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InviteInfo>(`/api/invites/${code}`)
      .then(setInvite)
      .catch(() => setInvite({ valid: false, expired: false }));
  }, [code]);

  async function onJoin() {
    setJoining(true);
    setError(null);
    try {
      await api('/api/couples/join', { method: 'POST', body: { code } });
      router.push('/couple/apparies');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      setJoining(false);
    }
  }

  if (!invite || authLoading) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center bg-ink font-grotesk text-cream">
      {invite.valid ? (
        <>
          <h1 className="font-serif text-3xl">
            <em className="text-gold not-italic">{invite.creatorName ?? 'Votre partenaire'}</em>{' '}
            vous invite à rejoindre Cœur Fidèle.
          </h1>
          {error && (
            <p role="alert" className="text-sm text-wine">
              {error}
            </p>
          )}
          {user ? (
            <button
              type="button"
              onClick={onJoin}
              disabled={joining}
              className="rounded-full bg-gold px-8 py-4 text-base font-bold text-ink hover:bg-cream disabled:opacity-50"
            >
              {joining ? 'Appairage…' : 'Rejoindre'}
            </button>
          ) : (
            <a
              href={`/inscription?invite=${code}`}
              className="rounded-full bg-gold px-8 py-4 text-base font-bold text-ink hover:bg-cream"
            >
              Rejoindre
            </a>
          )}
        </>
      ) : (
        <>
          <h1 className="font-serif text-3xl">
            {invite.expired ? "Ce lien a expiré" : "Ce lien n'est plus valide"}
          </h1>
          <p className="text-cream/70">
            Demandez à votre partenaire de vous envoyer une nouvelle invitation.
          </p>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/invite/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/invite/
git commit -m "Add public /invite/[code] landing page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass, including every test added in Tasks 2–8.

- [ ] **Step 2: Run format, lint, typecheck, build**

Run: `cd frontend && npx prettier --check . && npx eslint src/ && npx tsc --noEmit && npx next build`
Expected: all four succeed. (`next build` also catches any Server/Client Component boundary mistakes vitest wouldn't.)

- [ ] **Step 3: Manual end-to-end walkthrough**

With `pnpm dev` running and real `DATABASE_URL`/`JWT_SECRET` in `frontend/.env.local`:

1. Visit `/inscription`, create account A (e.g. `awa@test.dev`), verify its email via `/verify-email` using the code from the dev outbox/log.
2. Log in as A at `/connexion` → redirected to `/couple/creer` → click "Créer notre Espace Couple" → land on `/couple/attente` with a visible 6-digit code and a copyable link.
3. Open the invite link in a private/incognito window → `/invite/[code]` shows "Awa vous invite" → click "Rejoindre" → lands on `/inscription?invite=CODE` with the invite banner → create account B (`karim@test.dev`) → verify B's email → log in as B.
4. B is redirected through `/couple/creer` → `/couple/apparies` directly (already paired from signup auto-join) showing both first names.
5. Back in A's window (still on `/couple/attente`), within 3s it redirects to `/couple/apparies` too.
6. Separately: create account C, log in, visit `/couple/creer` → create a couple → note its code → open a fourth account D, log in, go straight to `http://localhost:3000/invite/<C's code>` while already logged in → click "Rejoindre" (exercises `POST /api/couples/join` directly, not the signup path) → confirm `/couple/apparies` shows both names.

Expected: every step matches the design spec's verification section; no unhandled errors in the browser console or server logs.

- [ ] **Step 4: Commit any fixes found during manual verification**

If Step 3 surfaces a bug, fix it, re-run the affected task's automated tests, and commit with a message describing the fix — do not fold silent fixes into a later task's commit.
