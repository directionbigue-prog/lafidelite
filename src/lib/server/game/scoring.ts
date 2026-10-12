// Pure scoring engine for a completed game session (all 3 rounds). No
// Prisma import, no `server-only` import — this module must stay testable
// without a database (mirrors the state-machine.ts convention). Inputs are
// plain arrays of plain answer-like objects (`ScoredAnswer`), never Prisma
// model types directly.
//
// Consumed by Lot 2's `POST /api/games/:id/round/advance` (final-round
// branch), which resolves `optionWeight` from `Question.options` before
// calling `computeGameResult` — this module never sees raw Question rows.
/**
 * Uniform random index in `[0, maxExclusive)`, using the Web Crypto API
 * rather than `node:crypto`.
 *
 * The distinction matters: Lot 2's `/demo` mode imports this module into a
 * BROWSER bundle so a visitor without an account plays against the real
 * scoring engine instead of a reimplementation of it. A bare
 * `import crypto from 'node:crypto'` breaks that bundle at import time,
 * whatever code path actually runs. `globalThis.crypto.getRandomValues` is
 * present in both Node (>= 19) and every browser, so the module stays
 * isomorphic with no loss of randomness quality.
 *
 * Rejection sampling avoids the modulo bias a bare `% maxExclusive` would
 * introduce.
 */
function randomIndex(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  // A pool larger than 2^32 would make `limit` 0 and spin forever. It is
  // unreachable from the only call site (a pool of 8 prompts), but the
  // guard costs one line and turns a hang into a defined result.
  if (maxExclusive > 2 ** 32) return Math.floor(Math.random() * maxExclusive);
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    globalThis.crypto.getRandomValues(buf);
    value = buf[0] ?? 0;
  } while (value >= limit);
  return value % maxExclusive;
}

export const MIRROR_POINTS_PER_MATCH = 10;
export const ALIGNMENT_POINTS_PER_MATCH = 10;
export const MIRROR_MULTIPLIER = 1.0;
export const FIDELITY_MULTIPLIER = 1.5;
export const ALIGNMENT_MULTIPLIER = 1.0;
export const TIMER_MS = 45_000;
export const NETWORK_GRACE_MS = 2_000;
export const MAX_SPEED_POINTS_PER_QUESTION = 5;
export const SPEED_BONUS_CAP_RATIO = 0.1;
export const GAP_MASK_THRESHOLD_PERCENT = 40;

export const COMPLICITY_THRESHOLDS = [
  { level: 'DECOUVERTE', min: 0 },
  { level: 'COMPLICES', min: 100 },
  { level: 'FUSIONNELS', min: 300 },
  { level: 'INSEPARABLES', min: 600 },
] as const;

export const CONVERSATION_PROMPTS: readonly string[] = [
  'Quel a été votre plus beau souvenir ce mois-ci ?',
  "Y a-t-il quelque chose que vous n'avez jamais osé demander à l'autre ?",
  'Qu’est-ce qui vous ferait sentir encore plus proches cette semaine ?',
  'Quel petit geste du quotidien aimeriez-vous recevoir plus souvent ?',
  'De quoi êtes-vous le plus fier·e dans votre couple en ce moment ?',
  'Quel rêve à deux aimeriez-vous commencer à réaliser bientôt ?',
  'Qu’est-ce qui vous a fait rire ensemble récemment ?',
  'Comment aimeriez-vous célébrer votre prochain moment important ensemble ?',
];

/**
 * Anti-cheat clamp on the elapsed time credited toward the speed bonus.
 * A client-reported value below `serverElapsedMs - NETWORK_GRACE_MS` is
 * distrusted and pushed UP toward the server-observed time (so a client
 * that under-reports its elapsed time to farm speed points gains nothing
 * beyond the network-grace window). Result is clamped to [0, TIMER_MS].
 */
