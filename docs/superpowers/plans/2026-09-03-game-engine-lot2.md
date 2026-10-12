# Moteur de jeu — Lot 2 : routes API + pages UI pass-and-play + mode démo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pass-and-play game surface on top of Lot 1's engine
(merged to `main`): 8 `/api/games/*` route handlers, the 6 `/jeu/*` pages,
disclaimer gating, and a solo no-account **demo mode** at `/demo` that lets
a visitor try a trial game before creating an Espace Couple.

**Architecture:** Every route is a thin persistence layer around Lot 1's
pure modules (`frontend/src/lib/server/game/{state-machine,scoring,
question-selection,response-shaping}.ts`) — none of this lot's route code
re-derives game logic; it loads rows, calls a pure function, persists the
result. The demo mode reuses the SAME pure `state-machine.ts`/`scoring.ts`
modules directly from a client component (they have zero Prisma/
`server-only` coupling by design — see their Lot 1 doc comments) instead of
re-implementing the rules.

**Tech Stack:** Same as Lot 1 — Next.js 16, Prisma 5 / Neon, Zod, Vitest +
`vitest-mock-extended`. Route skeleton (CSRF, `requireAuth`,
`withRequestContext`, French error-code translation at the page layer)
follows `frontend/src/app/api/couples/join/route.ts` and
`frontend/src/app/api/couples/disclaimer/accept/route.ts` exactly.

## RESOLVED — what looked like a Prisma/TypeScript bug was a missing generated client

**Everything below this paragraph is superseded and kept only as a record
of how the diagnosis went wrong.** `pnpm typecheck` now exits 0.

The ~75 `Omit<PrismaClient<...>, ITXClientDenyList>` errors were not a
Prisma 5.22 client-extension typing bug. `node_modules/.prisma/client` had
never been generated in this checkout, so `@prisma/client` resolved to its
stub types and every model delegate vanished from the client type —
which is exactly what "Property 'user' does not exist on type
Omit<PrismaClient, ITXClientDenyList>" means when you read it without a
prior theory. Running `prisma generate` took the count from 75 to 1.

The single remaining error was real, and had been masked the whole time:
`answers/route.ts` cast a Prisma `Json` column straight to `RawOption[]`,
which would also have thrown on `.map` for any row whose JSON was not an
array. It now narrows with `Array.isArray` and rejects a malformed row as
INVALID_OPTION instead of 500-ing.

Two lessons worth keeping. First, the elimination work that "confirmed"
the library-bug theory (identical bytes across worktrees, clean
reinstalls, a TypeScript downgrade) never once checked whether the
generated client existed — a lot of rigour aimed at the wrong question.
Second, the workaround itself did damage: with `--no-verify` normalised
for every commit and a 75-line baseline treated as furniture, a genuine
type error sat in a payment-adjacent code path for the whole lot without
anyone being able to see it.

The per-task gate described below (diff against a baseline file, commit
with `--no-verify`) is therefore **obsolete**. `pnpm format && pnpm lint
&& pnpm typecheck && pnpm test` all pass normally; commit without
`--no-verify`.

---

## Known pre-existing environment issue (not this plan's concern)

`pnpm typecheck` currently fails with 59 errors on this branch's base
commit, ALL variants of `Omit<PrismaClient<...>, ITXClientDenyList>` (and
this repo's own `TxClient`/`QueryClient`/`OutboxTxClient`/`AuditClient`
aliases built on top of it) losing their model-delegate properties — a
Prisma 5.22.0 client-extension typing complexity issue, confirmed present
since before Lot 1 (the `prisma ^5.22.0`/`typescript ^6.0.3` pins predate
it) and independent of the TypeScript version (reproduces identically on
5.9.3 after a fully clean reinstall — an earlier apparent "fix" by
downgrading TypeScript was a false positive caused by a stale
`tsconfig.tsbuildinfo` incremental-build cache masking the real error
count). `pnpm test` (706/706) and `pnpm lint` are unaffected — this is
purely a `tsc -p` whole-program check issue. The baseline 59 errors are
recorded in `.superpowers/sdd/pre-existing-typecheck-baseline.txt`.

