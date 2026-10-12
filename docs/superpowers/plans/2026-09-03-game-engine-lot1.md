# Moteur de jeu — Lot 1 : modèle de données + scoring + contenu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every non-UI, non-HTTP building block the pass-and-play game
engine needs — Prisma models, question bank + seed script, question
selection with anti-repetition, the phase state machine, the scoring
engine, and the response-shaping helpers that keep hidden data (Scenario
weights, the other player's answer before reveal) out of any future API
response. This is the prerequisite for a Lot 2 plan (routes + UI, written
separately once this lands on `main`).

**Architecture:** Seven new Prisma models (`Question`, `GameSession`,
`GameRound`, `GameRoundQuestion`, `Answer`, `QuestionUsage`, `GameResult`)
plus a small extension to the existing `Couple` model. Five new pure/near-pure
modules under `frontend/src/lib/server/game/`. One small route,
`POST /api/couples/disclaimer/accept`, because it's a natural extension of
the already-shipped `couples` domain and Lot 2's game-creation route
depends on the field it sets.

**Tech Stack:** Same as the couple-pairing plan — Next.js 16, Prisma 5 /
Neon, Zod, Vitest + `vitest-mock-extended`. See
`docs/superpowers/specs/2026-09-03-couple-pairing-design.md` and
`docs/superpowers/plans/2026-09-03-couple-pairing.md` for the established
patterns this plan reuses throughout (route skeleton, CSRF, migration
commands, French error-code conventions).

## Global Constraints

- **No `/api/games/*` routes and no `/jeu/*` pages in this lot.** Those are
  Lot 2, planned separately once this lot is merged. The one exception is
  `POST /api/couples/disclaimer/accept` (Task 8) — it extends the existing
  `couples` domain, not the new game surface, and Lot 2's game-creation
  route needs the field it sets to already exist and be gate-able.
- `lib/server/game/scoring.ts` and `lib/server/game/state-machine.ts` are
  **pure functions** — no Prisma import, no `server-only` import, fully
  unit-testable without a database or mocks.
- Convention: every new `status`/`phase`/`kind`/`type`/`roundType` column is
  a commented `String`, never a native Prisma enum — matches every existing
  model (`Order.status`, `Couple.status`, etc.).
- Every new Prisma model gets an `@@index` on its frequent query columns —
  see `Couple`/`Order` as reference.
- Prisma CLI does **not** read `frontend/.env.local` automatically (only
  Next.js does) — every migration command below injects
  `DATABASE_URL`/`DIRECT_URL` explicitly via the same `node -e` wrapper used
  in the couple-pairing plan's Task 1.
- **Critical invariant carried into Lot 2:** a `SCENARIO` option's `weight`
  must never be serializable to a client. Task 9's `shapeQuestionForClient`
  is the single chokepoint Lot 2 routes MUST use — its test suite is the
  proof this holds, and Lot 2's plan will reference it instead of
  re-deriving the stripping logic.
- French is the UI/content language for **user-facing question text only**
  (the 27 seed questions in Task 4) — everything else in this lot (code,
  comments, error codes) follows the existing English-code convention seen
  throughout the couples domain (`ALREADY_IN_COUPLE`, etc.), translated to
  French only at the page layer in Lot 2 (mirroring
  `frontend/src/lib/couples-error-messages.ts`).

---

## Task 1: Seven game-engine Prisma models + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create (generated): `frontend/prisma/migrations/<timestamp>_game_engine/migration.sql`

**Interfaces:**
- Produces: `Question`, `GameSession`, `GameRound`, `GameRoundQuestion`,
  `Answer`, `QuestionUsage`, `GameResult` models — consumed by every
  subsequent task in this plan and by every route in the future Lot 2.

- [ ] **Step 1: Append the models to `frontend/prisma/schema.prisma`**

Append at the end of the file, after the `Couple` model:

```prisma
// ───────────────────────────────────────────────────────────────────────
// Cœur Fidèle — game engine, pass-and-play (PRD §5, §9 R2-R4).
//
// Question is a shared content bank (never couple-scoped). A GameSession
// is one played party for one couple: 3 GameRounds (Miroir, Scenario,
// FaceAFace), 5 GameRoundQuestions each, locked in at session-create time
// (see lib/server/game/question-selection.ts) so resuming after a closed
// tab never re-draws different questions.
//
// Answer.userId is the couple's creatorId or partnerId — NOT necessarily
// the calling session's auth.user.sub, because pass-and-play shares one
// authenticated device between both partners (see the design note in
// docs/superpowers/plans/2026-09-03-game-engine-lot1.md's Context). The
// server trusts GameSession.activePlayerRole, a state-machine field, not
// a second auth boundary.
//
// Answer.kind is 'OWN' for every round type, plus 'PREDICTION' only for
// MIROIR questions (the guess at the partner's OWN answer). Scoring sums
// speed bonus over 'OWN' rows only (15 per player) so a MIROIR question's
// two answer rows (OWN + PREDICTION), submitted in one screen visit,
// never double-count elapsed time.
// ───────────────────────────────────────────────────────────────────────
model Question {
  id        String   @id @default(cuid())
  slug      String   @unique
  roundType String // MIROIR | SCENARIO | FACEAFACE
  category  String
  prompt    String
  options   Json // [{id,text}] for MIROIR/FACEAFACE; [{id,text,weight}] for SCENARIO — weight NEVER serialized to a client, see Task 9
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  roundQuestions GameRoundQuestion[]
  usages         QuestionUsage[]

  @@index([roundType, category, active])
}

model GameSession {
  id                     String    @id @default(cuid())
  coupleId               String
  couple                 Couple    @relation(fields: [coupleId], references: [id], onDelete: Cascade)
  status                 String    @default("IN_PROGRESS") // IN_PROGRESS | COMPLETED | ABANDONED
  currentRoundNumber     Int       @default(1) // 1-3
  currentQuestionNumber  Int       @default(1) // 1-5
  phase                  String    @default("PASS_DEVICE") // PASS_DEVICE | ANSWERING | ROUND_REVEAL | ROUND_INTRO | COMPLETE
  activePlayerRole       String // CREATOR | PARTNER
  currentQuestionShownAt DateTime? // re-stamped on every fresh PASS_DEVICE -> ANSWERING transition; cleared back to null on every transition out of ANSWERING
  jokersRemainingCreator Int       @default(2)
  jokersRemainingPartner Int       @default(2)
  startedAt              DateTime  @default(now())
  completedAt            DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  rounds GameRound[]
  result GameResult?

  @@index([coupleId, status])
}

model GameRound {
  id              String    @id @default(cuid())
  gameSessionId   String
  gameSession     GameSession @relation(fields: [gameSessionId], references: [id], onDelete: Cascade)
  roundNumber     Int // 1-3
  type            String // MIROIR | SCENARIO | FACEAFACE
  status          String    @default("PENDING") // PENDING | IN_PROGRESS | COMPLETED
  firstPlayerRole String // CREATOR | PARTNER — alternates per round, see lib/server/game/state-machine.ts
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  questions GameRoundQuestion[]

  @@unique([gameSessionId, roundNumber])
}

model GameRoundQuestion {
  id          String    @id @default(cuid())
  gameRoundId String
  gameRound   GameRound @relation(fields: [gameRoundId], references: [id], onDelete: Cascade)
  questionId  String
  question    Question  @relation(fields: [questionId], references: [id], onDelete: Restrict)
  orderIndex  Int // 0-4
  createdAt   DateTime  @default(now())

  answers Answer[]

  @@unique([gameRoundId, orderIndex])
}

model Answer {
  id                  String   @id @default(cuid())
  gameRoundQuestionId String
  gameRoundQuestion   GameRoundQuestion @relation(fields: [gameRoundQuestionId], references: [id], onDelete: Cascade)
  gameSessionId       String // denormalized — session-wide scoring queries without a deep join
  userId              String // Couple.creatorId or Couple.partnerId — see model-level doc comment above
  kind                String // OWN | PREDICTION (PREDICTION only exists for MIROIR questions)
  selectedOptionId    String?
  isSkipped           Boolean  @default(false)
  clientElapsedMs     Int? // raw client-reported timing, not trusted alone
  effectiveElapsedMs  Int // server-validated value used for scoring — see lib/server/game/scoring.ts
  answeredAt          DateTime @default(now())

  @@unique([gameRoundQuestionId, userId, kind])
  @@index([gameSessionId])
}

// Per-couple anti-repetition tracking — see lib/server/game/question-selection.ts.
model QuestionUsage {
  id           String   @id @default(cuid())
  coupleId     String
  couple       Couple   @relation(fields: [coupleId], references: [id], onDelete: Cascade)
  questionId   String
  question     Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  timesPlayed  Int      @default(1)
  lastPlayedAt DateTime @default(now())

  @@unique([coupleId, questionId])
  @@index([coupleId])
}

// Computed once when a GameSession completes — immutable (never recomputed
// on read) so the score a couple sees never changes between refreshes.
model GameResult {
  id                    String      @id @default(cuid())
  gameSessionId         String      @unique
  gameSession           GameSession @relation(fields: [gameSessionId], references: [id], onDelete: Cascade)
  coupleScore           Int
  complicityLevel       String // DECOUVERTE | COMPLICES | FUSIONNELS | INSEPARABLES
  creatorTotalScore     Int
  partnerTotalScore     Int
  creatorMirrorPoints   Int
  partnerMirrorPoints   Int
  creatorFidelityScore  Int
  partnerFidelityScore  Int
  alignmentPointsShared Int
  creatorSpeedBonus     Int
  partnerSpeedBonus     Int
  gapPercent            Float
  gapMasked             Boolean
  winnerRole            String? // CREATOR | PARTNER | TIE
  conversationPrompts   Json
  createdAt             DateTime @default(now())
}
```

Also add the inverse relations to `model Couple { ... }` (insert right
after the existing `updatedAt DateTime @updatedAt` line, before the
`@@index` block):

```prisma
  gameSessions   GameSession[]
  questionUsages QuestionUsage[]
```

- [ ] **Step 2: Format and validate**

Run: `cd frontend && npx prisma format`
Expected: exits 0.

- [ ] **Step 3: Generate the migration and apply it to Neon**

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
execSync("npx prisma migrate dev --name game_engine", { stdio: "inherit", env, cwd: "frontend" });
'
```

Expected: `Your database is now in sync with your schema.` A new
`frontend/prisma/migrations/<timestamp>_game_engine/migration.sql` appears.

- [ ] **Step 4: Regenerate the Prisma Client and typecheck**

Run: `cd frontend && npx prisma generate && npx tsc --noEmit`
Expected: `✔ Generated Prisma Client`, no `tsc` output.

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "Add game-engine Prisma models (Question, GameSession, GameRound, GameRoundQuestion, Answer, QuestionUsage, GameResult)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `Couple` extension — disclaimer + cumulative score

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create (generated + hand-written, mirroring
  `frontend/prisma/migrations/20260903093300_couple_creator_active_unique/`):
  `frontend/prisma/migrations/<timestamp>_game_session_in_progress_unique/migration.sql`

**Interfaces:**
- Produces: `Couple.disclaimerAcceptedByCreatorAt`,
  `Couple.disclaimerAcceptedByPartnerAt`, `Couple.cumulativeCoupleScore` —
  consumed by Task 8 (this lot) and by Lot 2's `POST /api/games` precondition
  and results/complicity-level computation.

- [ ] **Step 1: Add the three fields to `model Couple`**

In `frontend/prisma/schema.prisma`, inside `model Couple { ... }`, add
after `updatedAt DateTime @updatedAt` (before the relations added in
Task 1):

```prisma
  disclaimerAcceptedByCreatorAt DateTime?
  disclaimerAcceptedByPartnerAt DateTime?
  cumulativeCoupleScore         Int       @default(0)
```

- [ ] **Step 2: Generate the migration**

Same `node -e` wrapper as Task 1, Step 3, with
`--name couple_disclaimer_and_score` instead of `game_engine`.

- [ ] **Step 3: Add the partial unique index (raw SQL, hand-appended)**

Open the freshly generated
`frontend/prisma/migrations/<timestamp>_couple_disclaimer_and_score/migration.sql`
and append this statement at the end of the file (same pattern as
`frontend/prisma/migrations/20260903093300_couple_creator_active_unique/migration.sql`
— read that file for the exact precedent before writing this one):

```sql
-- One IN_PROGRESS GameSession per couple at a time. GameSession.status
-- has no schema-level enum (String convention, see Global Constraints),
-- so this is a raw partial index Prisma's DSL cannot express.
CREATE UNIQUE INDEX "GameSession_couple_in_progress_unique"
  ON "GameSession"("coupleId") WHERE status = 'IN_PROGRESS';
```

Re-run the same `node -e` wrapper's `prisma migrate dev` command (it will
detect the manually-edited migration file is out of sync and prompt to
apply — alternatively run `npx prisma db execute` against the appended SQL
directly if `migrate dev` resists a manually-edited file; verify with
`npx prisma migrate status` that the migration is marked applied).

- [ ] **Step 4: Regenerate the Prisma Client and typecheck**

Run: `cd frontend && npx prisma generate && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "Add Couple disclaimer + cumulative score fields, one-IN_PROGRESS-session partial index

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `question-selection.ts` — anti-repetition (80% rule)

**Files:**
- Create: `frontend/src/lib/server/game/question-selection.ts`
- Create: `frontend/src/lib/server/game/question-selection.test.ts`

**Interfaces:**
- Consumes: `Prisma`/`PrismaClient` types from `@prisma/client`.
- Produces: `selectQuestionsForRound(client, params): Promise<{ id: string }[]>`
  — consumed by Lot 2's `POST /api/games`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/game/question-selection.test.ts` covering
at minimum these cases (write full Vitest `describe`/`it` blocks, mocking
`prismaMock.question.findMany` and `prismaMock.questionUsage.findMany` /
`upsert` from `@/test-utils/prisma-mock`, following the mocking style of
`frontend/src/lib/server/couples/queries.test.ts`):

1. With no `QuestionUsage` rows for the couple, picks `count` random
   questions from the full active pool of the given `roundType`.
2. When a category is below the 80% exhaustion threshold, excludes
   already-played questions in that category from the draw.
3. When a category has been played `>= ceil(0.8 * totalInCategory)` times,
   the entire category becomes eligible again (including previously-played
   questions).
4. `excludeQuestionIds` is always honored, even for an exhausted category
   (never returns a duplicate within the same session's 15-question draw).
5. Safety net: when the eligible pool after all filtering is smaller than
   `count`, backfills with the questions having the oldest
   `QuestionUsage.lastPlayedAt` rather than throwing — and never throws
   even when the couple has zero `QuestionUsage` history and the raw pool
   itself is smaller than `count` (falls back to returning every available
   active question for that `roundType` without erroring).
6. Selection is scoped to `active: true` questions of the requested
   `roundType` only — never returns a question from a different
   `roundType`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/server/game/question-selection.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `question-selection.ts`**

```typescript
// Anti-repetition question draw for a game round (PRD §5.4 — "banque de
// questions" should not feel repetitive across replays). Rule: a category
// is "exhausted" once the couple has played >= 80% of its questions; an
// exhausted category becomes fully eligible again (including its
// already-played questions) rather than blocking the round.
import 'server-only';
import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export interface SelectQuestionsParams {
  coupleId: string;
  roundType: string;
  count: number;
  excludeQuestionIds?: string[];
}

function shuffleAndTake<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    const idx = crypto.randomInt(0, pool.length);
    result.push(pool.splice(idx, 1)[0] as T);
  }
  return result;
}

export async function selectQuestionsForRound(
  client: QueryClient,
  { coupleId, roundType, count, excludeQuestionIds = [] }: SelectQuestionsParams,
): Promise<{ id: string }[]> {
  const excludeSet = new Set(excludeQuestionIds);

  const questions = await client.question.findMany({
    where: { roundType, active: true },
    select: { id: true, category: true },
  });

  const usages = await client.questionUsage.findMany({
    where: { coupleId },
    select: { questionId: true, timesPlayed: true, lastPlayedAt: true },
  });
  const usageByQuestion = new Map(usages.map((u) => [u.questionId, u]));

  const byCategory = new Map<string, { id: string; category: string }[]>();
  for (const q of questions) {
    const list = byCategory.get(q.category) ?? [];
    list.push(q);
    byCategory.set(q.category, list);
  }

  const eligible: { id: string; category: string }[] = [];
  for (const [category, categoryQuestions] of byCategory) {
    const playedInCategory = categoryQuestions.filter((q) => usageByQuestion.has(q.id)).length;
    const exhausted = playedInCategory >= Math.ceil(0.8 * categoryQuestions.length);
    for (const q of categoryQuestions) {
      if (excludeSet.has(q.id)) continue;
      if (exhausted || !usageByQuestion.has(q.id)) eligible.push(q);
    }
  }

  let selected = shuffleAndTake(eligible, count);

  if (selected.length < count) {
    const selectedIds = new Set(selected.map((q) => q.id));
    const remaining = questions
      .filter((q) => !excludeSet.has(q.id) && !selectedIds.has(q.id))
      .sort((a, b) => {
        const aTime = usageByQuestion.get(a.id)?.lastPlayedAt.getTime() ?? 0;
        const bTime = usageByQuestion.get(b.id)?.lastPlayedAt.getTime() ?? 0;
        return aTime - bTime;
      });
    selected = [...selected, ...remaining.slice(0, count - selected.length)];
  }

  return selected.map((q) => ({ id: q.id }));
}

export async function recordQuestionUsage(
  client: QueryClient,
  coupleId: string,
  questionIds: string[],
): Promise<void> {
  for (const questionId of questionIds) {
    await client.questionUsage.upsert({
      where: { coupleId_questionId: { coupleId, questionId } },
      create: { coupleId, questionId, timesPlayed: 1, lastPlayedAt: new Date() },
      update: { timesPlayed: { increment: 1 }, lastPlayedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/server/game/question-selection.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/game/question-selection.ts frontend/src/lib/server/game/question-selection.test.ts
git commit -m "Add question-selection.ts with the 80% anti-repetition rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Seed schema + script + the 27 starter questions

**Files:**
- Create: `frontend/src/lib/server/game/question-seed-schema.ts`
- Create: `frontend/prisma/seed-data/questions.ts`
- Create: `frontend/scripts/seed-questions.ts`
- Test: `frontend/src/lib/server/game/question-seed-schema.test.ts`

**Interfaces:**
- Produces: `QUESTIONS_SEED: QuestionSeed[]` (27 entries) — consumed by
  `seed-questions.ts` and reused directly by test fixtures in Tasks 3, 5, 6
  wherever a realistic `Question.options` shape is useful.

- [ ] **Step 1: Implement the Zod schema**

Create `frontend/src/lib/server/game/question-seed-schema.ts`:

```typescript
import { z } from 'zod';

const BaseOption = z.object({ id: z.string().min(1), text: z.string().min(1) });
const ScenarioOption = BaseOption.extend({ weight: z.number().int().min(0).max(10) });

export const QuestionSeedSchema = z
  .object({
    slug: z.string().min(1),
    roundType: z.enum(['MIROIR', 'SCENARIO', 'FACEAFACE']),
    category: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(z.union([ScenarioOption, BaseOption])).min(2),
  })
  .superRefine((val, ctx) => {
    const hasWeight = val.options.some((o) => 'weight' in o);
    if (val.roundType === 'SCENARIO' && !val.options.every((o) => 'weight' in o)) {
      ctx.addIssue({ code: 'custom', message: 'SCENARIO options must all declare a weight' });
    }
    if (val.roundType !== 'SCENARIO' && hasWeight) {
      ctx.addIssue({ code: 'custom', message: `${val.roundType} options must not declare a weight` });
    }
  });

export type QuestionSeed = z.infer<typeof QuestionSeedSchema>;

export function validateQuestionSeeds(seeds: QuestionSeed[]): void {
  const slugs = new Set<string>();
  for (const seed of seeds) {
    const parsed = QuestionSeedSchema.safeParse(seed);
    if (!parsed.success) {
      throw new Error(`Invalid question seed "${seed.slug}": ${parsed.error.message}`);
    }
    if (slugs.has(seed.slug)) {
      throw new Error(`Duplicate question slug: ${seed.slug}`);
    }
    slugs.add(seed.slug);
  }
}
```

- [ ] **Step 2: Write and run schema tests**

Create `frontend/src/lib/server/game/question-seed-schema.test.ts` with
cases: a valid MIROIR seed passes; a SCENARIO seed missing `weight` on one
option fails; a MIROIR seed WITH a `weight` fails; a duplicate slug across
two seeds throws in `validateQuestionSeeds`; an out-of-range weight (11 or
-1) fails.

Run: `cd frontend && npx vitest run src/lib/server/game/question-seed-schema.test.ts`
Expected: all pass once implemented.

- [ ] **Step 3: Transcribe the 27 starter questions**

Create `frontend/prisma/seed-data/questions.ts`. Transcribe **exactly** the
following 27 entries (option ids `a`/`b`/`c`/`d` in the listed order; every
SCENARIO option carries the weight shown in parentheses):

```typescript
import type { QuestionSeed } from '@/lib/server/game/question-seed-schema';

export const QUESTIONS_SEED: QuestionSeed[] = [
  // ── MIROIR — Quotidien & habitudes ──────────────────────────────────
  {
    slug: 'mirror-reveil',
    roundType: 'MIROIR',
    category: 'Quotidien & habitudes',
    prompt: 'Que fait ton/ta partenaire en premier le matin ?',
    options: [
      { id: 'a', text: 'Vérifie son téléphone' },
      { id: 'b', text: 'Prend un café ou un thé' },
      { id: 'c', text: 'Se recoiffe ou se prépare' },
      { id: 'd', text: 'Reste au lit encore un peu' },
    ],
  },
  {
    slug: 'mirror-tache-menagere',
    roundType: 'MIROIR',
    category: 'Quotidien & habitudes',
    prompt: 'Quelle tâche ménagère ton/ta partenaire déteste le plus ?',
    options: [
      { id: 'a', text: 'Faire la vaisselle' },
      { id: 'b', text: 'Faire le ménage' },
      { id: 'c', text: 'Faire les courses' },
      { id: 'd', text: 'Faire la lessive' },
    ],
  },
  {
    slug: 'mirror-plat-prefere',
    roundType: 'MIROIR',
    category: 'Quotidien & habitudes',
    prompt: 'Quel est le plat préféré de ton/ta partenaire ?',
    options: [
      { id: 'a', text: 'Un plat traditionnel familial' },
      { id: 'b', text: 'Un plat découvert récemment' },
      { id: 'c', text: 'Un dessert sucré' },
      { id: 'd', text: 'Un plat épicé' },
    ],
  },
  {
    slug: 'mirror-dimanche-pluvieux',
    roundType: 'MIROIR',
    category: 'Quotidien & habitudes',
    prompt: 'Comment ton/ta partenaire préfère-t-il/elle passer un dimanche pluvieux ?',
    options: [
      { id: 'a', text: 'Regarder un film ou une série' },
      { id: 'b', text: 'Lire un livre' },
      { id: 'c', text: 'Dormir' },
      { id: 'd', text: 'Cuisiner' },
    ],
  },
  // ── MIROIR — Communication ──────────────────────────────────────────
  {
    slug: 'mirror-sujet-conversation',
    roundType: 'MIROIR',
    category: 'Communication',
    prompt: 'Quel est le sujet préféré de conversation de ton/ta partenaire avec ses amis ?',
    options: [
      { id: 'a', text: 'Le travail' },
      { id: 'b', text: 'Les relations' },
      { id: 'c', text: "L'actualité" },
      { id: 'd', text: 'Les loisirs' },
    ],
  },
  {
    slug: 'mirror-reaction-desaccord',
    roundType: 'MIROIR',
    category: 'Communication',
    prompt: 'Comment ton/ta partenaire réagit-il/elle le mieux face à un désaccord ?',
    options: [
      { id: 'a', text: 'En parlant tout de suite' },
      { id: 'b', text: "En prenant du recul avant d'en parler" },
      { id: 'c', text: 'En écrivant ses pensées' },
      { id: 'd', text: 'En cherchant un compromis rapide' },
    ],
  },
  {
    slug: 'mirror-compliment',
    roundType: 'MIROIR',
    category: 'Communication',
    prompt: 'Quel compliment touche le plus ton/ta partenaire ?',
    options: [
      { id: 'a', text: 'Sur son physique' },
      { id: 'b', text: 'Sur son intelligence' },
      { id: 'c', text: 'Sur sa gentillesse' },
      { id: 'd', text: 'Sur son humour' },
    ],
  },
  // ── MIROIR — Souvenirs & couple ─────────────────────────────────────
  {
    slug: 'mirror-souvenir-marquant',
    roundType: 'MIROIR',
    category: 'Souvenirs & couple',
    prompt: 'Quel souvenir ton/ta partenaire garde-t-il/elle comme le plus marquant de votre relation ?',
    options: [
      { id: 'a', text: 'Votre premier rendez-vous' },
      { id: 'b', text: 'Un voyage ensemble' },
      { id: 'c', text: 'Une déclaration importante' },
      { id: 'd', text: 'Un moment du quotidien tout simple' },
    ],
  },
  {
    slug: 'mirror-geste-romantique',
    roundType: 'MIROIR',
    category: 'Souvenirs & couple',
    prompt: 'Quel geste romantique touche le plus ton/ta partenaire ?',
    options: [
      { id: 'a', text: 'Un mot doux inattendu' },
      { id: 'b', text: 'Une surprise organisée' },
      { id: 'c', text: 'Un cadeau pensé pour lui/elle' },
      { id: 'd', text: 'Un moment rien que tous les deux' },
    ],
  },
  // ── SCENARIO — Confiance & Jalousie ─────────────────────────────────
  {
    slug: 'scenario-ex-contact',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: "Un(e) ex te contacte pour prendre des nouvelles. Tu…",
    options: [
      { id: 'a', text: "Je réponds et j'en parle ensuite à mon/ma partenaire", weight: 9 },
      { id: 'b', text: 'Je réponds sans forcément en parler', weight: 5 },
      { id: 'c', text: 'Je ne réponds pas mais je garde le message', weight: 6 },
      { id: 'd', text: 'Je bloque directement le contact', weight: 8 },
    ],
  },
  {
    slug: 'scenario-flirt-soiree',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Tu croises un ancien flirt en soirée. Tu…',
    options: [
      { id: 'a', text: 'Je dis bonjour poliment et je passe mon chemin', weight: 9 },
      { id: 'b', text: 'Je discute un peu par politesse', weight: 7 },
      { id: 'c', text: 'Je discute longuement, ça me fait plaisir de le/la revoir', weight: 3 },
      { id: 'd', text: "Je l'évite complètement", weight: 6 },
    ],
  },
  {
    slug: 'scenario-telephone-consulte',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Ton/ta partenaire consulte ton téléphone sans prévenir. Tu…',
    options: [
      { id: 'a', text: "Ça ne me dérange pas, je n'ai rien à cacher", weight: 8 },
      { id: 'b', text: 'Je le vis mal, même sans rien cacher', weight: 5 },
      { id: 'c', text: 'Je pose des limites calmement', weight: 7 },
      { id: 'd', text: 'Je réagis fortement', weight: 3 },
    ],
  },
  {
    slug: 'scenario-collegue-compliment',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Un(e) collègue attirant(e) te complimente beaucoup. Tu…',
    options: [
      { id: 'a', text: 'Je remercie sobrement et je change de sujet', weight: 8 },
      { id: 'b', text: "J'apprécie le compliment sans plus", weight: 6 },
      { id: 'c', text: "J'en parle avec plaisir à mon/ma partenaire", weight: 9 },
      { id: 'd', text: "J'apprécie et je garde ça pour moi", weight: 4 },
    ],
  },
  {
    slug: 'scenario-ami-mensonge',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: "Tu apprends qu'un(e) ami(e) commun(e) a menti pour couvrir une sortie de ton/ta partenaire. Tu…",
    options: [
      { id: 'a', text: 'Je demande des explications directement à mon/ma partenaire', weight: 9 },
      { id: 'b', text: 'Je laisse couler sans rien dire', weight: 3 },
      { id: 'c', text: "J'en parle à l'ami(e) d'abord", weight: 5 },
      { id: 'd', text: "Je m'inquiète mais je n'ose rien dire", weight: 4 },
    ],
  },
  // ── SCENARIO — Réseaux sociaux & Téléphone ──────────────────────────
  {
    slug: 'scenario-message-prive',
    roundType: 'SCENARIO',
    category: 'Réseaux sociaux & Téléphone',
    prompt: "Tu reçois un message privé flatteur d'un(e) inconnu(e) sur les réseaux. Tu…",
    options: [
      { id: 'a', text: "J'ignore ou je supprime le message", weight: 9 },
      { id: 'b', text: 'Je réponds poliment une seule fois', weight: 6 },
      { id: 'c', text: "Je continue la conversation, c'est flatteur", weight: 2 },
      { id: 'd', text: 'Je montre le message à mon/ta partenaire en rigolant', weight: 8 },
    ],
  },
  {
    slug: 'scenario-code-telephone',
    roundType: 'SCENARIO',
    category: 'Réseaux sociaux & Téléphone',
    prompt: 'Ton/ta partenaire te demande le code de ton téléphone. Tu…',
    options: [
      { id: 'a', text: 'Je le donne sans hésiter', weight: 8 },
      { id: 'b', text: 'Je le donne mais ça me met mal à l\'aise', weight: 5 },
      { id: 'c', text: "Je refuse, c'est une question de vie privée", weight: 4 },
      { id: 'd', text: 'Je propose plutôt de regarder ensemble', weight: 7 },
    ],
  },
  {
    slug: 'scenario-likes-inconnu',
    roundType: 'SCENARIO',
    category: 'Réseaux sociaux & Téléphone',
    prompt: "Tu vois que ton/ta partenaire a liké beaucoup de photos d'un(e) inconnu(e). Tu…",
    options: [
      { id: 'a', text: 'Je lui en parle calmement', weight: 8 },
      { id: 'b', text: 'Je regarde discrètement le profil moi-même', weight: 5 },
      { id: 'c', text: "Je n'y prête pas attention", weight: 6 },
      { id: 'd', text: 'Ça m\'agace mais je ne dis rien', weight: 4 },
    ],
  },
  {
    slug: 'scenario-conversation-intime',
    roundType: 'SCENARIO',
    category: 'Réseaux sociaux & Téléphone',
    prompt: 'Tu retrouves une ancienne conversation intime avec quelqu\'un d\'autre. Tu…',
    options: [
      { id: 'a', text: 'Je la supprime sans y repenser', weight: 7 },
      { id: 'b', text: 'Je la garde par nostalgie', weight: 3 },
      { id: 'c', text: "J'en parle ouvertement à mon/ma partenaire si besoin", weight: 9 },
      { id: 'd', text: 'Je la garde en cas de besoin plus tard', weight: 2 },
    ],
  },
  // ── FACEAFACE — Valeurs & couple ────────────────────────────────────
  {
    slug: 'faceaface-important-couple',
    roundType: 'FACEAFACE',
    category: 'Valeurs & couple',
    prompt: 'Ce qui compte le plus dans un couple :',
    options: [
      { id: 'a', text: 'La confiance' },
      { id: 'b', text: 'La communication' },
      { id: 'c', text: 'La passion' },
      { id: 'd', text: 'Le respect' },
    ],
  },
  {
    slug: 'faceaface-avenir',
    roundType: 'FACEAFACE',
    category: 'Valeurs & couple',
    prompt: "Le plus important pour l'avenir :",
    options: [
      { id: 'a', text: 'La famille' },
      { id: 'b', text: 'La carrière' },
      { id: 'c', text: 'La liberté' },
      { id: 'd', text: 'Les voyages' },
    ],
  },
  {
    slug: 'faceaface-desaccord',
    roundType: 'FACEAFACE',
    category: 'Valeurs & couple',
    prompt: 'En cas de désaccord, ce qui compte le plus :',
    options: [
      { id: 'a', text: 'Trouver un compromis' },
      { id: 'b', text: "Que chacun s'exprime" },
      { id: 'c', text: 'Se réconcilier vite' },
      { id: 'd', text: 'Prendre le temps de réfléchir' },
    ],
  },
  {
    slug: 'faceaface-pilier',
    roundType: 'FACEAFACE',
    category: 'Valeurs & couple',
    prompt: "Le pilier d'une relation solide :",
    options: [
      { id: 'a', text: 'La fidélité' },
      { id: 'b', text: 'La complicité' },
      { id: 'c', text: 'Le soutien mutuel' },
      { id: 'd', text: "L'honnêteté" },
    ],
  },
  {
    slug: 'faceaface-soiree-reussie',
    roundType: 'FACEAFACE',
    category: 'Valeurs & couple',
    prompt: 'Ce qui rend une soirée en couple réussie :',
    options: [
      { id: 'a', text: 'Une bonne discussion' },
      { id: 'b', text: 'Un fou rire' },
      { id: 'c', text: 'Un bon repas' },
      { id: 'd', text: 'Un moment de calme partagé' },
    ],
  },
  // ── FACEAFACE — Quotidien ───────────────────────────────────────────
  {
    slug: 'faceaface-weekend-ideal',
    roundType: 'FACEAFACE',
    category: 'Quotidien',
    prompt: 'Le week-end idéal :',
    options: [
      { id: 'a', text: 'Une sortie en amoureux' },
      { id: 'b', text: 'Du repos à la maison' },
      { id: 'c', text: 'Une activité en groupe' },
      { id: 'd', text: 'Une découverte nouvelle' },
    ],
  },
  {
    slug: 'faceaface-geste-quotidien',
    roundType: 'FACEAFACE',
    category: 'Quotidien',
    prompt: 'Le petit geste du quotidien le plus important :',
    options: [
      { id: 'a', text: 'Un message dans la journée' },
      { id: 'b', text: 'Un câlin en rentrant' },
      { id: 'c', text: 'Un compliment sincère' },
      { id: 'd', text: 'Un moment sans téléphone' },
    ],
  },
  {
    slug: 'faceaface-priorite-budget',
    roundType: 'FACEAFACE',
    category: 'Quotidien',
    prompt: 'La priorité budget du couple :',
    options: [
      { id: 'a', text: "Épargner pour l'avenir" },
      { id: 'b', text: 'Profiter du moment présent' },
      { id: 'c', text: 'Investir dans un projet commun' },
      { id: 'd', text: 'Se faire plaisir de temps en temps' },
    ],
  },
  {
    slug: 'faceaface-decompresser',
    roundType: 'FACEAFACE',
    category: 'Quotidien',
    prompt: "Ce qui aide le plus à décompresser après une journée difficile :",
    options: [
      { id: 'a', text: 'En parler ensemble' },
      { id: 'b', text: 'Un moment de silence' },
      { id: 'c', text: 'Une activité qui change les idées' },
      { id: 'd', text: 'Un câlin ou un contact physique' },
    ],
  },
];
```

- [ ] **Step 4: Implement the seed script**

Create `frontend/scripts/seed-questions.ts`, modeled directly on
`frontend/scripts/seed-dev.ts` (read that file first for the exact
`main(args, deps)` / `NODE_ENV` guard / `import.meta.url` CLI-guard
pattern). Upsert every `QUESTIONS_SEED` entry by `slug`:

```typescript
import { validateQuestionSeeds } from '../src/lib/server/game/question-seed-schema';
import { QUESTIONS_SEED } from '../prisma/seed-data/questions';
import type { PrismaClient } from '@prisma/client';

export async function main(_args: string[], deps: { prisma: PrismaClient }): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-questions must not run against production');
  }
  validateQuestionSeeds(QUESTIONS_SEED);
  for (const q of QUESTIONS_SEED) {
    await deps.prisma.question.upsert({
      where: { slug: q.slug },
      create: { ...q },
      update: { roundType: q.roundType, category: q.category, prompt: q.prompt, options: q.options },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${QUESTIONS_SEED.length} questions.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await main(process.argv.slice(2), { prisma });
  } finally {
    await prisma.$disconnect();
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (in particular, confirm every SCENARIO entry above has
`weight` on all 4 options and no MIROIR/FACEAFACE entry has any —
`QuestionSeedSchema`'s `superRefine` plus the `QuestionSeed[]` type
annotation should catch a transcription mistake at compile time via the
discriminated option union; if it doesn't catch a bad entry, run
`validateQuestionSeeds(QUESTIONS_SEED)` in a throwaway script to confirm
at runtime instead).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/game/question-seed-schema.ts frontend/src/lib/server/game/question-seed-schema.test.ts frontend/prisma/seed-data/questions.ts frontend/scripts/seed-questions.ts
git commit -m "Add question seed schema, 27 starter questions, and seed-questions script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `state-machine.ts` — phase transitions

**Files:**
- Create: `frontend/src/lib/server/game/state-machine.ts`
- Create: `frontend/src/lib/server/game/state-machine.test.ts`

**Interfaces:**
- Produces: pure functions consumed by Lot 2's `/api/games/*` routes —
  Lot 2 will decide exact route-to-function wiring, but the transition
  RULES below are binding now and must not change without revisiting this
  plan.
- No Prisma import. Inputs/outputs are plain objects mirroring the
  relevant `GameSession`/`GameRound` columns from Task 1 — never the
  Prisma model type directly, so this module stays testable without a
  database.

- [ ] **Step 1: Define the required shape and functions**

```typescript
export interface SessionPhaseState {
  currentRoundNumber: number; // 1-3
  currentQuestionNumber: number; // 1-5
  phase: string; // PASS_DEVICE | ANSWERING | ROUND_REVEAL | ROUND_INTRO | COMPLETE
  activePlayerRole: string; // CREATOR | PARTNER
  currentQuestionShownAt: Date | null;
}

export function firstPlayerRoleForRound(roundNumber: number): 'CREATOR' | 'PARTNER' {
  // CREATOR starts round 1, PARTNER starts round 2, CREATOR starts round 3.
}

export function startAnsweringTurn(state: SessionPhaseState, now: Date): SessionPhaseState {
  // PASS_DEVICE -> ANSWERING. Stamps currentQuestionShownAt = now IF it is
  // currently null (idempotent — a second call while already ANSWERING
  // must not overwrite the stamp, since that would corrupt the speed-bonus
  // timer for a client that re-fetches state mid-turn).
}

export interface AdvanceAfterAnswerResult {
  state: SessionPhaseState;
  roundCompleted: boolean; // true when this was the 5th question's 2nd answer
}

export function advanceAfterAnswer(
  state: SessionPhaseState,
  ownAnswersRecordedForCurrentQuestion: 1 | 2,
): AdvanceAfterAnswerResult {
  // 1 -> toggle activePlayerRole, phase = PASS_DEVICE, clear
  //      currentQuestionShownAt to null, question number UNCHANGED.
  // 2, currentQuestionNumber < 5 -> currentQuestionNumber += 1,
  //      activePlayerRole = firstPlayerRoleForRound(currentRoundNumber)
  //      (both players start every question from the SAME configured
  //      starter — see Global Constraints' firstPlayerRole doc comment on
  //      GameRound in Task 1), phase = PASS_DEVICE,
  //      currentQuestionShownAt = null, roundCompleted = false.
  // 2, currentQuestionNumber === 5 -> phase = ROUND_REVEAL,
  //      currentQuestionShownAt = null, roundCompleted = true
  //      (currentRoundNumber/currentQuestionNumber left as-is; the caller
  //      persists GameRound.status = 'COMPLETED' separately).
}

export interface AdvanceRoundResult {
  state: SessionPhaseState;
  gameCompleted: boolean;
}

export function advanceRound(state: SessionPhaseState): AdvanceRoundResult {
  // Only valid when state.phase === 'ROUND_REVEAL'.
  // currentRoundNumber < 3 -> currentRoundNumber += 1, currentQuestionNumber = 1,
  //      phase = 'ROUND_INTRO', activePlayerRole = firstPlayerRoleForRound(new round),
  //      gameCompleted = false.
  // currentRoundNumber === 3 -> phase = 'COMPLETE', gameCompleted = true
  //      (caller persists GameSession.status = 'COMPLETED' + computes
  //      GameResult separately — this function only owns phase/round/question).
}

export function resolvePhaseOnRead(state: SessionPhaseState): SessionPhaseState {
  // Lazily flips ROUND_INTRO -> PASS_DEVICE the first time state is read
  // after advanceRound moved a session there — mirrors the lazy
  // currentQuestionShownAt stamping in startAnsweringTurn. Every other
  // phase passes through unchanged.
}
```

Implement each function per its comment above. Throw on invalid calls
(e.g. `advanceRound` when `phase !== 'ROUND_REVEAL'`, or
`ownAnswersRecordedForCurrentQuestion` outside `{1,2}`) rather than
silently no-op-ing — a caller hitting these is a Lot 2 routing bug that
should fail loudly in tests, not corrupt game state silently.

- [ ] **Step 2: Write the tests**

Cover at minimum, as literal `it(...)` cases with concrete input/output
objects (not just prose):

- `firstPlayerRoleForRound(1) === 'CREATOR'`,
  `firstPlayerRoleForRound(2) === 'PARTNER'`,
  `firstPlayerRoleForRound(3) === 'CREATOR'`.
- `startAnsweringTurn` stamps `now` when `currentQuestionShownAt` is null;
  leaves an existing non-null stamp untouched on a second call.
- `advanceAfterAnswer` with `1`: toggles `activePlayerRole` CREATOR↔PARTNER,
  sets `phase = 'PASS_DEVICE'`, clears the timestamp, leaves
  `currentQuestionNumber` unchanged, `roundCompleted: false`.
- `advanceAfterAnswer` with `2` and `currentQuestionNumber < 5`: increments
  `currentQuestionNumber`, resets `activePlayerRole` to the round's starter
  (test both round 1 → stays CREATOR-starting and round 2 → stays
  PARTNER-starting), `phase = 'PASS_DEVICE'`, `roundCompleted: false`.
- `advanceAfterAnswer` with `2` and `currentQuestionNumber === 5`:
  `phase = 'ROUND_REVEAL'`, `roundCompleted: true`.
- `advanceRound` from round 1 → `currentRoundNumber = 2`,
  `currentQuestionNumber = 1`, `phase = 'ROUND_INTRO'`,
  `activePlayerRole = 'PARTNER'`, `gameCompleted: false`.
- `advanceRound` from round 3 → `phase = 'COMPLETE'`, `gameCompleted: true`.
- `advanceRound` throws when `phase !== 'ROUND_REVEAL'`.
- `resolvePhaseOnRead` flips `ROUND_INTRO` → `PASS_DEVICE`; every other
  phase (`PASS_DEVICE`, `ANSWERING`, `ROUND_REVEAL`, `COMPLETE`) is
  returned unchanged (same object shape, same values).

- [ ] **Step 3: Run the tests, implement until green**

Run: `cd frontend && npx vitest run src/lib/server/game/state-machine.test.ts`

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/game/state-machine.ts frontend/src/lib/server/game/state-machine.test.ts
git commit -m "Add pure game-phase state machine

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `scoring.ts` — the scoring engine

**Files:**
- Create: `frontend/src/lib/server/game/scoring.ts`
- Create: `frontend/src/lib/server/game/scoring.test.ts`

**Interfaces:**
- Produces: `computeGameResult(input): GameResultComputation` — consumed by
  Lot 2's `POST /api/games/:id/round/advance` (final-round branch). No
  Prisma import; pure function over plain arrays of answer-like objects.

- [ ] **Step 1: Define exact constants and the required signature**

```typescript
export const MIRROR_POINTS_PER_MATCH = 10;
export const ALIGNMENT_POINTS_PER_MATCH = 10;
export const MIRROR_MULTIPLIER = 1.0;
export const FIDELITY_MULTIPLIER = 1.5;
export const ALIGNMENT_MULTIPLIER = 1.0;
export const TIMER_MS = 45_000;
export const NETWORK_GRACE_MS = 2_000;
export const MAX_SPEED_POINTS_PER_QUESTION = 5;
export const SPEED_BONUS_CAP_RATIO = 0.10;
export const GAP_MASK_THRESHOLD_PERCENT = 40;

export const COMPLICITY_THRESHOLDS = [
  { level: 'DECOUVERTE', min: 0 },
  { level: 'COMPLICES', min: 100 },
  { level: 'FUSIONNELS', min: 300 },
  { level: 'INSEPARABLES', min: 600 },
] as const;

export const CONVERSATION_PROMPTS: readonly string[] = [
  // 6-8 generic, static French prompts — content decision, not derived
  // from any player's actual answers (PRD §11 guardrail: no archive of
  // individual past answers). Write 6-8 short, warm, non-judgmental
  // prompts along these lines (exact wording is a content decision for
  // the implementer, but must stay generic/non-answer-derived):
  // "Quel a été votre plus beau souvenir ce mois-ci ?",
  // "Y a-t-il quelque chose que vous n'avez jamais osé demander à l'autre ?",
  // "Qu'est-ce qui vous ferait sentir encore plus proches cette semaine ?", …
];
```

```typescript
export function computeEffectiveElapsedMs(
  clientElapsedMs: number | null,
  serverElapsedMs: number,
): number {
  // max(clientElapsedMs ?? serverElapsedMs, serverElapsedMs - NETWORK_GRACE_MS),
  // clamped to [0, TIMER_MS].
}

export interface ScoredAnswer {
  questionId: string;
  roundType: 'MIROIR' | 'SCENARIO' | 'FACEAFACE';
  userId: string;
  kind: 'OWN' | 'PREDICTION';
  selectedOptionId: string | null;
  isSkipped: boolean;
  effectiveElapsedMs: number;
  // For SCENARIO OWN answers only — the weight of selectedOptionId,
  // resolved by the caller from Question.options before calling
  // computeGameResult (this module never sees raw Question rows).
  optionWeight?: number;
}

export interface ComputeGameResultInput {
  creatorId: string;
  partnerId: string;
  cumulativeCoupleScoreBeforeThisGame: number;
  answers: ScoredAnswer[]; // every Answer row across all 3 rounds, both players
}

export interface GameResultComputation {
  coupleScore: number;
  complicityLevel: string;
  creatorTotalScore: number;
  partnerTotalScore: number;
  creatorMirrorPoints: number;
  partnerMirrorPoints: number;
  creatorFidelityScore: number;
  partnerFidelityScore: number;
  alignmentPointsShared: number;
  creatorSpeedBonus: number;
  partnerSpeedBonus: number;
  gapPercent: number;
  gapMasked: boolean;
  winnerRole: 'CREATOR' | 'PARTNER' | 'TIE';
  creatorTitle: string; // "Cœur d'Or" | "Cœur Sincère"
  partnerTitle: string;
  conversationPrompts: string[]; // 3 entries, randomly drawn from CONVERSATION_PROMPTS
}

export function computeGameResult(input: ComputeGameResultInput): GameResultComputation {
  // See the exact formulas in this plan's prose below — implement
  // faithfully, they are not open to reinterpretation.
}
```

- [ ] **Step 2: Implement per these exact rules**

- **`mirrorPoints` (per player)**: for every MIROIR question, does this
  player's `PREDICTION` `selectedOptionId` equal the OTHER player's `OWN`
  `selectedOptionId` for that same question? Each match is
  `+ MIRROR_POINTS_PER_MATCH`. A skipped prediction never matches.
- **`fidelityScore` (per player)**: sum of `optionWeight` across this
  player's SCENARIO `OWN` answers (0 for a skipped question).
- **`alignmentPointsShared` (single value, both players)**: count of
  FACEAFACE questions where creator's `OWN` `selectedOptionId` equals
  partner's `OWN` `selectedOptionId` for that question, `× ALIGNMENT_POINTS_PER_MATCH`.
- **`rawScore` (per player)** = `mirrorPoints × MIRROR_MULTIPLIER + fidelityScore × FIDELITY_MULTIPLIER + alignmentPointsShared × ALIGNMENT_MULTIPLIER`
  (note: `alignmentPointsShared` is the SAME number added into both
  players' `rawScore`).
- **`speedBonus` (per player)**: sum, over this player's 15 `OWN`-kind
  answers only (5 per round × 3 rounds — `PREDICTION` rows excluded to
  avoid double-counting a MIROIR question's single screen-visit timing),
  of `MAX_SPEED_POINTS_PER_QUESTION × max(0, (TIMER_MS - effectiveElapsedMs) / TIMER_MS)`,
  with `0` contributed by any `isSkipped` answer — then capped at
  `SPEED_BONUS_CAP_RATIO × rawScore` (apply the cap AFTER summing raw
  per-question bonus, not per-question).
- **`totalScore` (per player)** = `rawScore + speedBonus`.
- **`coupleScore`** = `alignmentPointsShared × 2`.
- **`gapPercent`** = `abs(creatorTotalScore - partnerTotalScore) / max(creatorTotalScore, partnerTotalScore, 1) × 100`.
  `gapMasked = gapPercent > GAP_MASK_THRESHOLD_PERCENT`.
- **`winnerRole`**: `'TIE'` when `creatorTotalScore === partnerTotalScore`;
  otherwise the higher scorer's role.
- **Titles**: on a tie, both get `"Cœur d'Or"`. Otherwise the higher
  scorer gets `"Cœur d'Or"`, the other gets `"Cœur Sincère"` — never any
  other label.
- **`complicityLevel`**: look up
  `cumulativeCoupleScoreBeforeThisGame + coupleScore` against
  `COMPLICITY_THRESHOLDS` (highest threshold not exceeding the value)`.
- **`conversationPrompts`**: 3 entries drawn at random (no repeats) from
  `CONVERSATION_PROMPTS`, using `crypto.randomInt` (same approach as
  `question-selection.ts`'s `shuffleAndTake` — reuse that helper if
  convenient, or a local equivalent).

- [ ] **Step 3: Write the tests**

Table-driven `it.each` (or equivalent) suites covering at minimum:

- `computeEffectiveElapsedMs`: client value used verbatim when within
  `[serverElapsedMs - grace, ...]`; a client value far below
  `serverElapsedMs - grace` is clamped up to `serverElapsedMs - grace`
  (anti-cheat case — this is the one the PRD-derived design flagged as the
  point to get right); `null` client value falls back to
  `serverElapsedMs`; result never exceeds `TIMER_MS` or drops below `0`.
- `computeGameResult`: an all-correct-predictions MIROIR round yields
  `mirrorPoints = 50` (5 × 10) for the predicting player.
- A FACEAFACE round with 3/5 matching answers yields
  `alignmentPointsShared = 30`, added identically into both players'
  `rawScore`, and `coupleScore = 60`.
- A SCENARIO round sums the chosen weights correctly and never appears
  anywhere in the returned `GameResultComputation` as a raw weight (this
  function's output has no `weight` field at all — confirm by asserting
  the returned object's keys).
- Speed bonus is capped at exactly 10% of `rawScore` when the raw sum
  would exceed it, and computed as the raw sum when under the cap.
- A skipped question contributes 0 to `mirrorPoints`/`fidelityScore`/
  `alignmentPointsShared`/`speedBonus` for that question, for both
  players.
- `gapMasked = true` when one player's `totalScore` is more than 40% below
  the other's; `false` at or under 40%.
- Equal `totalScore` → `winnerRole: 'TIE'`, both titles `"Cœur d'Or"`.
- `complicityLevel` picks the correct bracket at each threshold boundary
  (99 → DECOUVERTE, 100 → COMPLICES, 299 → COMPLICES, 300 → FUSIONNELS,
  599 → FUSIONNELS, 600 → INSEPARABLES) using
  `cumulativeCoupleScoreBeforeThisGame + coupleScore`.
- `conversationPrompts` always has length 3 with no duplicate entries.

- [ ] **Step 4: Run the tests, implement until green**

Run: `cd frontend && npx vitest run src/lib/server/game/scoring.test.ts`

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/game/scoring.ts frontend/src/lib/server/game/scoring.test.ts
git commit -m "Add scoring engine (mirror/fidelity/alignment/speed bonus/gap masking/complicity)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Strict active-couple lookup

**Files:**
- Modify: `frontend/src/lib/server/couples/queries.ts`
- Modify: `frontend/src/lib/server/couples/queries.test.ts`

**Interfaces:**
- Produces: `findActivatedCoupleForUser(client, userId)` — consumed by
  Lot 2's every `/api/games/*` route (game routes require `status: 'ACTIVE'`
  strictly; `PENDING` must not be enough, unlike the existing
  `findActiveCoupleForUser` used by the pairing flow itself).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/server/couples/queries.test.ts`, a new
`describe('findActivatedCoupleForUser', ...)` block with cases: returns the
couple (with `id`, `creatorId`, `partnerId`,
`disclaimerAcceptedByCreatorAt`, `disclaimerAcceptedByPartnerAt`,
`cumulativeCoupleScore` selected) when `status: 'ACTIVE'` and the user is
creator or partner; returns `null` for a `PENDING` couple even though the
user is its creator (proves the strictness — this is the behavioral
difference from the existing function); returns `null` when the user has
no couple at all.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/server/couples/queries.test.ts`

- [ ] **Step 3: Implement**

Add to `frontend/src/lib/server/couples/queries.ts` (below the existing
`findActiveCoupleForUser`):

```typescript
export interface ActivatedCouple {
  id: string;
  creatorId: string;
  partnerId: string | null;
  disclaimerAcceptedByCreatorAt: Date | null;
  disclaimerAcceptedByPartnerAt: Date | null;
  cumulativeCoupleScore: number;
}

// Strict variant for the game engine (Lot 2's /api/games/* routes): a
// PENDING couple (no partner joined yet) is deliberately NOT eligible to
// start a game, unlike findActiveCoupleForUser above which treats
// PENDING/ACTIVE as equally "the user's couple" for pairing-flow purposes.
export async function findActivatedCoupleForUser(
  client: QueryClient,
  userId: string,
): Promise<ActivatedCouple | null> {
  return client.couple.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ creatorId: userId }, { partnerId: userId }],
    },
    select: {
      id: true,
      creatorId: true,
      partnerId: true,
      disclaimerAcceptedByCreatorAt: true,
      disclaimerAcceptedByPartnerAt: true,
      cumulativeCoupleScore: true,
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass, then typecheck**

Run: `cd frontend && npx vitest run src/lib/server/couples/ && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/couples/queries.ts frontend/src/lib/server/couples/queries.test.ts
git commit -m "Add strict ACTIVE-only couple lookup for the game engine

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `POST /api/couples/disclaimer/accept`

**Files:**
- Create: `frontend/src/app/api/couples/disclaimer/accept/route.ts`
- Create: `frontend/src/app/api/couples/disclaimer/accept/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `verifyCsrf` (exact pattern of
  `frontend/src/app/api/couples/route.ts`).
- Produces: `POST /api/couples/disclaimer/accept` →
  `200 { acceptedByCreator: boolean, acceptedByPartner: boolean }` or
  `404 { error: 'NO_ACTIVE_COUPLE' }` — consumed by Lot 2's disclaimer UI
  and by `POST /api/games`'s precondition check.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/couples/disclaimer/accept/route.test.ts`
following the exact mocking style of
`frontend/src/app/api/couples/route.test.ts` (mock `@/lib/server/middleware`
and `@/lib/server/auth`'s `verifyCsrf`). Cases:

- Creator accepting: `prismaMock.couple.findFirst` resolves
  `{ id: 'c1', creatorId: 'user-1', partnerId: 'user-2' }`; caller is
  `user-1`; asserts `prismaMock.couple.update` was called with
  `data: { disclaimerAcceptedByCreatorAt: expect.any(Date) }`; response
  `200` with both booleans reflecting the mocked `update` result.
- Partner accepting: caller is `user-2`; asserts `update` was called with
  `data: { disclaimerAcceptedByPartnerAt: expect.any(Date) }`.
- `404 NO_ACTIVE_COUPLE` when `findFirst` resolves `null`.
- `403` when CSRF verification fails (assert `couple.findFirst` was never
  called, same pattern as the CSRF test in
  `frontend/src/app/api/couples/join/route.test.ts`).
- `401` when `requireAuth` returns a `NextResponse`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/api/couples/disclaimer/`

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/couples/disclaimer/accept/route.ts`:

```typescript
// POST /api/couples/disclaimer/accept — records this user's acceptance of
// the fidelity-game relational-guardrail disclaimer (PRD §11, P0). Both
// disclaimerAcceptedBy{Creator,Partner}At must be non-null before
// POST /api/games (Lot 2) will create a session — see Couple's Prisma
// doc comment. Idempotent: accepting again just re-stamps the timestamp.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const couple = await prisma.couple.findFirst({
      where: { status: { in: ['PENDING', 'ACTIVE'] }, OR: [{ creatorId: userId }, { partnerId: userId }] },
      select: { id: true, creatorId: true, partnerId: true },
    });
    if (!couple) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an Espace Couple.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const isCreator = couple.creatorId === userId;
    const updated = await prisma.couple.update({
      where: { id: couple.id },
      data: isCreator
        ? { disclaimerAcceptedByCreatorAt: new Date() }
        : { disclaimerAcceptedByPartnerAt: new Date() },
      select: { disclaimerAcceptedByCreatorAt: true, disclaimerAcceptedByPartnerAt: true },
    });

    return NextResponse.json(
      {
        acceptedByCreator: updated.disclaimerAcceptedByCreatorAt !== null,
        acceptedByPartner: updated.disclaimerAcceptedByPartnerAt !== null,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass, then typecheck**

Run: `cd frontend && npx vitest run src/app/api/couples/disclaimer/ && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/couples/disclaimer/
git commit -m "Add POST /api/couples/disclaimer/accept

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `response-shaping.ts` — the security-invariant module

**Files:**
- Create: `frontend/src/lib/server/game/response-shaping.ts`
- Create: `frontend/src/lib/server/game/response-shaping.test.ts`

**Interfaces:**
- Produces: `shapeQuestionForClient`, `canRevealPartnerAnswer` — Lot 2's
  `GET /api/games/current`, `GET /api/games/:id/rounds/:roundNumber`, and
  `GET /api/games/:id/results` routes MUST route every client-bound
  question/option/answer payload through these functions rather than
  hand-rolling their own field selection. This is the single chokepoint
  the Critical invariant in Global Constraints depends on.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/game/response-shaping.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shapeQuestionForClient, canRevealPartnerAnswer } from './response-shaping';

describe('shapeQuestionForClient', () => {
  it('strips weight from SCENARIO options', () => {
    const shaped = shapeQuestionForClient({
      id: 'q1',
      roundType: 'SCENARIO',
      prompt: 'Test?',
      options: [
        { id: 'a', text: 'Option A', weight: 8 },
        { id: 'b', text: 'Option B', weight: 3 },
      ],
    });
    expect(shaped.options).toEqual([
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
    ]);
    expect(JSON.stringify(shaped)).not.toContain('weight');
  });

  it('passes MIROIR/FACEAFACE options through unchanged (no weight to strip)', () => {
    const shaped = shapeQuestionForClient({
      id: 'q2',
      roundType: 'MIROIR',
      prompt: 'Test?',
      options: [{ id: 'a', text: 'Option A' }],
    });
    expect(shaped.options).toEqual([{ id: 'a', text: 'Option A' }]);
  });
});

describe('canRevealPartnerAnswer', () => {
  it('is false for PENDING and IN_PROGRESS round status', () => {
    expect(canRevealPartnerAnswer('PENDING')).toBe(false);
    expect(canRevealPartnerAnswer('IN_PROGRESS')).toBe(false);
  });

  it('is true only for COMPLETED round status', () => {
    expect(canRevealPartnerAnswer('COMPLETED')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/server/game/response-shaping.test.ts`

- [ ] **Step 3: Implement**

Create `frontend/src/lib/server/game/response-shaping.ts`:

```typescript
// The single chokepoint every /api/games/* route (Lot 2) MUST use before
// putting a Question or another player's Answer into a client response.
// Two invariants this repo has decided are non-negotiable (see this plan's
// Global Constraints):
//   1. A SCENARIO option's `weight` must never reach the client.
//   2. The other player's answer for the current question must never be
//      visible before the round is COMPLETED.
export interface ClientOption {
  id: string;
  text: string;
}

export interface ClientQuestion {
  id: string;
  roundType: string;
  prompt: string;
  options: ClientOption[];
}

interface RawOption {
  id: string;
  text: string;
  weight?: number;
}

export function shapeQuestionForClient(question: {
  id: string;
  roundType: string;
  prompt: string;
  options: unknown;
}): ClientQuestion {
  const options = question.options as RawOption[];
  return {
    id: question.id,
    roundType: question.roundType,
    prompt: question.prompt,
    options: options.map((o) => ({ id: o.id, text: o.text })),
  };
}

export function canRevealPartnerAnswer(roundStatus: string): boolean {
  return roundStatus === 'COMPLETED';
}
```

- [ ] **Step 4: Run the tests to verify they pass, then typecheck**

Run: `cd frontend && npx vitest run src/lib/server/game/response-shaping.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Full-suite gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` from the
repo root. All must pass — this is the last task in the lot.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/game/response-shaping.ts frontend/src/lib/server/game/response-shaping.test.ts
git commit -m "Add response-shaping chokepoint (strip SCENARIO weight, gate partner answers pre-reveal)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Verification

- After every task: `pnpm --filter frontend exec vitest run <touched path>`
  plus `pnpm typecheck` (fast, per-task feedback).
- After Task 9 (final task): full gate from repo root —
  `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.
- Manual DB check after Tasks 1-2: `pnpm db:studio`, confirm all 7 new
  tables exist plus the 3 new `Couple` columns, and that
  `GameSession_couple_in_progress_unique` shows up under the table's
  indexes (Neon's SQL editor or `\d "GameSession"` via `psql` also works).
- Manual content check after Task 4: run
  `pnpm exec tsx frontend/scripts/seed-questions.ts` against the dev DB,
  then `pnpm db:studio` → `Question` table → confirm 27 rows, 9 per
  `roundType`, and that no `MIROIR`/`FACEAFACE` row's `options` JSON
  contains a `weight` key while every `SCENARIO` row's does.
- This lot has no UI and no HTTP surface beyond the one disclaimer route —
  end-to-end gameplay verification happens in the future Lot 2 plan, once
  `/api/games/*` and `/jeu/*` exist to exercise `scoring.ts`,
  `state-machine.ts`, and `response-shaping.ts` for real.
