# Profil & intention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the dating-profile domain (data model + API) to the izikit-based Cœur Fidèle backend — profile fields, photo upload, and the onboarding-completion gate — so later sub-projects (matching, mutual connection, messaging) have real profile data to work against.

**Architecture:** A new `Profile` model (1:1 with `User`, all fields nullable until onboarding completes) plus two nullable columns on the existing `FileUpload` model for profile photos. Four new API routes follow the kit's existing `requireAuth` + `verifyCsrf` + `withRequestContext` boilerplate exactly. A new `requireOnboarded()` guard (same shape as `requireAdmin`) lets future routes gate on profile completion.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 5 (Postgres/Neon), Zod validation, Vitest + `vitest-mock-extended` for tests, Cloudinary via the existing `@/lib/server/upload/*` helpers.

## Global Constraints

- Every route file starts with `export const runtime = 'nodejs';` (enforced by `runtime-enforcement.test.ts`).
- Every mutating route (PATCH/POST/DELETE) calls `verifyCsrf(req)` before `requireAuth`.
- Every handler wraps its body in `makeRequestContext(req.headers)` + `withRequestContext(ctx, async () => { ... })` and sets `x-request-id` on every response.
- Error responses use `{ error: 'CODE', message?: string }` (the convention used by `/api/auth/*`, matched here since these are auth-adjacent identity routes — not `{ code, message }`, which is `/api/upload`'s own convention for that one route).
- Closed-value fields are plain `String` columns with a comment listing valid values (matches `User.role`/`User.status`) — validated at the Zod layer via `z.enum([...])`, never a Prisma `enum`.
- Minimum age is 18, enforced both in Zod (`birthDate`) and in the completion gate.
- Tests are colocated as `route.test.ts` next to each `route.ts`, importing `prismaMock` from `@/test-utils/prisma-mock` **first** (hoisting requirement — see existing tests).
- No UI/pages in this plan — the kit ships zero React pages by design; a wizard UI is a separate future chantier.

---

### Task 1: Prisma schema — `Profile` model + `FileUpload` photo columns

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: a new migration folder under `frontend/prisma/migrations/` (auto-named by Prisma)

**Interfaces:**
- Produces: `Profile` model with all business fields **nullable** (they fill in incrementally across the onboarding wizard; only `userId` is required at row-creation time) — `gender`, `birthDate`, `country`, `city`, `maritalStatus`, `hasChildren`, `childrenCount`, `wantsChildren`, `religion`, `religiousPractice`, `educationLevel`, `profession`, `bio`, `seekingGender`, `seekingMinAge`, `seekingMaxAge`, `seekingCountry`, `seekingCity`, `onboardingCompletedAt`. Produces `FileUpload.purpose` / `FileUpload.position` (both nullable). Produces `User.profile` back-relation.

Note on the approved spec: the spec doc shows several fields as non-nullable (`String`, `Boolean`, `Int`). That doesn't actually work for a multi-step wizard that creates the `Profile` row on the *first* `PATCH` call with partial data — so this task makes every business field nullable at the DB layer and enforces "required for completion" purely at the application layer (Task 4), the same way the rest of the kit keeps business rules out of DB constraints (`User.role` is a plain string, not a DB enum).

- [ ] **Step 1: Edit the schema**

Add to `frontend/prisma/schema.prisma`, after the `OAuthAccount` model (or any point after `User`):

```prisma
// ───────────────────────────────────────────────────────────────────────
// Dating domain — Profile. 1:1 with User. All business fields nullable:
// the row is created on the FIRST onboarding PATCH with partial data and
// filled in across the wizard steps. "Required for completion" is an
// app-layer rule (see requireOnboarded / getMissingRequiredFields), not a
// DB constraint — same philosophy as User.role/User.status.
// ───────────────────────────────────────────────────────────────────────
model Profile {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Qui je suis
  gender            String? // MALE | FEMALE
  birthDate         DateTime?
  country           String?
  city              String?
  maritalStatus     String? // SINGLE | DIVORCED | WIDOWED
  hasChildren       Boolean?
  childrenCount     Int?
  wantsChildren     String? // YES | NO | MAYBE
  religion          String? // MUSLIM | CHRISTIAN | OTHER | NONE
  religiousPractice String? // PRACTICING | BELIEVER_NON_PRACTICING | NON_PRACTICING
  educationLevel    String? // SECONDARY | BACHELOR | MASTER | DOCTORATE | OTHER
  profession        String?
  bio               String? @db.Text

  // Qui je cherche
  seekingGender  String? // MALE | FEMALE
  seekingMinAge  Int?
  seekingMaxAge  Int?
  seekingCountry String?
  seekingCity    String?

  onboardingCompletedAt DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([gender, seekingGender])
  @@index([country, city])
}
```

Add the back-relation to `User` (next to the other relation fields, e.g. right after `adminActions`):

```prisma
  profile Profile?
```

Extend `FileUpload` — add these two fields inside the existing model block:

```prisma
  purpose  String? // PROFILE_PHOTO | null (generic upload otherwise)
  position Int? // 0-5 for PROFILE_PHOTO, display order
```

- [ ] **Step 2: Generate and apply the migration**

Run (direct, not through the nested `pnpm db:migrate:dev` script chain, to avoid `--name` arg-forwarding ambiguity across two layers of pnpm scripts):

```bash
cd frontend && npx prisma migrate dev --name add_profile_and_photo_purpose
```

Expected: prompt-free success output ending in "Your database is now in sync with your schema." A new timestamped folder appears under `frontend/prisma/migrations/`.

- [ ] **Step 3: Verify migration status and types**

Run: `pnpm db:migrate:status`
Expected: "Database schema is up to date!"

Run: `pnpm typecheck`
Expected: exits 0. (This also doubles as a regression check on the pnpm/`@prisma/client` root-dependency fix from earlier — if it ever regresses, every model delegate disappears from `Prisma.TransactionClient` and this step will fail loudly.)

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(profile): add Profile model and FileUpload photo columns"
```

---

### Task 2: Validation module — `frontend/src/lib/server/profile/validation.ts`

**Files:**
- Create: `frontend/src/lib/server/profile/validation.ts`
- Test: `frontend/src/lib/server/profile/validation.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, only `zod`).
- Produces: `GENDER_VALUES`, `MARITAL_STATUS_VALUES`, `WANTS_CHILDREN_VALUES`, `RELIGION_VALUES`, `RELIGIOUS_PRACTICE_VALUES`, `EDUCATION_LEVEL_VALUES` (readonly string tuples), `MIN_AGE = 18`, `calculateAge(birthDate: Date, now?: Date): number`, `ProfilePatchBody` (Zod schema, `.safeParse` returns `{ success, data | error }`), `ProfilePatchInput` (inferred type), `ProfileRecordForCompletion` (interface), `getMissingRequiredFields(profile: ProfileRecordForCompletion | null): string[]`. Tasks 3 and 4 import all of these.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/server/profile/validation.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateAge,
  MIN_AGE,
  ProfilePatchBody,
  getMissingRequiredFields,
} from './validation';