**Per-task gate for this plan:** `pnpm format && pnpm lint && pnpm test`
must pass normally. For `pnpm typecheck`, compare the new error list
against the recorded baseline file — a task passes if it introduces **no
new errors beyond that baseline** (new files/lines this plan adds must
type-check cleanly on their own; pre-existing baseline errors in untouched
files are not this plan's problem to fix). Commits use `--no-verify` only
because the pre-commit hook's typecheck step can't distinguish "baseline"
from "new" — never use `--no-verify` to wave through an actual new error.

## Context carried from Lot 1 (ground truth — read the real files, not just this summary)

- `lib/server/game/state-machine.ts` exports `firstPlayerRoleForRound`,
  `startAnsweringTurn`, `advanceAfterAnswer`, `advanceRound`,
  `resolvePhaseOnRead` — all pure, operating on a plain
  `SessionPhaseState` (not a Prisma row).
- `lib/server/game/scoring.ts` exports `computeEffectiveElapsedMs` and
  `computeGameResult(input: ComputeGameResultInput):
  GameResultComputation` — pure, takes a flat `ScoredAnswer[]`. Every
  `SCENARIO` `OWN` answer in that array **must** carry `optionWeight`
  resolved server-side from `Question.options` — `computeGameResult`
  throws if it's missing on a scored (non-skipped) `SCENARIO` answer.
- `lib/server/game/response-shaping.ts` exports `shapeQuestionForClient`
  (strips `weight`) and `canRevealPartnerAnswer(roundStatus)`. **Every**
  route response that includes a `Question`'s prompt/options MUST go
  through `shapeQuestionForClient` — this is Lot 1's non-negotiable
  chokepoint (its test suite is the proof).
- `lib/server/game/question-selection.ts` exports
  `selectQuestionsForRound(client, {coupleId, roundType, count,
  excludeQuestionIds?})` and `recordQuestionUsage(client, coupleId,
  questionIds)`.
- `lib/server/couples/queries.ts` exports `findActivatedCoupleForUser
  (client, userId): Promise<ActivatedCouple | null>` — the **strict**
  lookup (status `ACTIVE` only) this lot's routes must use, returning
  `{ id, creatorId, partnerId, disclaimerAcceptedByCreatorAt,
  disclaimerAcceptedByPartnerAt, cumulativeCoupleScore }`. Do not use the
  looser `findActiveCoupleForUser` (PENDING-inclusive) from the pairing
  domain — a couple with no partner yet cannot start a game.
- Prisma models already exist: `Question`, `GameSession`, `GameRound`,
  `GameRoundQuestion`, `Answer`, `QuestionUsage`, `GameResult`, plus
  `Couple.disclaimerAcceptedByCreatorAt` / `...PartnerAt` /
  `cumulativeCoupleScore`. **`GameSession` has a raw-SQL partial unique
  index** (`GameSession_couple_in_progress_unique`, one `IN_PROGRESS`
  session per couple) not expressible in `schema.prisma` — see that
  model's doc comment. Any future `prisma migrate dev` run in this repo
  must have its generated `DROP INDEX` on that constraint deleted before
  applying — this lot doesn't touch the schema, but says it again because
  it bites easily.
- `POST /api/couples/disclaimer/accept` already exists and stamps
  `disclaimerAcceptedBy{Creator,Partner}At` for the calling user.
- 27 seed questions are loaded (`pnpm exec tsx frontend/scripts/seed-questions.ts`)
  with `slug`s like `mirror-reveil`, `scenario-ex-contact`,
  `faceaface-important-couple` — useful for manual testing.

## Design decisions this lot makes (not fully pinned by Lot 1's draft — resolve here, don't re-litigate mid-implementation)

1. **An explicit `POST /api/games/:id/start-turn` route exists** (8th
   route, not in the original 7-route sketch). Rationale: `GET
   /api/games/current` must stay side-effect-free enough to be polled
   safely from the `/jeu/[id]/passe` "pass the phone" screen without
   prematurely starting the next player's 45s timer. Only `start-turn`
   (called on mount by `/jeu/[id]/question`, once the right player has
   confirmed "C'est à moi") calls `startAnsweringTurn` and stamps
   `currentQuestionShownAt`. `GET /current` stays read-only except for
   `resolvePhaseOnRead`'s harmless `ROUND_INTRO`→`PASS_DEVICE` lazy flip.
2. **`GameRound.status` ownership**: round N is created with
   `status: 'PENDING'` (rounds 2-3) except round 1, created directly as
   `'IN_PROGRESS'` with `startedAt` (play begins immediately, no separate
   "start round 1" action exists). `POST /answers` flips the round to
   `'COMPLETED'` + `completedAt` when `advanceAfterAnswer` reports
   `roundCompleted`. `POST /round/advance` flips the **next** round to
   `'IN_PROGRESS'` + `startedAt` when moving into it.
3. **Skip always writes one `Answer` row**: `kind: 'OWN'`,
   `isSkipped: true`, `selectedOptionId: null` — for every round type,
   including MIROIR (no separate skip semantics for the prediction half).
   This keeps the "how many OWN answers exist for this question" count
   that drives `advanceAfterAnswer` uniform across skip and normal
   submission.
4. **Session-creation race**: the partial unique index makes a
   concurrent double-create impossible at the DB level. `POST
   /api/games` wraps question-selection + row creation in
   `prisma.$transaction`; if the insert throws (Prisma surfaces the
   Postgres `23505` unique violation as `error.code === 'P2002'` even for
   an index not declared in `schema.prisma`), catch it, re-query for the
   couple's `IN_PROGRESS` session, and return that (idempotent resume) —
   never surface the race as a 500.
5. **Ownership check is 404, not 403**, matching `requireOrgRole`'s
   established convention in this repo (see CLAUDE.md): if the
   authenticated user's active couple's `id` doesn't match a
   `GameSession`/route param's owning couple, respond 404, never 403 or
   leak the session's existence.
6. **Palette**: `frontend/src/app/page.tsx` and `tailwind.config.ts` were
   just re-themed so **wine/rose is the dominant accent** (`wine
   #8B2C56`, `wine-deep #6E2246`, `rose #F0A0C0`, replacing `gold` as the
   primary accent). Build every new `/jeu/*` and `/demo` page against
   this current palette. Note for the human, not a task in this plan: the
   existing `/couple/*` pages (`creer`, `attente`, `apparies`) still use
   `text-gold`/`bg-gold` and are now visually inconsistent with the rest
   of the app — out of scope here, flag it as a follow-up.
7. **Demo mode is fully client-side, no persistence, no auth.** A visitor
   plays entirely inside `DemoGame.tsx` (`'use client'`), which imports
   `state-machine.ts` and `scoring.ts` directly (safe: neither has a
   Prisma or `server-only` import) against a small hardcoded
   `DEMO_QUESTIONS` set — **not** the real `Question` table, no
   `GameSession`/`Answer`/`QuestionUsage` rows are ever created for an
   anonymous demo. Because nothing here is server-authoritative, exposing
   `weight` in `DEMO_QUESTIONS`'s client bundle is **not** a violation of
   Lot 1's response-shaping invariant — that invariant protects a real
   couple's real stakes; a demo has none. Do not import
   `response-shaping.ts` into the demo (it's Prisma-`Question`-shaped and
   irrelevant here).
8. Hero's secondary CTA on the marketing page
   (`frontend/src/app/page.tsx`, currently `href="#jeu"` / "Voir comment
   ça marche") is repointed to `/demo` as part of Task 24 — a live trial
   sells the game better than a same-page anchor. This is the one content
   edit to the marketing page in this lot; nothing else on it changes.

## Global Constraints

- Every route: `export const runtime = 'nodejs'`; wrap the handler body in
  `withRequestContext(makeRequestContext(req.headers), async () => {...})`;
  every response sets `x-request-id`. Every mutating route calls
  `verifyCsrf(req)` first and bails on a non-null result, exactly like
  `frontend/src/app/api/couples/join/route.ts`.
- `requireAuth(req.headers.get('authorization'))` on every route; bail if
  it returns a `NextResponse`.
- Never call `prisma.question.*`/read `Question.options` weight outside
  `POST /api/games/:id/round/advance`'s final-round branch (the one place
  that resolves `optionWeight` for `computeGameResult`) and the seed
  script. Every other route touching a question goes through
  `shapeQuestionForClient`.
- Payment/monetisation is out of scope (Phase 2 of the PRD) — pricing
  UI already exists on the marketing page; this lot's pages never gate on
  payment state.
- French is the UI language for all page copy and user-facing error
  messages (translated via an extended `couples-error-messages.ts`,
  mirroring the existing pattern) — route code, error codes, and comments
  stay English, matching Lot 1's convention.
- No new Prisma migration in this lot — all models/columns already exist.
- `pnpm format && pnpm lint && pnpm test` must pass after every task; for
  `pnpm typecheck`, no NEW errors beyond the recorded pre-existing
  baseline (see above).

---

## Task 10: Session helpers + `POST /api/games`

**Files:**
- Create: `frontend/src/lib/server/game/session-helpers.ts`
- Create: `frontend/src/app/api/games/route.ts` (`POST` only)
- Create: `frontend/src/app/api/games/route.test.ts`

**Interfaces:**
- `session-helpers.ts` exports `loadOwnedGameSession(client, coupleId,
  gameSessionId): Promise<GameSessionRow | null>` — a `findFirst` scoped
  to `{ id: gameSessionId, coupleId }` so a mismatched couple naturally
  returns `null` (caller turns that into 404). Reused by every route in
  Tasks 11-15.
- `POST /api/games` response shape: `{ id, status, currentRoundNumber,
  currentQuestionNumber, phase, activePlayerRole }`.

**Steps:**
1. `findActivatedCoupleForUser` → 404 `NO_ACTIVE_COUPLE` if null.
2. If `!couple.disclaimerAcceptedByCreatorAt || !couple.disclaimerAcceptedByPartnerAt`
   → 403 `DISCLAIMER_REQUIRED`.
3. Look for an existing `GameSession` where `coupleId: couple.id, status:
   'IN_PROGRESS'` → if found, return it (200), no new rows.
4. Else, in `prisma.$transaction`: for `roundNumber` 1-3 (`MIROIR`,
   `SCENARIO`, `FACEAFACE` in that order) call `selectQuestionsForRound`
   with `count: 5` and `excludeQuestionIds` = every question id already
   picked in this same creation (accumulate across rounds — no question
   repeats within one session). After all 15 are picked, call
   `recordQuestionUsage(tx, couple.id, allFifteenIds)` once. Create the
   `GameSession` (`activePlayerRole: firstPlayerRoleForRound(1)`,
   default `phase`/`status`), 3 `GameRound` rows (round 1:
   `status:'IN_PROGRESS'`, `startedAt: now` — see Design Decision 2), and
   15 `GameRoundQuestion` rows (`orderIndex` 0-4 per round, in the order
   `selectQuestionsForRound` returned).
5. Catch a `P2002` from the transaction (Design Decision 4): re-query the
   couple's `IN_PROGRESS` session and return it; rethrow anything else.
6. Response 201 on create, 200 on resume-existing.

**Tests:** disclaimer-not-accepted → 403; no active couple → 404;
fresh create → 201 with 3 rounds × 5 questions persisted, no repeated
question id across the 15; second call while one is `IN_PROGRESS` →
200 same id, no new rows; simulated `P2002` on insert → falls back to
the existing session instead of a 500.

---

## Task 11: `GET /api/games/current` + `POST /api/games/:id/start-turn`

**Files:**
- Create: `frontend/src/app/api/games/current/route.ts` (`GET`)
- Create: `frontend/src/app/api/games/current/route.test.ts`
- Create: `frontend/src/app/api/games/[id]/start-turn/route.ts` (`POST`)
- Create: `frontend/src/app/api/games/[id]/start-turn/route.test.ts`

**Steps — `GET /current`:**
1. `findActivatedCoupleForUser` → 404 `NO_ACTIVE_COUPLE`.
2. Find the couple's `IN_PROGRESS` `GameSession` → 404 `NO_ACTIVE_GAME`.
3. Build a `SessionPhaseState` from the row, call `resolvePhaseOnRead`. If
   it changed the phase, persist that (`ROUND_INTRO` → `PASS_DEVICE`).
4. If resolved `phase === 'ANSWERING'`: load the current
   `GameRoundQuestion` (`gameRound.roundNumber ===
   session.currentRoundNumber`, `orderIndex === currentQuestionNumber -
   1`) + its `Question`, include `shapeQuestionForClient(question)` in
   the response.
5. Response: `{ id, status, currentRoundNumber, currentQuestionNumber,
   phase, activePlayerRole, jokersRemainingCreator,
   jokersRemainingPartner, question?: ClientQuestion }` — `question` only
   present when `phase === 'ANSWERING'`.

**Steps — `POST /:id/start-turn`:**
1. `loadOwnedGameSession` → 404 if null (Design Decision 5).
2. Guard: current phase must be `PASS_DEVICE` or already `ANSWERING`
   (idempotent remount) — else 409 `INVALID_PHASE`.
3. Call `startAnsweringTurn(state, new Date())`, persist `phase` +
   `currentQuestionShownAt` (only if it changed — don't re-stamp an
   already-`ANSWERING` turn). If the current `GameRound.status ===
   'PENDING'`, flip it to `'IN_PROGRESS'` + `startedAt: now` (round-2/3
   entry, Design Decision 2).
4. Load the current `GameRoundQuestion` + `Question`, return
   `{ activePlayerRole, roundType, currentQuestionNumber,
   question: shapeQuestionForClient(question) }`.

**Tests:** `GET /current` with no game → 404; `PASS_DEVICE` phase → no
`question` key in response; `ANSWERING` phase → shaped question present,
**no `weight` key anywhere in the JSON** (grep the serialized response in
the test); `ROUND_INTRO` on read → response reflects `PASS_DEVICE` and the
DB row is updated. `start-turn` from `ROUND_REVEAL` → 409; from
`PASS_DEVICE` → 200, `currentQuestionShownAt` set; called twice in a row →
second call doesn't move the timestamp.

---

## Task 12: `POST /api/games/:id/answers`

**Files:**
- Create: `frontend/src/app/api/games/[id]/answers/route.ts`
- Create: `frontend/src/app/api/games/[id]/answers/route.test.ts`

**Steps:**
1. `loadOwnedGameSession` → 404. Guard `phase === 'ANSWERING'` → else 409
   `NOT_ANSWERING_PHASE`.
2. Load current `GameRoundQuestion` + `Question` + `GameRound.type`.
3. Body (Zod): `roundType === 'MIROIR'` expects `{ ownOptionId,
   predictionOptionId, clientElapsedMs? }`; `SCENARIO`/`FACEAFACE` expect
   `{ optionId, clientElapsedMs? }`. 400 `VALIDATION_FAILED` on mismatch.
   Validate every submitted option id exists in `Question.options` → 400
   `INVALID_OPTION` otherwise.
4. `userId` = `session.activePlayerRole === 'CREATOR' ? couple.creatorId
   : couple.partnerId`.
5. `effectiveElapsedMs = computeEffectiveElapsedMs(clientElapsedMs ??
   null, Date.now() - session.currentQuestionShownAt.getTime())`.
6. Insert Answer row(s) inside a transaction: MIROIR inserts TWO
   (`kind:'OWN'` with `ownOptionId`, `kind:'PREDICTION'` with
   `predictionOptionId`, same `effectiveElapsedMs`); others insert ONE
   (`kind:'OWN'`). On a `P2002` from the `@@unique([gameRoundQuestionId,
   userId, kind])` constraint (double-submit/retry), treat as success —
   don't insert again, fall through to the state read below.
7. Count `Answer` rows with `kind: 'OWN'` for this `GameRoundQuestion` →
   1 or 2 → call `advanceAfterAnswer(state, count)`.
8. Persist the new state to `GameSession`. If `roundCompleted`, also set
   the current `GameRound.status = 'COMPLETED'`, `completedAt: now`
   (Design Decision 2).
9. Response: `{ phase, activePlayerRole, currentRoundNumber,
   currentQuestionNumber, roundCompleted }`.

**Tests:** wrong phase → 409; invalid option id → 400; MIROIR happy path
inserts 2 rows; SCENARIO/FACEAFACE happy path inserts 1; first player's
answer → `phase:'PASS_DEVICE'`, role flips, `currentQuestionShownAt`
cleared; second player's answer on question 5 → `roundCompleted: true`,
`phase: 'ROUND_REVEAL'`; duplicate submit (same user, same question) →
200 idempotent, still exactly one row.

---

## Task 13: `POST /api/games/:id/skip`

**Files:**
- Create: `frontend/src/app/api/games/[id]/skip/route.ts`
- Create: `frontend/src/app/api/games/[id]/skip/route.test.ts`

**Steps:**
1. `loadOwnedGameSession` → 404. Guard `phase === 'ANSWERING'` → 409.
2. `userId` = active role's id (same lookup as Task 12). Check
   `jokersRemainingCreator`/`...Partner` for that role → 0 → 403
   `NO_JOKERS_LEFT`, write nothing.
3. In a transaction: decrement the right `jokersRemaining*` column;
   insert one `Answer` row `kind:'OWN'`, `isSkipped: true,
   selectedOptionId: null`, `effectiveElapsedMs` computed the same way as
   Task 12 (unused by scoring per `scoring.ts`'s `isSkipped` short-circuit,
   stored for consistency/debugging only). Same `P2002` idempotency
   handling as Task 12.
4. Same `advanceAfterAnswer` + persistence + round-completion handling as
   Task 12, Steps 7-8.
5. Response: `{ phase, activePlayerRole, currentRoundNumber,
   currentQuestionNumber, roundCompleted, jokersRemaining }` (the
   decremented count for the role that just skipped).

**Tests:** 0 jokers left → 403, no `Answer` row written, joker count
unchanged; happy path decrements exactly one counter and never awards
points (assert no scoring path is touched — this is a persistence-only
test, scoring correctness is Lot 1's `scoring.test.ts`); wrong phase →
409.

---

## Task 14: `POST /api/games/:id/round/advance`

**Files:**
- Create: `frontend/src/app/api/games/[id]/round/advance/route.ts`
- Create: `frontend/src/app/api/games/[id]/round/advance/route.test.ts`

**Steps:**
1. `loadOwnedGameSession` → 404. Guard `phase === 'ROUND_REVEAL'` → 409
   `NOT_IN_ROUND_REVEAL`.
2. Call `advanceRound(state)`.
3. If `!gameCompleted`: persist the new state (`phase` will read back as
   `ROUND_INTRO`); flip the new `GameRound.status` to `'IN_PROGRESS'` +
   `startedAt: now` (Design Decision 2). Response `{ phase:'ROUND_INTRO',
   currentRoundNumber, activePlayerRole, gameCompleted: false }`.
4. If `gameCompleted`, in the SAME transaction:
   - Load every `Answer` for this session (`where: { gameSessionId }`,
     `include: { gameRoundQuestion: { include: { gameRound: true,
     question: true } } }`).
   - Map each to a `ScoredAnswer`: `roundType` from
     `gameRoundQuestion.gameRound.type`; for `SCENARIO` `kind:'OWN'`
     non-skipped rows, resolve `optionWeight` by finding
     `selectedOptionId` inside `gameRoundQuestion.question.options` (cast
     `Json` → `{id,text,weight}[]`) — **this is the one place in Lot 2
     that reads raw `weight`**, per Global Constraints.
   - `computeGameResult({ creatorId: couple.creatorId, partnerId:
     couple.partnerId ?? throw, cumulativeCoupleScoreBeforeThisGame:
     couple.cumulativeCoupleScore, answers })`.
   - Create the `GameResult` row from the returned fields
     (`conversationPrompts` as `Json`).
   - `Couple.cumulativeCoupleScore += result.coupleScore`.
   - `GameSession.status = 'COMPLETED'`, `completedAt: now`, `phase:
     'COMPLETE'`.
   - Response `{ phase: 'COMPLETE', gameCompleted: true }`.

**Tests:** wrong phase → 409; round 1→2 and round 2→3 advance persist
`ROUND_INTRO`/next round `IN_PROGRESS`; round 3→complete persists a
`GameResult` row whose fields match a hand-computed
expectation for a small fixed answer set, updates
`cumulativeCoupleScore`, sets `GameSession.status/completedAt`; a
`SCENARIO` answer missing `optionWeight` resolution would throw inside
`computeGameResult` — assert the route lets that throw surface (a 500 is
correct here: it means Lot 2's weight-resolution code is broken, not a
user-facing case to swallow).

---

## Task 15: `GET /api/games/:id/rounds/:roundNumber` + `GET /api/games/:id/results`

**Files:**
- Create: `frontend/src/app/api/games/[id]/rounds/[roundNumber]/route.ts`
- Create: `frontend/src/app/api/games/[id]/rounds/[roundNumber]/route.test.ts`
- Create: `frontend/src/app/api/games/[id]/results/route.ts`
- Create: `frontend/src/app/api/games/[id]/results/route.test.ts`

**Steps — rounds/:roundNumber:**
1. `loadOwnedGameSession` → 404. Load the `GameRound` (`roundNumber`
   param) → 404 if missing or `round.status !== 'COMPLETED'` (also 404,
   per Global Constraints — never leak an in-progress round's answers).
2. Load its 5 `GameRoundQuestion`s + `Question` + all `Answer`s.
   `canRevealPartnerAnswer(round.status)` will be `true` here (guarded
   above) — call it anyway and 404 defensively if it somehow isn't, so
   the invariant stays enforced at the response boundary, not just the
   route guard.
3. Response per question: `{ id, prompt, options:
   shapeQuestionForClient(...).options, creatorAnswer: {
   selectedOptionId, isSkipped }, partnerAnswer: { ... },
   creatorPrediction?, partnerPrediction? }` (`*Prediction` only present
   when `round.type === 'MIROIR'`).

**Steps — results:**
1. `loadOwnedGameSession` → 404 if missing or `status !== 'COMPLETED'`.
2. Load `GameResult` by `gameSessionId`.
3. If `gapMasked`: omit `creatorTotalScore`/`partnerTotalScore`/
   `gapPercent` from the response, include a fixed
   `maskedMessage: "Match serré sur les valeurs, écart sur la
   connaissance."` field instead. Otherwise include the numeric fields
   and omit `maskedMessage`.
4. Always include `coupleScore`, `complicityLevel`, `creatorTitle`,
   `partnerTitle`, `winnerRole`, `conversationPrompts`.

**Tests:** round not completed → 404; completed round returns both
players' answers with predictions only for MIROIR; results before
completion → 404; `gapMasked: true` fixture → numeric scores absent,
`maskedMessage` present; `gapMasked: false` fixture → numeric scores
present, no `maskedMessage`.

---

## Task 16: French error messages for the game domain

**Files:**
- Modify: `frontend/src/lib/couples-error-messages.ts`

**Steps:**
- [ ] Add to `COUPLES_ERROR_MESSAGES`: `NO_ACTIVE_COUPLE`,
  `DISCLAIMER_REQUIRED`, `NO_ACTIVE_GAME`, `INVALID_PHASE`,
  `NOT_ANSWERING_PHASE`, `NOT_IN_ROUND_REVEAL`, `VALIDATION_FAILED`
  (already present — leave it), `INVALID_OPTION`, `NO_JOKERS_LEFT`, in
  French, matching the file's existing tone (short, direct, no jargon).
  Keep the file's header comment and `coupleErrorMessage` helper
  untouched — this is a pure data addition.

**Tests:** none needed (a data map) — covered indirectly by any page test
that asserts a translated string renders.

---

## Task 17: `Timer` client component

**Files:**
- Create: `frontend/src/components/game/Timer.tsx`
- Create: `frontend/src/components/game/Timer.test.tsx`

**Interfaces:**
- `<Timer durationMs={45000} startedAt={Date} onElapsedChange={(ms:
  number) => void} />` — cosmetic countdown ring/number; calls
  `onElapsedChange` on an interval (e.g. every 250ms) with
  `Date.now() - startedAt.getTime()`, clamped to `[0, durationMs]`, so the
  question page can read the live `clientElapsedMs` to submit alongside
  an answer. Purely presentational — the server (`computeEffectiveElapsedMs`)
  is the actual authority, per Lot 1's anti-cheat design; this component
  must never gate submission (no disabling the answer buttons at 0 — a
  slow player must still be able to submit late, the server just won't
  reward it).

**Tests:** renders remaining time counting down from `durationMs`; calls
`onElapsedChange` with increasing values; does not throw or disable
anything at 0.

---

## Task 18: `/jeu` start screen

**Files:**
- Create: `frontend/src/app/jeu/page.tsx`
- Create: `frontend/src/app/jeu/page.test.tsx` (or a manual note if this
  repo's page tests are sparse — check existing `/couple/*` pages for
  whether client pages get Vitest coverage; follow that precedent)

**Steps:**
1. `'use client'`, mirrors `frontend/src/app/couple/apparies/page.tsx`'s
   shape: `useUser('/connexion')` guard, `useEffect` fetching state.
2. `GET /api/couples/me` → if no ACTIVE couple, redirect to
   `/couple/creer` (existing pairing flow).
3. If couple is ACTIVE but disclaimer not accepted by both →
   render Task 23's disclaimer gate inline (or redirect to a disclaimer
   sub-route — implementer's call, keep it simple: inline is fine for a
   single screen).
4. Else `GET /api/games/current`: 404 → show "Nouvelle partie" CTA
   (`POST /api/games` then route to `/jeu/[id]/passe`); 200 → show
   "Reprendre la partie" CTA routing straight to the right screen for the
   session's current `phase` (`PASS_DEVICE`→`/passe`,
   `ANSWERING`→`/question`, `ROUND_REVEAL`→`/manche-revelee`,
   `ROUND_INTRO`→`/manche-intro`, `COMPLETE`→`/resultats`).
5. Palette: wine/rose dominant (Design Decision 6), `bg-ink text-cream
   font-grotesk`, matching the current marketing page's tokens.

**Tests:** covers the branch logic (no couple → redirect; couple without
disclaimer → gate shown; existing game → routes to the right phase
screen).

---

## Task 19: `/jeu/[id]/passe` + `/jeu/[id]/manche-intro`

**Files:**
- Create: `frontend/src/app/jeu/[id]/passe/page.tsx`
- Create: `frontend/src/app/jeu/[id]/manche-intro/page.tsx`

**Steps:**
- `passe`: static interstitial, "Passe le téléphone à {name}" — reads
  `activePlayerRole`/round context from the router's navigation state or
  a light `GET /api/games/current` read-only call (safe: it does not
  transition phase, per Design Decision 1). One button "C'est à moi" →
  navigates to `/jeu/[id]/question`, which is what actually calls
  `start-turn`.
- `manche-intro`: static interstitial, "Manche {n} — {Miroir|Scénarios|
  Face à face} : {one-line rule reminder per round type}". One button →
  `/jeu/[id]/passe`.
