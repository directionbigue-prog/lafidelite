// Unit tests for `/jeu/[id]/manche-revelee`'s pure decision logic
// (Lot 2, Task 21).
//
// This repo runs Vitest with `environment: 'node'` and ships neither jsdom
// nor Testing Library (project-owner decision, see `question-screen.test.ts`),
// so every decision the page makes is extracted into `round-reveal.ts` and
// asserted here on exact values.
//
// The load-bearing suite is `buildRevealRow` / `diagonal MIROIR matching`:
// see the comment above `MIRROR_FIXTURE` for why its four answer ids are
// chosen the way they are, and the "mutation check" describe block at the
// bottom, which temporarily swaps the diagonal comparison for the
// same-author one and asserts the suite goes red.
import { describe, it, expect } from 'vitest';
import {
  SKIPPED_LABEL,
  UNRESOLVED_LABEL,
  PARTNER_FALLBACK_LABEL,
  toDisplayAnswer,
  isPredictionMatch,
  buildRevealRow,
  roundVerdict,
  type RevealRow,
  buildRevealRows,
  revealBootDecision,
  nextPathAfterAdvance,
  revealColumnLabels,
  type AnswerShape,
  type ClientOption,
  type QuestionResultEntry,
} from './round-reveal';
import { UNKNOWN_PHASE_MESSAGE } from './question-screen';

const GAME_ID = 'game_abc123';

const OPTIONS: ClientOption[] = [
  { id: 'opt-oui', text: 'Oui' },
  { id: 'opt-non', text: 'Non' },
  { id: 'opt-parfois', text: 'Parfois' },
];

function answer(selectedOptionId: string | null, isSkipped = false): AnswerShape {
  return { selectedOptionId, isSkipped };
}

describe('toDisplayAnswer', () => {
  it('resolves a selected option id to its text', () => {
    expect(toDisplayAnswer(answer('opt-oui'), OPTIONS)).toEqual({ text: 'Oui', isSkipped: false });
    expect(toDisplayAnswer(answer('opt-non'), OPTIONS)).toEqual({ text: 'Non', isSkipped: false });
  });

  it('renders a skipped answer (isSkipped: true) as the explicit label, never blank', () => {
    expect(toDisplayAnswer(answer('opt-oui', true), OPTIONS)).toEqual({
      text: SKIPPED_LABEL,
      isSkipped: true,
    });
  });

  it('renders a null selectedOptionId as the explicit label, never blank', () => {
    expect(toDisplayAnswer(answer(null), OPTIONS)).toEqual({
      text: SKIPPED_LABEL,
      isSkipped: true,
    });
  });

  it('renders an unresolvable selectedOptionId with a distinct explicit label, not undefined', () => {
    expect(toDisplayAnswer(answer('opt-does-not-exist'), OPTIONS)).toEqual({
      text: UNRESOLVED_LABEL,
      isSkipped: false,
    });
  });
});