describe('calculateAge', () => {
  it('returns the full years between birthDate and now', () => {
    expect(calculateAge(new Date('2000-01-01'), new Date('2026-01-01'))).toBe(26);
  });

  it('has not had this year\'s birthday yet', () => {
    expect(calculateAge(new Date('2000-06-15'), new Date('2026-06-14'))).toBe(25);
  });

  it('birthday is today', () => {
    expect(calculateAge(new Date('2000-06-15'), new Date('2026-06-15'))).toBe(26);
  });
});

describe('ProfilePatchBody', () => {
  it('accepts a valid partial payload', () => {
    const res = ProfilePatchBody.safeParse({ gender: 'MALE', country: 'Sénégal' });
    expect(res.success).toBe(true);
  });

  it('rejects an unknown gender value', () => {
    const res = ProfilePatchBody.safeParse({ gender: 'OTHER' });
    expect(res.success).toBe(false);
  });

  it(`rejects a birthDate younger than ${MIN_AGE}`, () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - (MIN_AGE - 1));
    const res = ProfilePatchBody.safeParse({ birthDate: tooYoung.toISOString() });
    expect(res.success).toBe(false);
  });

  it('rejects hasChildren=true without childrenCount', () => {
    const res = ProfilePatchBody.safeParse({ hasChildren: true });
    expect(res.success).toBe(false);
  });

  it('accepts hasChildren=true with childrenCount', () => {
    const res = ProfilePatchBody.safeParse({ hasChildren: true, childrenCount: 2 });
    expect(res.success).toBe(true);
  });

  it('rejects seekingMinAge greater than seekingMaxAge', () => {
    const res = ProfilePatchBody.safeParse({ seekingMinAge: 40, seekingMaxAge: 30 });
    expect(res.success).toBe(false);
  });
});