- Both: no fake device chrome, no emoji-as-icon, real inline SVG if an
  icon is used at all (plain text is enough here — these are simple
  interstitials).

**Tests:** optional given their static nature — at minimum confirm they
render without a crash for each round type / role.

---

## Task 20: `/jeu/[id]/question`

**Files:**
- Create: `frontend/src/app/jeu/[id]/question/page.tsx`
- Create: `frontend/src/app/jeu/[id]/question/page.test.tsx`

**Steps:**
1. On mount: `POST /api/games/:id/start-turn` → get the shaped question +
   `roundType`.
2. Render prompt + options. `MIROIR` is a 2-step flow within this one
   page: "Ta réponse" (own) then "Ta prédiction" (guess partner's own) —
   both collected client-side, submitted together as one `POST
   /answers` call per Task 12's MIROIR body shape. `SCENARIO`/
   `FACEAFACE` are single-step.
3. Mount a `Timer` (Task 17) from the question's load time; track
   `clientElapsedMs` from its `onElapsedChange`.
4. "Passer" button → `POST /api/games/:id/skip`; on `NO_JOKERS_LEFT`,
   disable the button and show the translated message, don't retry.
5. On submit success: response `phase` tells you where to go —
   `PASS_DEVICE` → `/jeu/[id]/passe`; `ROUND_REVEAL` → `/jeu/[id]/manche-revelee`.
6. Joker/remaining count displayed from `start-turn`'s / the running
   session state's `jokersRemaining*` for the active role.

**Tests:** MIROIR two-step submission builds the right body; skip at 0
jokers disables the control; a successful submit navigates per the
response `phase`.

---

## Task 21: `/jeu/[id]/manche-revelee`

**Files:**
- Create: `frontend/src/app/jeu/[id]/manche-revelee/page.tsx`

**Steps:**
1. `GET /api/games/:id/rounds/:roundNumber` (current round number from
   `GET /current`, which is still `ROUND_REVEAL` at this point).
2. Render the 5 Q/R pairs: both players' picks, and for MIROIR also both
   predictions with a visual "matched"/"missed" indicator (derived
   client-side by comparing the two ids — no score/points/weight
   displayed, per PRD "no archive of fidelity weight").
3. One button "Continuer" → `POST /api/games/:id/round/advance` → route
   by response: `gameCompleted: false` → `/jeu/[id]/manche-intro`;
   `true` → `/jeu/[id]/resultats`.

**Tests:** renders 5 rows; MIROIR match indicator reflects
prediction===partner's-own; button routes correctly for both
`gameCompleted` outcomes.

---

## Task 22: `/jeu/[id]/resultats`

**Files:**
- Create: `frontend/src/app/jeu/[id]/resultats/page.tsx`

**Steps:**
1. `GET /api/games/:id/results`.
2. Layout per the original design brief: `coupleScore` in large type
   FIRST, then `complicityLevel`, then individual scores (or the masked
   message when `gapMasked`), titles (never "perdant"/"infidèle" — the
   API already guarantees this via `creatorTitle`/`partnerTitle`), then
   "3 choses à vous dire ce soir" listing `conversationPrompts`. No
   podium, no ranking visual beyond the two titles.
3. CTA at the bottom: "Rejouer" → back to `/jeu` (starts a fresh
   `POST /api/games` since this one is `COMPLETED`).

**Tests:** renders `coupleScore` before individual scores in DOM order;
masked case shows `maskedMessage` and hides numeric scores; unmasked case
shows both scores.

---

## Task 23: Disclaimer gate wiring

**Files:**
- Create: `frontend/src/components/game/DisclaimerGate.tsx`
- Modify: `frontend/src/app/jeu/page.tsx` (consume it, per Task 18 Step 3)

**Interfaces:**
- `<DisclaimerGate accepted={boolean} onAccept={() => Promise<void>} />` —
  renders the PRD §11 relational-guardrail disclaimer text (short,
  factual: results reflect fictional scenarios, not a relationship
  audit) with an "J'accepte" button calling `onAccept` (wired by the
  parent to `POST /api/couples/disclaimer/accept` then a state refresh).
  Shows a waiting state ("En attente de {partner}") if the current user
  already accepted but their partner hasn't.

**Tests:** accept button calls the handler; waiting state renders when
`disclaimerAcceptedByCreatorAt` (or partner) is set but not both — this
can be a plain component test, not necessarily wired through the full
page.

---

## Task 24: Demo mode — `/demo`

**Files:**
- Create: `frontend/src/lib/demo/demo-questions.ts`
- Create: `frontend/src/components/demo/DemoGame.tsx`
- Create: `frontend/src/app/demo/page.tsx`
- Create: `frontend/src/components/demo/DemoGame.test.tsx`
- Modify: `frontend/src/app/page.tsx` (repoint the hero secondary CTA,
  Design Decision 8 — change `href="#jeu"` to `href="/demo"` on the "Voir
  comment ça marche" link only; nothing else on the page changes)

**Interfaces:**
- `DEMO_QUESTIONS`: 3 `MIROIR` + 3 `SCENARIO` + 3 `FACEAFACE` entries,
  same option shape Lot 1 uses (`{id,text}` / `{id,text,weight}`),
  clearly demo-only content (don't reuse the real 27 seed questions'
  slugs or exact copy — write fresh, short demo prompts so nobody mistakes
  this for real game content leaking pre-auth).
- `DemoGame` (`'use client'`): runs the exact same 3-round flow as the
  real game (pass-device interstitial → question → reveal → intro → ...
  → results) but entirely in `useState`, importing `state-machine.ts` and
  `scoring.ts` directly (Design Decision 7) — no `fetch`, no
  `GameSession`/`Answer` rows. Timer is cosmetic-only here too, no server
  round-trip involved so `computeEffectiveElapsedMs`'s anti-cheat clamp
  is moot (the demo self-reports, and that's fine — nothing is at stake).
- `/demo` page hosts `<DemoGame/>` and ends on a results screen reusing
  Task 22's visual language, with the CTA changed to "Créer notre Espace
  Couple" → `/inscription`.

**Tests:** a full run through `DemoGame` (mock the two "players'"
choices) reaches a result screen with a `coupleScore` computed by the
real `computeGameResult`; demo state never calls `fetch`.

---

## Task 25: Manual E2E smoke note

**Files:**
- Modify: `README.md` (or wherever `pnpm smoke:auth` is documented —
  check first) — add a short "Jeu (pass-and-play)" manual UAT section
  mirroring the auth one: pair a couple (existing flow), accept the
  disclaimer both sides, play a full 3-round game in the browser, verify
  in DevTools Network that no response ever contains a `weight` key and
  no response exposes the inactive player's answer before
  `ROUND_REVEAL`, verify a `NO_JOKERS_LEFT` after 2 skips awards no
  points, verify a >40% score gap masks the numeric scores on
  `/resultats`.

**Steps:** no code — documentation only, following the existing
`pnpm smoke:auth` section's format exactly.

---

## Verification

- `pnpm format && pnpm lint && pnpm test` after every task and again at
  the end. `pnpm typecheck` must introduce no new errors beyond the
  recorded pre-existing baseline (see "Known pre-existing environment
  issue" above).
- After Task 25: `pnpm dev`, walk the manual smoke script end to end
  (real pass-and-play game) AND try `/demo` unauthenticated in a private
  browser window.
- Recommended execution: `superpowers:subagent-driven-development`, one
  fresh implementer subagent per task, task review after each, one
  broad whole-branch review at the end — same process Lot 1 used.