describe('isPredictionMatch', () => {
  it('is true when the two selected option ids are equal and neither is skipped', () => {
    expect(isPredictionMatch(answer('opt-oui'), answer('opt-oui'))).toBe(true);
  });

  it('is false when the two selected option ids differ', () => {
    expect(isPredictionMatch(answer('opt-oui'), answer('opt-non'))).toBe(false);
  });

  it('is false when the prediction was skipped, even with equal ids ignored', () => {
    expect(isPredictionMatch(answer('opt-oui', true), answer('opt-oui'))).toBe(false);
  });

  it('is false when the actual answer was skipped', () => {
    expect(isPredictionMatch(answer('opt-oui'), answer('opt-oui', true))).toBe(false);
  });

  it('is false when both are skipped (never reads a null/null coincidence as matched)', () => {
    expect(isPredictionMatch(answer(null, true), answer(null, true))).toBe(false);
  });

  it('is false when a selectedOptionId is null even without the isSkipped flag set', () => {
    expect(isPredictionMatch(answer(null), answer('opt-oui'))).toBe(false);
    expect(isPredictionMatch(answer('opt-oui'), answer(null))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildRevealRow — the diagonal MIROIR wiring.
//
// THE defect this fixture is built to catch: comparing a prediction against
// its OWN AUTHOR's answer instead of the OTHER partner's. That bug is
// invisible whenever creatorAnswer and partnerAnswer happen to collide
// (both partners picked the same option), because then
// `pred === partnerAnswer` and `pred === creatorAnswer` agree by accident.
//
// So this fixture guarantees `creatorAnswer.selectedOptionId !==
// partnerAnswer.selectedOptionId` ('opt-oui' vs 'opt-non' — the two real
// picks genuinely differ), and each prediction is set to CORRECTLY guess
// the OTHER partner's real answer:
//   - creatorPrediction = 'opt-non' (partnerAnswer's id, NOT creatorAnswer's)
//   - partnerPrediction = 'opt-oui' (creatorAnswer's id, NOT partnerAnswer's)
//
// Under the CORRECT diagonal rule both verdicts are true. Under the buggy
// same-author rule (pred vs the predictor's own answer) both would flip to
// false, because creatorPrediction ('opt-non') !== creatorAnswer ('opt-oui')
// and partnerPrediction ('opt-oui') !== partnerAnswer ('opt-non'). The two
// rules therefore give DIFFERENT verdicts on this fixture, which is exactly
// what makes the mutation check below fail loudly instead of passing by
// coincidence.
const MIRROR_FIXTURE: QuestionResultEntry = {
  id: 'q1',
  prompt: 'Qui range le mieux la maison ?',
  options: OPTIONS,
  creatorAnswer: answer('opt-oui'),
  partnerAnswer: answer('opt-non'),
  creatorPrediction: answer('opt-non'),
  partnerPrediction: answer('opt-oui'),
};

describe('buildRevealRow — MIROIR diagonal matching', () => {
  it('marks BOTH partners as having guessed right when each correctly predicts the OTHER (diagonal)', () => {
    const row = buildRevealRow(MIRROR_FIXTURE, 'MIROIR');
    expect(row.mirror).not.toBeNull();
    expect(row.mirror?.creatorGuessedRight).toBe(true);
    expect(row.mirror?.partnerGuessedRight).toBe(true);
  });

  it('resolves prediction display text independently of the match verdict', () => {
    const row = buildRevealRow(MIRROR_FIXTURE, 'MIROIR');
    expect(row.mirror?.creatorPrediction).toEqual({ text: 'Non', isSkipped: false });
    expect(row.mirror?.partnerPrediction).toEqual({ text: 'Oui', isSkipped: false });
    expect(row.creatorAnswer).toEqual({ text: 'Oui', isSkipped: false });
    expect(row.partnerAnswer).toEqual({ text: 'Non', isSkipped: false });
  });

  it('marks a WRONG diagonal guess as false when the prediction misses the other partner entirely', () => {
    const entry: QuestionResultEntry = {
      ...MIRROR_FIXTURE,
      id: 'q2',
      // Creator predicts 'opt-parfois' — matches neither partnerAnswer
      // ('opt-non', the correct diagonal target) nor creatorAnswer
      // ('opt-oui', the buggy same-author target). A genuine miss either way.
      creatorPrediction: answer('opt-parfois'),
    };
    const row = buildRevealRow(entry, 'MIROIR');
    expect(row.mirror?.creatorGuessedRight).toBe(false);
    // partnerPrediction unchanged from MIRROR_FIXTURE — still a correct
    // diagonal guess, proving the two verdicts are computed independently.
    expect(row.mirror?.partnerGuessedRight).toBe(true);
  });

  it('treats a skipped prediction as a miss, and shows it with the explicit skipped label, not blank', () => {
    const entry: QuestionResultEntry = {
      ...MIRROR_FIXTURE,
      id: 'q3',
      creatorPrediction: answer(null, true),
    };
    const row = buildRevealRow(entry, 'MIROIR');
    expect(row.mirror?.creatorGuessedRight).toBe(false);
    expect(row.mirror?.creatorPrediction).toEqual({ text: SKIPPED_LABEL, isSkipped: true });
  });

  it("treats a skipped OWN answer as a miss for the OTHER partner's prediction against it", () => {
    const entry: QuestionResultEntry = {
      ...MIRROR_FIXTURE,
      id: 'q4',
      creatorAnswer: answer(null, true),
      // partnerPrediction guesses 'opt-oui', which used to be creatorAnswer
      // before it was skipped — must NOT still read as a match.
    };
    const row = buildRevealRow(entry, 'MIROIR');
    expect(row.mirror?.partnerGuessedRight).toBe(false);
    expect(row.creatorAnswer).toEqual({ text: SKIPPED_LABEL, isSkipped: true });
  });

  it('builds mirror: null for a non-MIROIR question (no prediction fields present at all)', () => {
    const entry: QuestionResultEntry = {
      id: 'q5',
      prompt: 'Un dîner au restaurant ou une soirée cocooning ?',
      options: OPTIONS,
      creatorAnswer: answer('opt-oui'),
      partnerAnswer: answer('opt-non'),
      // creatorPrediction / partnerPrediction intentionally absent.
    };
    const row = buildRevealRow(entry, 'MIROIR');
    expect(row.mirror).toBeNull();
  });
});

describe('buildRevealRows', () => {
  it('maps every question in a 5-question round to one row each, in order', () => {
    const questions: QuestionResultEntry[] = Array.from({ length: 5 }, (_, i) => ({
      ...MIRROR_FIXTURE,
      id: `q${i + 1}`,
      prompt: `Question ${i + 1}`,
    }));
    const rows = buildRevealRows(questions, 'MIROIR');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
  });

  it('returns an empty array for an empty round rather than throwing', () => {
    expect(buildRevealRows([], 'MIROIR')).toEqual([]);
  });
});

describe('revealBootDecision', () => {
  it('loads the reveal in place when the phase is already ROUND_REVEAL', () => {
    expect(revealBootDecision(GAME_ID, 'ROUND_REVEAL')).toEqual({ kind: 'load' });
  });

  it('routes elsewhere for any OTHER known phase instead of loading stale data', () => {
    expect(revealBootDecision(GAME_ID, 'PASS_DEVICE')).toEqual({
      kind: 'navigate',
      path: `/jeu/${GAME_ID}/passe`,
    });
    expect(revealBootDecision(GAME_ID, 'ANSWERING')).toEqual({
      kind: 'navigate',
      path: `/jeu/${GAME_ID}/question`,
    });
    expect(revealBootDecision(GAME_ID, 'ROUND_INTRO')).toEqual({
      kind: 'navigate',
      path: `/jeu/${GAME_ID}/manche-intro`,
    });
    expect(revealBootDecision(GAME_ID, 'COMPLETE')).toEqual({
      kind: 'navigate',
      path: `/jeu/${GAME_ID}/resultats`,
    });
  });

  it('errors, never guesses a route, for an unrecognized phase', () => {
    expect(revealBootDecision(GAME_ID, 'SOME_FUTURE_PHASE')).toEqual({
      kind: 'error',
      message: UNKNOWN_PHASE_MESSAGE,
    });
  });
});

describe('nextPathAfterAdvance', () => {
  it('routes ROUND_INTRO (rounds 1-2 completing) to the next manche-intro', () => {
    expect(nextPathAfterAdvance(GAME_ID, 'ROUND_INTRO')).toEqual({
      kind: 'navigate',
      path: `/jeu/${GAME_ID}/manche-intro`,
    });
  });

  it('routes COMPLETE (round 3 completing) to resultats', () => {
    expect(nextPathAfterAdvance(GAME_ID, 'COMPLETE')).toEqual({
      kind: 'navigate',
      path: `/jeu/${GAME_ID}/resultats`,
    });
  });

  it('errors, never guesses a route, for an unrecognized phase', () => {
    expect(nextPathAfterAdvance(GAME_ID, 'SOME_FUTURE_PHASE')).toEqual({
      kind: 'error',
      message: UNKNOWN_PHASE_MESSAGE,
    });
  });
});

describe('revealColumnLabels', () => {
  it('labels the CREATOR column "Toi" when the viewer IS the creator, and the partner column with their name', () => {
    expect(revealColumnLabels('CREATOR', 'Awa')).toEqual({
      creatorLabel: 'Toi',
      partnerLabel: 'Awa',
    });
  });

  it('labels the PARTNER column "Toi" when the viewer IS the partner — the inverted case', () => {
    expect(revealColumnLabels('PARTNER', 'Karim')).toEqual({
      creatorLabel: 'Karim',
      partnerLabel: 'Toi',
    });
  });

  it('falls back to a generic partner label when no name is on record', () => {
    expect(revealColumnLabels('CREATOR', null)).toEqual({
      creatorLabel: 'Toi',
      partnerLabel: PARTNER_FALLBACK_LABEL,
    });
  });

  it('never guesses which side is "Toi" for an unrecognized viewerRole', () => {
    const labels = revealColumnLabels('SOMETHING_ELSE', 'Awa');
    expect(labels.creatorLabel).not.toBe('Toi');
    expect(labels.partnerLabel).not.toBe('Toi');
  });
});

// ---------------------------------------------------------------------------
// Mutation check (manual, documented here rather than automated in CI):
//
// Temporarily edited `buildRevealRow` in round-reveal.ts to swap the
// diagonal comparison for the same-author one:
//
//   creatorGuessedRight: isPredictionMatch(creatorPrediction, entry.creatorAnswer),   // BUG
//   partnerGuessedRight: isPredictionMatch(partnerPrediction, entry.partnerAnswer),   // BUG
//
// Result: both assertions in "marks BOTH partners as having guessed right
// when each correctly predicts the OTHER (diagonal)" failed —
// creatorGuessedRight and partnerGuessedRight both flipped from `true` to
// `false`, exactly as predicted by the fixture's design above. Reverted the
// swap and confirmed the full `round-reveal.test.ts` suite is green again.
// See the task report for the exact command transcript.

// ── Alignment and the round's opening line ──────────────────────────
//
// The rule these pin: a round the couple cannot "agree" on must not be
// told they diverged. SCENARIO answers are each partner's own, judged
// against a hidden weight, and a verdict there would be a fabrication.
describe('alignment per round type', () => {
  const faceEntry = (creator: string | null, partner: string | null) => ({
    id: 'q',
    prompt: 'Le pilier d’une relation solide :',
    options: [
      { id: 'a', text: 'La fidélité' },
      { id: 'b', text: 'La complicité' },
    ],
    creatorAnswer: { selectedOptionId: creator, isSkipped: creator === null },
    partnerAnswer: { selectedOptionId: partner, isSkipped: partner === null },
  });

  it('counts a FACEAFACE question as aligned only when both chose the same option', () => {
    expect(buildRevealRow(faceEntry('a', 'a'), 'FACEAFACE').aligned).toBe(true);
    expect(buildRevealRow(faceEntry('a', 'b'), 'FACEAFACE').aligned).toBe(false);
  });

  it('never counts a skipped answer as an agreement', () => {
    // Both skipped: two nulls compared naively would read as a match.
    expect(buildRevealRow(faceEntry(null, null), 'FACEAFACE').aligned).toBe(false);
    expect(buildRevealRow(faceEntry('a', null), 'FACEAFACE').aligned).toBe(false);
  });

  it('leaves SCENARIO with no verdict at all', () => {
    expect(buildRevealRow(faceEntry('a', 'a'), 'SCENARIO').aligned).toBeNull();
  });

  it('requires BOTH predictions for a MIROIR question to count as understood', () => {
    // The shared fixture has both partners guessing right.
    expect(buildRevealRow(MIRROR_FIXTURE, 'MIROIR').aligned).toBe(true);

    // One right, one wrong is NOT "we understood each other" — the claim
    // is about the pair. Only the partner's prediction is spoiled here.
    const halfRight = { ...MIRROR_FIXTURE, partnerPrediction: answer('opt-non') };
    const row = buildRevealRow(halfRight, 'MIROIR');
    expect([row.mirror?.creatorGuessedRight, row.mirror?.partnerGuessedRight]).toEqual([
      true,
      false,
    ]);
    expect(row.aligned).toBe(false);
  });
});

describe('roundVerdict', () => {
  const row = (aligned: boolean | null): RevealRow => ({
    id: Math.random().toString(),
    prompt: 'p',
    creatorAnswer: { text: 'a', isSkipped: false },
    partnerAnswer: { text: 'a', isSkipped: false },
    mirror: null,
    aligned,
  });

  it('counts the questions the couple landed together on', () => {
    const v = roundVerdict([row(true), row(true), row(false), row(true), row(false)], 'MIROIR');
    expect(v.headline).toBe('Vous vous êtes compris 3 fois sur 5');
    expect(v.subline).toBe('Voilà où vous avez divergé.');
  });

  it('uses the round’s own verb', () => {
    expect(roundVerdict([row(true)], 'FACEAFACE').headline).toBe(
      'Vous étiez d’accord 1 fois sur 1',
    );
  });

  it('says something true when they matched on everything, and when they matched on nothing', () => {
    expect(roundVerdict([row(true), row(true)], 'MIROIR').subline).toBe(
      'Pas une seule divergence.',
    );
    expect(roundVerdict([row(false), row(false)], 'MIROIR').subline).toBe(
      'Vous avez tout à vous raconter.',
    );
  });

  it('never claims a verdict on the Scénarios round', () => {
    const v = roundVerdict([row(null), row(null)], 'SCENARIO');
    expect(v.alignedCount).toBeNull();
    expect(v.headline).toBe('Chacun a répondu pour soi');
    // No tally of any kind, because there is nothing to tally. (The
    // subline may mention the final score in words — what this screen may
    // never carry is a NUMBER, and the headline carries none.)
    expect(v.headline).not.toMatch(/[0-9]/);
  });
});