describe('getMissingRequiredFields', () => {
  const complete = {
    gender: 'MALE',
    birthDate: new Date('1990-01-01'),
    country: 'Sénégal',
    city: 'Dakar',
    maritalStatus: 'SINGLE',
    hasChildren: false,
    childrenCount: null,
    wantsChildren: 'YES',
    religion: 'MUSLIM',
    religiousPractice: 'PRACTICING',
    educationLevel: 'BACHELOR',
    seekingGender: 'FEMALE',
    seekingMinAge: 25,
    seekingMaxAge: 35,
  };

  it('returns empty array when every required field is set', () => {
    expect(getMissingRequiredFields(complete)).toEqual([]);
  });

  it('returns all required fields when profile is null', () => {
    expect(getMissingRequiredFields(null).length).toBeGreaterThan(0);
  });

  it('flags childrenCount as missing when hasChildren is true but childrenCount is null', () => {
    const missing = getMissingRequiredFields({ ...complete, hasChildren: true, childrenCount: null });
    expect(missing).toContain('childrenCount');
  });

  it('lists each null required field by name', () => {
    const missing = getMissingRequiredFields({ ...complete, city: null });
    expect(missing).toContain('city');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/profile/validation.test.ts`
Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/lib/server/profile/validation.ts
import { z } from 'zod';

export const GENDER_VALUES = ['MALE', 'FEMALE'] as const;
export const MARITAL_STATUS_VALUES = ['SINGLE', 'DIVORCED', 'WIDOWED'] as const;
export const WANTS_CHILDREN_VALUES = ['YES', 'NO', 'MAYBE'] as const;
export const RELIGION_VALUES = ['MUSLIM', 'CHRISTIAN', 'OTHER', 'NONE'] as const;
export const RELIGIOUS_PRACTICE_VALUES = [
  'PRACTICING',
  'BELIEVER_NON_PRACTICING',
  'NON_PRACTICING',
] as const;
export const EDUCATION_LEVEL_VALUES = [
  'SECONDARY',
  'BACHELOR',
  'MASTER',
  'DOCTORATE',
  'OTHER',
] as const;

export const MIN_AGE = 18;

export function calculateAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export const ProfilePatchBody = z
  .object({
    gender: z.enum(GENDER_VALUES),
    birthDate: z.coerce.date().refine((d) => calculateAge(d) >= MIN_AGE, {
      message: `Must be at least ${MIN_AGE} years old`,
    }),
    country: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    maritalStatus: z.enum(MARITAL_STATUS_VALUES),
    hasChildren: z.boolean(),
    childrenCount: z.number().int().min(0).max(20).nullable().optional(),
    wantsChildren: z.enum(WANTS_CHILDREN_VALUES),
    religion: z.enum(RELIGION_VALUES),
    religiousPractice: z.enum(RELIGIOUS_PRACTICE_VALUES),
    educationLevel: z.enum(EDUCATION_LEVEL_VALUES),
    profession: z.string().trim().max(100).nullable().optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
    seekingGender: z.enum(GENDER_VALUES),
    seekingMinAge: z.number().int().min(MIN_AGE).max(99),
    seekingMaxAge: z.number().int().min(MIN_AGE).max(99),
    seekingCountry: z.string().trim().max(100).nullable().optional(),
    seekingCity: z.string().trim().max(100).nullable().optional(),
  })
  .partial()
  .refine((data) => !(data.hasChildren === true && data.childrenCount == null), {
    message: 'childrenCount is required when hasChildren is true',
    path: ['childrenCount'],
  })
  .refine((data) => !(data.hasChildren === false && data.childrenCount != null), {
    message: 'childrenCount must be omitted when hasChildren is false',
    path: ['childrenCount'],
  })
  .refine(
    (data) =>
      data.seekingMinAge == null ||
      data.seekingMaxAge == null ||
      data.seekingMinAge <= data.seekingMaxAge,
    { message: 'seekingMinAge must be <= seekingMaxAge', path: ['seekingMaxAge'] },
  );

export type ProfilePatchInput = z.infer<typeof ProfilePatchBody>;

const REQUIRED_FIELDS = [
  'gender',
  'birthDate',
  'country',
  'city',
  'maritalStatus',
  'hasChildren',
  'wantsChildren',
  'religion',
  'religiousPractice',
  'educationLevel',
  'seekingGender',
  'seekingMinAge',
  'seekingMaxAge',
] as const;

export interface ProfileRecordForCompletion {
  gender: string | null;
  birthDate: Date | null;
  country: string | null;
  city: string | null;
  maritalStatus: string | null;
  hasChildren: boolean | null;
  childrenCount: number | null;
  wantsChildren: string | null;
  religion: string | null;
  religiousPractice: string | null;
  educationLevel: string | null;
  seekingGender: string | null;
  seekingMinAge: number | null;
  seekingMaxAge: number | null;
}

export function getMissingRequiredFields(profile: ProfileRecordForCompletion | null): string[] {
  if (!profile) return [...REQUIRED_FIELDS];
  const missing: string[] = REQUIRED_FIELDS.filter(
    (field) => profile[field] === null || profile[field] === undefined,
  );
  if (profile.hasChildren === true && profile.childrenCount == null) {
    missing.push('childrenCount');
  }
  return missing;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/profile/validation.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/profile/validation.ts frontend/src/lib/server/profile/validation.test.ts
git commit -m "feat(profile): add profile validation module"
```

---

### Task 3: `GET` / `PATCH` `/api/profile`

**Files:**
- Create: `frontend/src/app/api/profile/route.ts`
- Test: `frontend/src/app/api/profile/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/server/middleware` (`AuthContext | NextResponse`, `auth.user.sub` is the userId), `verifyCsrf` from `@/lib/server/auth`, `prisma` from `@/lib/server/prisma`, `ProfilePatchBody` + `formatIssues`-style error mapping from Task 2's `validation.ts`.
- Produces: `GET` returns `{ profile: Profile | null }`. `PATCH` returns `{ profile: Profile }` (the full row after upsert) on 200, or `{ error: 'VALIDATION_FAILED', issues }` on 400.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/api/profile/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 't@e.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { GET, PATCH } from './route';

function makeGetReq(): NextRequest {
  return new NextRequest('http://test/api/profile', { method: 'GET' });
}

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/profile', () => {
  it('returns null when no profile exists yet', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ profile: null });
  });

  it('returns the profile when it exists', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ userId: 'user-1', gender: 'MALE' } as never);
    const res = await GET(makeGetReq());
    const body = await res.json();
    expect(body.profile.gender).toBe('MALE');
  });
});