export function computeEffectiveElapsedMs(
  clientElapsedMs: number | null,
  serverElapsedMs: number,
): number {
  const candidate = clientElapsedMs ?? serverElapsedMs;
  const raw = Math.max(candidate, serverElapsedMs - NETWORK_GRACE_MS);
  return Math.min(Math.max(raw, 0), TIMER_MS);
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

function answerKey(questionId: string, userId: string, kind: 'OWN' | 'PREDICTION'): string {
  return `${questionId}::${userId}::${kind}`;
}

function buildAnswerMap(answers: ScoredAnswer[]): Map<string, ScoredAnswer> {
  const map = new Map<string, ScoredAnswer>();
  for (const answer of answers) {
    map.set(answerKey(answer.questionId, answer.userId, answer.kind), answer);
  }
  return map;
}

function isUsableSelection(answer: ScoredAnswer | undefined): answer is ScoredAnswer {
  return answer !== undefined && !answer.isSkipped && answer.selectedOptionId !== null;
}

/**
 * mirrorPoints for `playerId`: for every MIROIR question, does this
 * player's PREDICTION selectedOptionId equal the OTHER player's OWN
 * selectedOptionId for that same question? A skipped prediction (or a
 * missing/skipped OWN counterpart) never matches.
 */
function computeMirrorPoints(
  answers: ScoredAnswer[],
  answerMap: Map<string, ScoredAnswer>,
  playerId: string,
  otherId: string,
): number {
  const mirrorQuestionIds = new Set(
    answers.filter((a) => a.roundType === 'MIROIR').map((a) => a.questionId),
  );

  let points = 0;
  for (const questionId of mirrorQuestionIds) {
    const prediction = answerMap.get(answerKey(questionId, playerId, 'PREDICTION'));
    const otherOwn = answerMap.get(answerKey(questionId, otherId, 'OWN'));
    if (!isUsableSelection(prediction) || !isUsableSelection(otherOwn)) continue;
    if (prediction.selectedOptionId === otherOwn.selectedOptionId) {
      points += MIRROR_POINTS_PER_MATCH;
    }
  }
  return points;
}

/**
 * fidelityScore for `playerId`: sum of optionWeight across this player's
 * SCENARIO OWN answers (0 for a skipped question).
 */
function computeFidelityScore(answers: ScoredAnswer[], playerId: string): number {
  let sum = 0;
  for (const a of answers) {
    if (a.roundType === 'SCENARIO' && a.kind === 'OWN' && a.userId === playerId) {
      if (a.isSkipped) continue;
      if (a.optionWeight === undefined || a.optionWeight === null) {
        throw new Error(
          `Missing optionWeight for scored SCENARIO answer (questionId: ${a.questionId}, userId: ${a.userId}) — resolve weights from the raw Question.options, not a client-shaped payload.`,
        );
      }
      sum += a.optionWeight;
    }
  }
  return sum;
}

/**
 * alignmentPointsShared: count of FACEAFACE questions where creator's OWN
 * selectedOptionId equals partner's OWN selectedOptionId for that
 * question, × ALIGNMENT_POINTS_PER_MATCH. Single shared value.
 */
function computeAlignmentPointsShared(
  answers: ScoredAnswer[],
  answerMap: Map<string, ScoredAnswer>,
  creatorId: string,
  partnerId: string,
): number {
  const faceQuestionIds = new Set(
    answers.filter((a) => a.roundType === 'FACEAFACE').map((a) => a.questionId),
  );

  let matches = 0;
  for (const questionId of faceQuestionIds) {
    const creatorOwn = answerMap.get(answerKey(questionId, creatorId, 'OWN'));
    const partnerOwn = answerMap.get(answerKey(questionId, partnerId, 'OWN'));
    if (!isUsableSelection(creatorOwn) || !isUsableSelection(partnerOwn)) continue;
    if (creatorOwn.selectedOptionId === partnerOwn.selectedOptionId) {
      matches += 1;
    }
  }
  return matches * ALIGNMENT_POINTS_PER_MATCH;
}

/**
 * Raw (pre-cap) speed bonus sum for `playerId`, over this player's
 * OWN-kind answers only (PREDICTION rows excluded to avoid double-counting
 * a MIROIR question's single screen-visit timing).
 */
function computeRawSpeedSum(answers: ScoredAnswer[], playerId: string): number {
  let sum = 0;
  for (const a of answers) {
    if (a.kind !== 'OWN' || a.userId !== playerId) continue;
    if (a.isSkipped) continue;
    const ratio = Math.max(0, (TIMER_MS - a.effectiveElapsedMs) / TIMER_MS);
    sum += MAX_SPEED_POINTS_PER_QUESTION * ratio;
  }
  return sum;
}

/**
 * The complicity level a cumulative couple score falls into.
 *
 * Exported so `/api/couples/me` can report the couple's CURRENT level on
 * the game's start screen, rather than the screen re-walking
 * `COMPLICITY_THRESHOLDS` client-side — two copies of a threshold table
 * drift the moment one of them gains a tier.
 */
export function findComplicityLevel(value: number): string {
  let level: string = COMPLICITY_THRESHOLDS[0].level;
  for (const threshold of COMPLICITY_THRESHOLDS) {
    if (value >= threshold.min) {
      level = threshold.level;
    }
  }
  return level;
}

export interface TitlePair {
  creatorTitle: string;
  partnerTitle: string;
}

/**
 * The single, non-duplicated definition of the title rule (Lot 2, Task 15):
 * on a tie both partners are "Cœur d'Or"; otherwise the winner is
 * "Cœur d'Or" and the other is "Cœur Sincère" — never a pejorative.
 *
 * Deliberately takes the already-decided `winnerRole`, NOT the two raw
 * scores — the creator-vs-partner score comparison that decides a winner
 * happens in exactly ONE place (`computeGameResult`'s `winnerRole`
 * derivation below). Titles are never persisted (GameResult has no columns
 * for them), so the results route re-derives them from the PERSISTED
 * `GameResult.winnerRole` column via this helper. Because this function
 * never re-compares scores itself, there is no way for a titles/winnerRole
 * pair to disagree — including if a future change (e.g. a tie tolerance)
 * alters how `winnerRole` is decided: `deriveTitles` picks that change up
 * for free instead of silently drifting behind a second comparison.
 */
export function deriveTitles(winnerRole: 'CREATOR' | 'PARTNER' | 'TIE'): TitlePair {
  if (winnerRole === 'TIE') {
    return { creatorTitle: "Cœur d'Or", partnerTitle: "Cœur d'Or" };
  }
  if (winnerRole === 'CREATOR') {
    return { creatorTitle: "Cœur d'Or", partnerTitle: 'Cœur Sincère' };
  }
  return { creatorTitle: 'Cœur Sincère', partnerTitle: "Cœur d'Or" };
}

function pickConversationPrompts(): string[] {
  const pool = [...CONVERSATION_PROMPTS];
  const result: string[] = [];
  while (result.length < 3 && pool.length > 0) {
    const idx = randomIndex(pool.length);
    const [picked] = pool.splice(idx, 1);
    if (picked !== undefined) result.push(picked);
  }
  return result;
}

export function computeGameResult(input: ComputeGameResultInput): GameResultComputation {
  const { creatorId, partnerId, cumulativeCoupleScoreBeforeThisGame, answers } = input;
  const answerMap = buildAnswerMap(answers);

  const creatorMirrorPoints = computeMirrorPoints(answers, answerMap, creatorId, partnerId);
  const partnerMirrorPoints = computeMirrorPoints(answers, answerMap, partnerId, creatorId);

  const creatorFidelityScore = computeFidelityScore(answers, creatorId);
  const partnerFidelityScore = computeFidelityScore(answers, partnerId);

  const alignmentPointsShared = computeAlignmentPointsShared(
    answers,
    answerMap,
    creatorId,
    partnerId,
  );

  const creatorRawScore =
    creatorMirrorPoints * MIRROR_MULTIPLIER +
    creatorFidelityScore * FIDELITY_MULTIPLIER +
    alignmentPointsShared * ALIGNMENT_MULTIPLIER;
  const partnerRawScore =
    partnerMirrorPoints * MIRROR_MULTIPLIER +
    partnerFidelityScore * FIDELITY_MULTIPLIER +
    alignmentPointsShared * ALIGNMENT_MULTIPLIER;

  const creatorRawSpeedSum = computeRawSpeedSum(answers, creatorId);
  const partnerRawSpeedSum = computeRawSpeedSum(answers, partnerId);

  // Round the CAPPED speed bonus (not the raw pre-cap sum) so it is always
  // an integer on its own — GameResult.creatorSpeedBonus/partnerSpeedBonus
  // are separate Int columns, persisted independently of totalScore.
  const creatorSpeedBonus = Math.round(
    Math.min(creatorRawSpeedSum, SPEED_BONUS_CAP_RATIO * creatorRawScore),
  );
  const partnerSpeedBonus = Math.round(
    Math.min(partnerRawSpeedSum, SPEED_BONUS_CAP_RATIO * partnerRawScore),
  );

  // Round rawScore too, so totalScore is always an integer sum of two
  // integers (GameResult.creatorTotalScore/partnerTotalScore are Int
  // columns). winnerRole, titles, gapPercent and gapMasked below are all
  // derived from these ROUNDED totals — never from the unrounded raw
  // scores — so the displayed winner can never disagree with the
  // displayed scores.
  const creatorTotalScore = Math.round(creatorRawScore) + creatorSpeedBonus;
  const partnerTotalScore = Math.round(partnerRawScore) + partnerSpeedBonus;

  const coupleScore = alignmentPointsShared * 2;

  const gapPercent =
    (Math.abs(creatorTotalScore - partnerTotalScore) /
      Math.max(creatorTotalScore, partnerTotalScore, 1)) *
    100;
  const gapMasked = gapPercent > GAP_MASK_THRESHOLD_PERCENT;

  let winnerRole: 'CREATOR' | 'PARTNER' | 'TIE';
  if (creatorTotalScore === partnerTotalScore) {
    winnerRole = 'TIE';
  } else if (creatorTotalScore > partnerTotalScore) {
    winnerRole = 'CREATOR';
  } else {
    winnerRole = 'PARTNER';
  }
  const { creatorTitle, partnerTitle } = deriveTitles(winnerRole);

  const complicityLevel = findComplicityLevel(cumulativeCoupleScoreBeforeThisGame + coupleScore);

  return {
    coupleScore,
    complicityLevel,
    creatorTotalScore,
    partnerTotalScore,
    creatorMirrorPoints,
    partnerMirrorPoints,
    creatorFidelityScore,
    partnerFidelityScore,
    alignmentPointsShared,
    creatorSpeedBonus,
    partnerSpeedBonus,
    gapPercent,
    gapMasked,
    winnerRole,
    creatorTitle,
    partnerTitle,
    conversationPrompts: pickConversationPrompts(),
  };
}