describe('PATCH /api/profile', () => {
  it('rejects an invalid payload with VALIDATION_FAILED', async () => {
    const res = await PATCH(makePatchReq({ gender: 'NOT_A_GENDER' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('upserts a valid partial payload and returns the row', async () => {
    prismaMock.profile.upsert.mockResolvedValue({ userId: 'user-1', country: 'Sénégal' } as never);
    const res = await PATCH(makePatchReq({ country: 'Sénégal' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.country).toBe('Sénégal');
    expect(prismaMock.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ userId: 'user-1', country: 'Sénégal' }),
        update: expect.objectContaining({ country: 'Sénégal' }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/profile/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/api/profile/route.ts
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ProfilePatchBody } from '@/lib/server/profile/validation';
import type { z } from 'zod';

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const profile = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    return NextResponse.json({ profile }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const json = await req.json().catch(() => null);
    const parsed = ProfilePatchBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const profile = await prisma.profile.upsert({
      where: { userId: auth.user.sub },
      create: { userId: auth.user.sub, ...parsed.data },
      update: { ...parsed.data },
    });

    return NextResponse.json({ profile }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/profile/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/profile/route.ts frontend/src/app/api/profile/route.test.ts
git commit -m "feat(profile): add GET/PATCH /api/profile"
```

---

### Task 4: `POST` `/api/profile/complete`

**Files:**
- Create: `frontend/src/app/api/profile/complete/route.ts`
- Test: `frontend/src/app/api/profile/complete/route.test.ts`

**Interfaces:**
- Consumes: `getMissingRequiredFields` from Task 2, `requireAuth`/`verifyCsrf`/`prisma` as above.
- Produces: 200 `{ profile }` with `onboardingCompletedAt` set, or 400 `{ error: 'PROFILE_INCOMPLETE', missingFields: string[], hasPhoto: boolean }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/api/profile/complete/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 't@e.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { POST } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/profile/complete', { method: 'POST' });
}

const FULL_PROFILE = {
  userId: 'user-1',
  gender: 'MALE',
  birthDate: new Date('1990-01-01'),
  country: 'Sénégal',
  city: 'Dakar',
  maritalStatus: 'SINGLE',
  hasChildren: false,
  childrenCount: null,
  wantsChildren: 'YES',
  religion: 'MUSLIM',
  religiousPractice: 'PRACTICING',
  educationLevel: 'BACHELOR',
  seekingGender: 'FEMALE',
  seekingMinAge: 25,
  seekingMaxAge: 35,
  onboardingCompletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/profile/complete', () => {
  it('rejects when the profile does not exist yet', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.fileUpload.count.mockResolvedValue(0);
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_INCOMPLETE');
    expect(body.missingFields.length).toBeGreaterThan(0);
  });

  it('rejects when required fields are set but no photo was uploaded', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(FULL_PROFILE as never);
    prismaMock.fileUpload.count.mockResolvedValue(0);
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_INCOMPLETE');
    expect(body.missingFields).toEqual([]);
    expect(body.hasPhoto).toBe(false);
  });

  it('completes onboarding when fields and a photo are both present', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(FULL_PROFILE as never);
    prismaMock.fileUpload.count.mockResolvedValue(1);
    prismaMock.profile.update.mockResolvedValue({
      ...FULL_PROFILE,
      onboardingCompletedAt: new Date(),
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.onboardingCompletedAt).not.toBeNull();
    expect(prismaMock.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/profile/complete/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/api/profile/complete/route.ts
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getMissingRequiredFields } from '@/lib/server/profile/validation';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const profile = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    const missingFields = getMissingRequiredFields(profile);
    const photoCount = await prisma.fileUpload.count({
      where: { userId: auth.user.sub, purpose: 'PROFILE_PHOTO' },
    });
    const hasPhoto = photoCount > 0;

    if (missingFields.length > 0 || !hasPhoto) {
      return NextResponse.json(
        { error: 'PROFILE_INCOMPLETE', missingFields, hasPhoto },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.profile.update({
      where: { userId: auth.user.sub },
      data: { onboardingCompletedAt: new Date() },
    });

    return NextResponse.json(
      { profile: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/profile/complete/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/profile/complete/route.ts frontend/src/app/api/profile/complete/route.test.ts
git commit -m "feat(profile): add POST /api/profile/complete"
```

---

### Task 5: `requireOnboarded()` guard

**Files:**
- Modify: `frontend/src/lib/server/middleware/index.ts`
- Test: `frontend/src/lib/server/middleware/require-onboarded.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (already in the same file), `prisma`.
- Produces: `OnboardedContext` interface and `requireOnboarded(authHeader?: string | null): Promise<OnboardedContext | NextResponse>` — a 403 `{ error: 'ONBOARDING_INCOMPLETE' }` when no profile exists or `onboardingCompletedAt` is null, otherwise `{ user, profile: { userId, onboardingCompletedAt } }`. Later sub-projects (matching, messaging) chain this exactly like `requireAdmin` chains `requireAuth`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/server/middleware/require-onboarded.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('../auth', () => ({
  verifyToken: vi.fn(async () => ({ sub: 'user-1', email: 't@e.com', tokenVersion: 0 })),
  COOKIE_NAME: 'app-token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: 'fake-token' }) })),
}));

import { requireOnboarded } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireOnboarded', () => {
  it('returns 403 ONBOARDING_INCOMPLETE when no profile exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@e.com',
      tokenVersion: 0,
    } as never);
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const result = await requireOnboarded();
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('ONBOARDING_INCOMPLETE');
  });

  it('returns 403 when the profile exists but onboarding is not complete', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@e.com',
      tokenVersion: 0,
    } as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      userId: 'user-1',
      onboardingCompletedAt: null,
    } as never);

    const result = await requireOnboarded();
    expect(result).toBeInstanceOf(NextResponse);
  });

  it('returns the onboarded context when onboarding is complete', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@e.com',
      tokenVersion: 0,
    } as never);
    const completedAt = new Date();
    prismaMock.profile.findUnique.mockResolvedValue({
      userId: 'user-1',
      onboardingCompletedAt: completedAt,
    } as never);

    const result = await requireOnboarded();
    expect(result).not.toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) {
      expect(result.user.sub).toBe('user-1');
      expect(result.profile.onboardingCompletedAt).toBe(completedAt);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-onboarded.test.ts`
Expected: FAIL — `requireOnboarded is not exported from './index'`.

- [ ] **Step 3: Add the implementation to `middleware/index.ts`**

Add after `requireAuth`'s definition (same file, so it can reuse `prisma` and the `AuthContext` type already imported there):

```typescript
export interface OnboardedContext extends AuthContext {
  profile: { userId: string; onboardingCompletedAt: Date };
}

/**
 * requireOnboarded — chains requireAuth, then verifies the user has
 * completed the profile onboarding wizard (Profile.onboardingCompletedAt
 * set). Returns 403 ONBOARDING_INCOMPLETE otherwise. Future routes that
 * need a complete profile (matching, mutual connection, messaging) chain
 * this the same way admin routes chain requireAdmin.
 */
export async function requireOnboarded(
  authHeader?: string | null,
): Promise<OnboardedContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const profile = await prisma.profile.findUnique({
    where: { userId: auth.user.sub },
    select: { userId: true, onboardingCompletedAt: true },
  });
  if (!profile || !profile.onboardingCompletedAt) {
    return NextResponse.json({ error: 'ONBOARDING_INCOMPLETE' }, { status: 403 });
  }
  return {
    user: auth.user,
    profile: { userId: profile.userId, onboardingCompletedAt: profile.onboardingCompletedAt },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-onboarded.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/middleware/index.ts frontend/src/lib/server/middleware/require-onboarded.test.ts
git commit -m "feat(profile): add requireOnboarded guard"
```

---

### Task 6: `POST` `/api/profile/photos`

**Files:**
- Create: `frontend/src/app/api/profile/photos/route.ts`
- Test: `frontend/src/app/api/profile/photos/route.test.ts`

**Interfaces:**
- Consumes: `uploadBuffer`/`StorageNotConfiguredError` from `@/lib/server/upload/cloudinary-client`, `sanitizeFilename` from `@/lib/server/upload/sanitize-filename`, `verifyMagicBytes` from `@/lib/server/upload/sniff` — the exact same pipeline `/api/upload` uses, so this task mirrors that route's orchestration and only adds the 6-photo cap and `purpose`/`position`.
- Produces: 201 `{ id, key, filename, mimeType, sizeBytes, position, url }`. 400 `PHOTO_LIMIT_REACHED` at 6 photos. Reuses `FILE_TOO_LARGE` / `INVALID_MIME` / `MAGIC_BYTE_MISMATCH` / `STORAGE_NOT_CONFIGURED` / `UPLOAD_FAILED` codes from the existing upload pipeline for consistency.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/api/profile/photos/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockCloudinaryClient } from '@/test-utils/cloudinary-mock';

const cl = mockCloudinaryClient();

vi.mock('@/lib/server/upload/cloudinary-client', () => ({
  uploadBuffer: vi.fn((publicId: string, body: Buffer) => cl.uploadBuffer(publicId, body)),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {
    constructor() {
      super('Storage not configured');
      this.name = 'StorageNotConfiguredError';
    }
  },
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 't@e.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { POST } from './route';

beforeEach(() => {
  vi.stubEnv('UPLOAD_ALLOWED_MIME', 'image/jpeg,image/png,image/webp');
  vi.stubEnv('UPLOAD_MAX_BYTES', '10485760');
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(file: File): Request {
  const fd = new FormData();
  fd.append('file', file);
  return new Request(new URL('http://localhost/api/profile/photos'), {
    method: 'POST',
    body: fd,
    headers: new Headers({ 'x-csrf-token': 'test-csrf' }),
  });
}

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', { type: 'image/jpeg' });

describe('POST /api/profile/photos', () => {
  it('uploads the first photo at position 0', async () => {
    prismaMock.fileUpload.count.mockResolvedValue(0);
    prismaMock.fileUpload.create.mockResolvedValue({
      id: 'fu-1',
      key: 'user-1/abc',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      position: 0,
      createdAt: new Date(),
    } as never);

    const res = await POST(makeReq(jpeg()) as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.position).toBe(0);
    expect(prismaMock.fileUpload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purpose: 'PROFILE_PHOTO', position: 0 }),
      }),
    );
  });

  it('rejects a 7th photo with PHOTO_LIMIT_REACHED', async () => {
    prismaMock.fileUpload.count.mockResolvedValue(6);

    const res = await POST(makeReq(jpeg()) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PHOTO_LIMIT_REACHED');
    expect(prismaMock.fileUpload.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/profile/photos/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/api/profile/photos/route.ts
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/cloudinary-client';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';

const MAX_PHOTOS = 6;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const existingCount = await prisma.fileUpload.count({
      where: { userId: auth.user.sub, purpose: 'PROFILE_PHOTO' },
    });
    if (existingCount >= MAX_PHOTOS) {
      return NextResponse.json(
        { error: 'PHOTO_LIMIT_REACHED', message: `Max ${MAX_PHOTOS} photos` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const allowedMime = (process.env.UPLOAD_ALLOWED_MIME ?? 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const maxBytes = Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? '10485760', 10);

    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return NextResponse.json(
        { error: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { error: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { error: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const publicId = `${auth.user.sub}/${randomUUID()}`;
    let uploaded;
    try {
      uploaded = await uploadBuffer(publicId, buf, file.type);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { error: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const row = await prisma.fileUpload.create({
      data: {
        userId: auth.user.sub,
        key: uploaded.publicId,
        filename: sanitizeFilename(file.name),
        mimeType: file.type,
        sizeBytes: uploaded.bytes,
        purpose: 'PROFILE_PHOTO',
        position: existingCount,
      },
      select: {
        id: true,
        key: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        position: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { ...row, url: uploaded.secureUrl },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

Note: this intentionally does not transcode HEIC (unlike `/api/upload`) — kept out to match the spec's minimal MVP scope; revisit if real users hit it (iPhone camera uploads default to HEIC).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/profile/photos/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/profile/photos/route.ts frontend/src/app/api/profile/photos/route.test.ts
git commit -m "feat(profile): add POST /api/profile/photos"
```

---

### Task 7: `DELETE` `/api/profile/photos/[id]`

**Files:**
- Create: `frontend/src/app/api/profile/photos/[id]/route.ts`
- Test: `frontend/src/app/api/profile/photos/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `verifyCsrf`, `prisma` as above.
- Produces: 200 `{ ok: true }` on success, 404 `{ error: 'PHOTO_NOT_FOUND' }` if the id doesn't exist, isn't owned by the caller, or isn't a `PROFILE_PHOTO`.

Note (documented trade-off, not a gap to silently ignore): this deletes only the `FileUpload` row, not the underlying Cloudinary asset — the kit has no existing "delete from Cloudinary" helper anywhere (no other route deletes an upload either), and adding one is out of scope for this sub-project.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/api/profile/photos/[id]/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 't@e.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { DELETE } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/profile/photos/fu-1', { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /api/profile/photos/[id]', () => {
  it('returns 404 when the photo does not belong to the caller', async () => {
    prismaMock.fileUpload.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: 'fu-1' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PHOTO_NOT_FOUND');
  });

  it('deletes the photo row when owned by the caller', async () => {
    prismaMock.fileUpload.findFirst.mockResolvedValue({ id: 'fu-1', userId: 'user-1' } as never);
    prismaMock.fileUpload.delete.mockResolvedValue({ id: 'fu-1' } as never);

    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: 'fu-1' }) });
    expect(res.status).toBe(200);
    expect(prismaMock.fileUpload.delete).toHaveBeenCalledWith({ where: { id: 'fu-1' } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run "src/app/api/profile/photos/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/api/profile/photos/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', reqCtx.requestId);
      return auth;
    }

    const { id } = await ctx.params;
    const photo = await prisma.fileUpload.findFirst({
      where: { id, userId: auth.user.sub, purpose: 'PROFILE_PHOTO' },
      select: { id: true },
    });
    if (!photo) {
      return NextResponse.json(
        { error: 'PHOTO_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.fileUpload.delete({ where: { id: photo.id } });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run "src/app/api/profile/photos/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/profile/photos/[id]/route.ts" "frontend/src/app/api/profile/photos/[id]/route.test.ts"
git commit -m "feat(profile): add DELETE /api/profile/photos/[id]"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all files pass, including the 7 new test files from Tasks 2–7.

- [ ] **Step 2: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both exit 0.

- [ ] **Step 3: Manual smoke check against the dev server**

Run: `pnpm dev` (separate terminal), then with a real cookie session (see `pnpm smoke:auth` for the signup→verify pattern, adapted manually since that script is broken on Windows — see prior session notes):

```bash
curl -s -X PATCH http://localhost:3000/api/profile \
  -H "content-type: application/json" -H "cookie: <session cookie>" -H "x-csrf-token: <csrf>" \
  -d '{"country":"Sénégal","city":"Dakar"}'
```

Expected: `200 { "profile": { "userId": "...", "country": "Sénégal", "city": "Dakar", ... } }`.

- [ ] **Step 4: Commit if any fixups were needed, otherwise done**

If Steps 1–3 required no code changes, this task needs no commit — the plan is complete.

---

## Self-review notes

- **Spec coverage:** every spec requirement maps to a task — data model (Task 1), GET/PATCH (Task 3), completion gate (Task 4), onboarding guard for future routes (Task 5), photo upload/cap/delete (Tasks 6–7), validation rules (age, enums, children consistency, seeking range — Task 2), tests colocated per the spec's testing section (all tasks), UI wizard explicitly deferred (per the mid-plan scope clarification, not a gap).
- **Type consistency checked:** `ProfilePatchInput`/`ProfilePatchBody` (Task 2) is the only body type consumed by Task 3; `getMissingRequiredFields`/`ProfileRecordForCompletion` (Task 2) is the only shape consumed by Task 4; `requireAuth`'s `AuthContext` (existing) is consumed identically by every task; `requireOnboarded`'s `OnboardedContext` (Task 5) isn't consumed by any task in *this* plan (it's for later sub-projects) — flagged explicitly in Task 5's Interfaces block so that's not mistaken for an oversight.
- **No placeholders** — every step has real, runnable code.
