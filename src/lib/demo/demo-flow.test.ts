// Unit tests for `/demo`'s decision logic (Lot 2, Task 24).
//
// The brief named a `DemoGame.test.tsx`. There is no such file: this repo
// runs Vitest with `environment: 'node'` and ships neither jsdom nor
// Testing Library (project-owner decision, restated for this task), so the
// demo's decisions were extracted into `demo-flow.ts` and are pinned here
// with exact values, exactly as `question-screen.ts`, `round-reveal.ts` and
// `resultats.ts` are for the authenticated screens. `DemoGame.tsx` stays a
// thin `useState` + render wrapper over these functions.
//
// The two claims this file exists to make genuinely falsifiable:
//   1. a full scripted run reaches a results screen whose `coupleScore` came
//      out of the REAL `computeGameResult` — see the two tests under
//      "full scripted run", one pinning the exact value the real engine's
//      alignment rule produces for a run with a known number of FACEAFACE
//      agreements, the other feeding a hand-built `ScoredAnswer[]` straight
//      to `computeGameResult` and requiring the demo to agree with it field
//      by field;
//   2. the demo performs no network call — driven with `globalThis.fetch`
//      replaced by a stub that THROWS, so a `fetch` added anywhere in the
//      pure flow fails this file rather than shipping.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { advanceAfterAnswer, type SessionPhaseState } from '@/lib/server/game/state-machine';
import { computeGameResult, type ScoredAnswer } from '@/lib/server/game/scoring';
import { buildResultsSections } from '@/lib/game/resultats';
import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';
import {
  DEMO_CHARACTER_ID,
  DEMO_GAP_MASKED_MESSAGE,
  DEMO_VISITOR_ID,
  advanceDemoRound,
  beginDemoRound,
  buildDemoRevealRows,
  buildDemoScoredAnswers,
  computeDemoResult,
  currentDemoQuestion,
  demoColumnLabels,
  demoQuestionsForRound,
  demoRoundType,
  demoScreenForPhase,
  recordDemoAnswer,
  skipDemoQuestion,
  startDemo,
  toDemoResultsResponse,
  type DemoFlowState,
  type DemoVisitorAnswer,
} from './demo-flow';
import {
  DEMO_CHARACTER_NAME,
  DEMO_QUESTIONS,
  DEMO_QUESTIONS_PER_ROUND,
  type DemoQuestion,
} from './demo-questions';

const NOW = new Date('2026-09-05T10:00:00.000Z');

/** Answers a whole round by picking, per question, whatever the caller says. */
type Picker = (question: DemoQuestion, indexInRound: number) => 'match' | 'differ' | 'skip';

function optionOtherThan(question: DemoQuestion, optionId: string): string {
  const other = question.options.find((o) => o.id !== optionId);
  if (other === undefined) throw new Error(`demo question ${question.id} has a single option`);
  return other.id;
}

/** Plays one round to its reveal, then advances out of it. */
function playRound(state: DemoFlowState, pick: Picker): DemoFlowState {
  let next = beginDemoRound(state, NOW);

  for (let i = 0; i < DEMO_QUESTIONS_PER_ROUND; i += 1) {
    const question = currentDemoQuestion(next);
    if (question === null) throw new Error(`no question at index ${i}`);
    const decision = pick(question, i);

    if (decision === 'skip') {
      next = skipDemoQuestion(next, 5_000, NOW);
      continue;
    }

    const ownOptionId =
      decision === 'match'
        ? question.character.ownOptionId
        : optionOtherThan(question, question.character.ownOptionId);

    next = recordDemoAnswer(
      next,
      question.roundType === 'MIROIR'
        ? {
            ownOptionId,
            // Guess the character's real answer whenever we're "matching".
            predictionOptionId:
              decision === 'match'
                ? question.character.ownOptionId
                : optionOtherThan(question, question.character.ownOptionId),
            elapsedMs: 5_000,
          }
        : { ownOptionId, elapsedMs: 5_000 },
      NOW,
    );
  }

  return next;
}

describe('demo question bank', () => {
  it('holds exactly 3 MIROIR + 3 SCENARIO + 3 FACEAFACE questions', () => {
    const byType = DEMO_QUESTIONS.reduce<Record<string, number>>((acc, q) => {
      acc[q.roundType] = (acc[q.roundType] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType).toEqual({ MIROIR: 3, SCENARIO: 3, FACEAFACE: 3 });
  });

  it('shares no id and no prompt with the real seed bank (no paid content pre-auth)', () => {
    const seedSlugs = new Set(QUESTIONS_SEED.map((q) => q.slug));
    const seedPrompts = new Set(QUESTIONS_SEED.map((q) => q.prompt));

    expect(DEMO_QUESTIONS.filter((q) => seedSlugs.has(q.id))).toEqual([]);
    expect(DEMO_QUESTIONS.filter((q) => seedPrompts.has(q.prompt))).toEqual([]);
  });

  it('gives every SCENARIO option a weight and no other round type any', () => {
    for (const question of DEMO_QUESTIONS) {
      const weighted = question.options.filter((o) => 'weight' in o);
      expect(weighted.length).toBe(question.roundType === 'SCENARIO' ? question.options.length : 0);
    }
  });

  it('scripts a character answer whose option id exists on its question', () => {
    for (const question of DEMO_QUESTIONS) {
      const ids = question.options.map((o) => o.id);
      expect(ids).toContain(question.character.ownOptionId);
      if (question.roundType === 'MIROIR') {
        expect(ids).toContain(question.character.predictionOptionId);
      }
    }
  });
});

describe('demoScreenForPhase', () => {
  it('maps every phase the machine can produce, and only those', () => {
    expect(demoScreenForPhase('ROUND_INTRO')).toBe('intro');
    expect(demoScreenForPhase('PASS_DEVICE')).toBe('question');
    expect(demoScreenForPhase('ANSWERING')).toBe('question');
    expect(demoScreenForPhase('ROUND_REVEAL')).toBe('reveal');
    expect(demoScreenForPhase('COMPLETE')).toBe('results');
    expect(demoScreenForPhase('PAUSED')).toBe('unknown');
    expect(demoScreenForPhase('')).toBe('unknown');
  });
});

describe('demoRoundType / demoQuestionsForRound', () => {
  it('follows the game’s fixed round order', () => {
    expect(demoRoundType(1)).toBe('MIROIR');
    expect(demoRoundType(2)).toBe('SCENARIO');
    expect(demoRoundType(3)).toBe('FACEAFACE');
    expect(demoRoundType(0)).toBeNull();
    expect(demoRoundType(4)).toBeNull();
  });

  it('returns the round’s three questions, and nothing for a bad round', () => {
    expect(demoQuestionsForRound(1).map((q) => q.id)).toEqual([
      'demo-mirror-matin',
      'demo-mirror-vacances',
      'demo-mirror-soiree',
    ]);
    expect(demoQuestionsForRound(2).length).toBe(3);
    expect(demoQuestionsForRound(3).length).toBe(3);
    expect(demoQuestionsForRound(4)).toEqual([]);
  });
});

describe('startDemo / beginDemoRound', () => {
  it('starts parked on the round 1 intro with no answers', () => {
    expect(startDemo()).toEqual({
      session: {
        currentRoundNumber: 1,
        currentQuestionNumber: 1,
        phase: 'ROUND_INTRO',
        activePlayerRole: 'CREATOR',
        currentQuestionShownAt: null,
      },
      answers: [],
    });
  });

  it('resolves ROUND_INTRO through to ANSWERING and stamps the turn', () => {
    const state = beginDemoRound(startDemo(), NOW);
    expect(state.session.phase).toBe('ANSWERING');
    expect(state.session.currentQuestionShownAt).toEqual(NOW);
    expect(currentDemoQuestion(state)?.id).toBe('demo-mirror-matin');
  });

  it('exposes no question while on an intro or a reveal', () => {
    expect(currentDemoQuestion(startDemo())).toBeNull();
  });
});

describe('the demo runs the real state machine at its own round length', () => {
  // The demo's rounds are 3 questions long. There is no adapter any more:
  // `advanceAfterAnswer` takes the round length as an argument, so the demo
  // passes its own and the machine ends the round where the demo actually
  // ends. Before that, the demo had to fake `currentQuestionNumber` up to the
  // machine's hardcoded 5 — a lie that worked only while the constant did.
  it('ends a demo round at the demo’s own length, not the machine’s old constant', () => {
    const state: SessionPhaseState = {
      currentRoundNumber: 1,
      currentQuestionNumber: DEMO_QUESTIONS_PER_ROUND,
      phase: 'ANSWERING',
      activePlayerRole: 'CREATOR',
      currentQuestionShownAt: NOW,
    };
    const result = advanceAfterAnswer(state, 2, DEMO_QUESTIONS_PER_ROUND);
    expect(result.state.phase).toBe('ROUND_REVEAL');
    expect(result.roundCompleted).toBe(true);
  });

  it('walks a round: question 1 -> 2 -> 3 -> reveal, always ANSWERING in between', () => {
    let state = beginDemoRound(startDemo(), NOW);
    const seen: string[] = [];

    for (let i = 0; i < DEMO_QUESTIONS_PER_ROUND; i += 1) {
      const question = currentDemoQuestion(state);
      if (question === null) throw new Error('missing question');
      seen.push(question.id);
      state = recordDemoAnswer(
        state,
        { ownOptionId: 'a', predictionOptionId: 'a', elapsedMs: 1_000 },
        NOW,
      );
    }

    expect(seen).toEqual(['demo-mirror-matin', 'demo-mirror-vacances', 'demo-mirror-soiree']);
    expect(demoScreenForPhase(state.session.phase)).toBe('reveal');
    expect(state.answers.length).toBe(3);
  });

  it('advances a reveal to the next round’s intro, and the last one to the results', () => {
    let state = playRound(startDemo(), () => 'match');
    state = advanceDemoRound(state);
    expect(state.session.currentRoundNumber).toBe(2);
    expect(demoScreenForPhase(state.session.phase)).toBe('intro');

    state = advanceDemoRound(playRound(state, () => 'match'));
    expect(state.session.currentRoundNumber).toBe(3);

    state = advanceDemoRound(playRound(state, () => 'match'));
    expect(demoScreenForPhase(state.session.phase)).toBe('results');
  });
});

describe('skipDemoQuestion', () => {
  it('records a skip with no selections and still advances', () => {
    const state = skipDemoQuestion(beginDemoRound(startDemo(), NOW), 7_000, NOW);
    expect(state.answers).toEqual([
      {
        questionId: 'demo-mirror-matin',
        ownOptionId: null,
        predictionOptionId: null,
        isSkipped: true,
        elapsedMs: 7_000,
      },
    ]);
    expect(currentDemoQuestion(state)?.id).toBe('demo-mirror-vacances');
  });

  it('scores a skipped SCENARIO answer at zero fidelity instead of throwing', () => {
    const answers: DemoVisitorAnswer[] = [
      {
        questionId: 'demo-scenario-message-tard',
        ownOptionId: null,
        predictionOptionId: null,
        isSkipped: true,
        elapsedMs: 0,
      },
    ];
    // `computeFidelityScore` THROWS on a scored SCENARIO answer carrying no
    // `optionWeight`; a skipped one must carry none and must not throw.
    expect(computeDemoResult(answers).creatorFidelityScore).toBe(0);
  });
});

describe('buildDemoScoredAnswers', () => {
  it('emits both sides of a MIROIR question, with the character’s scripted prediction', () => {
    const answers: DemoVisitorAnswer[] = [
      {
        questionId: 'demo-mirror-matin',
        ownOptionId: 'a',
        predictionOptionId: 'b',
        isSkipped: false,
        elapsedMs: 3_000,
      },
    ];

    expect(buildDemoScoredAnswers(answers)).toEqual([
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_VISITOR_ID,
        kind: 'OWN',
        selectedOptionId: 'a',
        isSkipped: false,
        effectiveElapsedMs: 3_000,
      },
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_CHARACTER_ID,
        kind: 'OWN',
        selectedOptionId: 'b',
        isSkipped: false,
        effectiveElapsedMs: 12_000,
      },
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_VISITOR_ID,
        kind: 'PREDICTION',
        selectedOptionId: 'b',
        isSkipped: false,
        effectiveElapsedMs: 3_000,
      },
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_CHARACTER_ID,
        kind: 'PREDICTION',
        selectedOptionId: 'c',
        isSkipped: false,
        effectiveElapsedMs: 12_000,
      },
    ]);
  });

  it('attaches optionWeight to SCENARIO OWN answers only', () => {
    const scored = buildDemoScoredAnswers([
      {
        questionId: 'demo-scenario-message-tard',
        ownOptionId: 'c',
        predictionOptionId: null,
        isSkipped: false,
        elapsedMs: 1_000,
      },
      {
        questionId: 'demo-face-weekend',
        ownOptionId: 'a',
        predictionOptionId: null,
        isSkipped: false,
        elapsedMs: 1_000,
      },
    ]);

    const visitorScenario = scored.find(
      (a) => a.questionId === 'demo-scenario-message-tard' && a.userId === DEMO_VISITOR_ID,
    );
    const visitorFace = scored.find(
      (a) => a.questionId === 'demo-face-weekend' && a.userId === DEMO_VISITOR_ID,
    );

    // Option 'c' of demo-scenario-message-tard carries weight 4.
    expect(visitorScenario?.optionWeight).toBe(4);
    // Key must be ABSENT, not `undefined` — `exactOptionalPropertyTypes`.
    expect(visitorFace !== undefined && 'optionWeight' in visitorFace).toBe(false);
  });

  it('credits a MIROIR guess diagonally: prediction vs the OTHER side’s own answer', () => {
    // The visitor's prediction equals the character's scripted own answer on
    // all three MIROIR questions, and nothing else is answered.
    const answers: DemoVisitorAnswer[] = demoQuestionsForRound(1).map((q) => ({
      questionId: q.id,
      ownOptionId: 'a',
      predictionOptionId: q.character.ownOptionId,
      isSkipped: false,
      elapsedMs: 45_000,
    }));

    // 3 correct guesses × MIRROR_POINTS_PER_MATCH (10).
    expect(computeDemoResult(answers).creatorMirrorPoints).toBe(30);
  });
});

describe('full scripted run', () => {
  /**
   * Plays all three rounds. The visitor matches the demo character on the
   * FACEAFACE questions whose index is in `agreeOnFaceIndexes`, and differs
   * everywhere else in that round.
   */
  function runToCompletion(agreeOnFaceIndexes: number[]): DemoFlowState {
    let state = advanceDemoRound(playRound(startDemo(), () => 'differ'));
    state = advanceDemoRound(playRound(state, () => 'differ'));
    state = advanceDemoRound(
      playRound(state, (_question, index) =>
        agreeOnFaceIndexes.includes(index) ? 'match' : 'differ',
      ),
    );
    return state;
  }

  it('reaches a results screen whose coupleScore is the real engine’s alignment rule', () => {
    const state = runToCompletion([0, 2]);
    expect(demoScreenForPhase(state.session.phase)).toBe('results');
    expect(state.answers.length).toBe(DEMO_QUESTIONS.length);

    const sections = buildResultsSections(
      toDemoResultsResponse(computeDemoResult(state.answers)),
      demoColumnLabels(),
    );

    // coupleScore is FIRST — the product's no-podium ordering, owned by
    // `buildResultsSections` and reused here rather than re-decided.
    // Its value: 2 FACEAFACE agreements × ALIGNMENT_POINTS_PER_MATCH (10),
    // doubled by `coupleScore = alignmentPointsShared * 2` = 40.
    expect(sections[0]).toEqual({ kind: 'coupleScore', coupleScore: 40 });
    expect(sections.map((s) => s.kind)).toEqual([
      'coupleScore',
      'complicityLevel',
      'individualScores',
      'titles',
      'conversationPrompts',
    ]);
  });

  it('moves the coupleScore when the run’s agreements move (not a constant)', () => {
    expect(computeDemoResult(runToCompletion([]).answers).coupleScore).toBe(0);
    expect(computeDemoResult(runToCompletion([1]).answers).coupleScore).toBe(20);
    expect(computeDemoResult(runToCompletion([0, 1, 2]).answers).coupleScore).toBe(60);
  });

  it('agrees field-for-field with computeGameResult fed a hand-built ScoredAnswer[]', () => {
    // A short run — one question per round — whose ScoredAnswer rows are
    // written out here by hand, independently of `buildDemoScoredAnswers`.
    // If that function's wiring drifts (a swapped userId, a dropped
    // PREDICTION row, a wrong weight), the two results diverge.
    const answers: DemoVisitorAnswer[] = [
      {
        questionId: 'demo-mirror-matin',
        ownOptionId: 'c',
        predictionOptionId: 'b',
        isSkipped: false,
        elapsedMs: 20_000,
      },
      {
        questionId: 'demo-scenario-sortie-imprevue',
        ownOptionId: 'a',
        predictionOptionId: null,
        isSkipped: false,
        elapsedMs: 30_000,
      },
      {
        questionId: 'demo-face-energie',
        ownOptionId: 'd',
        predictionOptionId: null,
        isSkipped: false,
        elapsedMs: 10_000,
      },
    ];

    const handBuilt: ScoredAnswer[] = [
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_VISITOR_ID,
        kind: 'OWN',
        selectedOptionId: 'c',
        isSkipped: false,
        effectiveElapsedMs: 20_000,
      },
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_CHARACTER_ID,
        kind: 'OWN',
        selectedOptionId: 'b',
        isSkipped: false,
        effectiveElapsedMs: 12_000,
      },
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_VISITOR_ID,
        kind: 'PREDICTION',
        selectedOptionId: 'b',
        isSkipped: false,
        effectiveElapsedMs: 20_000,
      },
      {
        questionId: 'demo-mirror-matin',
        roundType: 'MIROIR',
        userId: DEMO_CHARACTER_ID,
        kind: 'PREDICTION',
        selectedOptionId: 'c',
        isSkipped: false,
        effectiveElapsedMs: 12_000,
      },
      {
        questionId: 'demo-scenario-sortie-imprevue',
        roundType: 'SCENARIO',
        userId: DEMO_VISITOR_ID,
        kind: 'OWN',
        selectedOptionId: 'a',
        isSkipped: false,
        effectiveElapsedMs: 30_000,
        optionWeight: 9,
      },
      {
        questionId: 'demo-scenario-sortie-imprevue',
        roundType: 'SCENARIO',
        userId: DEMO_CHARACTER_ID,
        kind: 'OWN',
        selectedOptionId: 'b',
        isSkipped: false,
        effectiveElapsedMs: 21_000,
        optionWeight: 8,
      },
      {
        questionId: 'demo-face-energie',
        roundType: 'FACEAFACE',
        userId: DEMO_VISITOR_ID,
        kind: 'OWN',
        selectedOptionId: 'd',
        isSkipped: false,
        effectiveElapsedMs: 10_000,
      },
      {
        questionId: 'demo-face-energie',
        roundType: 'FACEAFACE',
        userId: DEMO_CHARACTER_ID,
        kind: 'OWN',
        selectedOptionId: 'd',
        isSkipped: false,
        effectiveElapsedMs: 19_000,
      },
    ];

    const expected = computeGameResult({
      creatorId: DEMO_VISITOR_ID,
      partnerId: DEMO_CHARACTER_ID,
      cumulativeCoupleScoreBeforeThisGame: 0,
      answers: handBuilt,
    });
    const actual = computeDemoResult(answers);

    // `conversationPrompts` is randomly drawn per call by design — compare
    // everything else exactly, and the prompts by shape.
    const { conversationPrompts: expectedPrompts, ...expectedRest } = expected;
    const { conversationPrompts: actualPrompts, ...actualRest } = actual;
    expect(actualRest).toEqual(expectedRest);
    expect(actualPrompts.length).toBe(expectedPrompts.length);
  });
});

describe('toDemoResultsResponse', () => {
  it('carries the three numeric fields when the gap is not masked', () => {
    const computation = computeDemoResult([
      {
        questionId: 'demo-face-weekend',
        ownOptionId: 'a',
        predictionOptionId: null,
        isSkipped: false,
        elapsedMs: 45_000,
      },
    ]);
    expect(computation.gapMasked).toBe(false);

    const response = toDemoResultsResponse(computation);
    expect('maskedMessage' in response).toBe(false);
    expect('creatorTotalScore' in response).toBe(true);
    expect('partnerTotalScore' in response).toBe(true);
    expect('gapPercent' in response).toBe(true);
  });

  it('OMITS the numeric fields entirely when the gap is masked', () => {
    // The visitor answers the lowest-weight SCENARIO option on all three
    // questions while the character answered high-weight ones — a gap wide
    // enough to trip GAP_MASK_THRESHOLD_PERCENT.
    const answers: DemoVisitorAnswer[] = demoQuestionsForRound(2).map((q) => ({
      questionId: q.id,
      ownOptionId: 'd',
      predictionOptionId: null,
      isSkipped: false,
      elapsedMs: 45_000,
    }));

    const computation = computeDemoResult(answers);
    expect(computation.gapMasked).toBe(true);

    const response = toDemoResultsResponse(computation);
    // Key presence, never truthiness — the rule `isMaskedResults` narrows on.
    expect('creatorTotalScore' in response).toBe(false);
    expect('partnerTotalScore' in response).toBe(false);
    expect('gapPercent' in response).toBe(false);
    expect(response).toMatchObject({ maskedMessage: DEMO_GAP_MASKED_MESSAGE });

    const sections = buildResultsSections(response, demoColumnLabels());
    expect(sections[2]).toEqual({
      kind: 'individualScores',
      masked: true,
      message: DEMO_GAP_MASKED_MESSAGE,
    });
  });
});

describe('demoColumnLabels / buildDemoRevealRows', () => {
  it('labels the visitor’s column "Toi" and the other with the demo character', () => {
    expect(demoColumnLabels()).toEqual({ creatorLabel: 'Toi', partnerLabel: DEMO_CHARACTER_NAME });
  });

  it('builds MIROIR reveal rows with both predictions and diagonal verdicts', () => {
    const state = playRound(startDemo(), () => 'match');
    const rows = buildDemoRevealRows(1, state.answers);

    expect(rows.length).toBe(3);
    const first = rows[0];
    if (first === undefined) throw new Error('no reveal row');
    expect(first.prompt).toBe('Au réveil, on est plutôt…');
    // The visitor guessed the character's actual answer on every question.
    expect(first.mirror?.creatorGuessedRight).toBe(true);
    // The character's scripted guess ('c') vs. the visitor's own answer
    // ('b', since "match" makes the visitor mirror the character) — wrong.
    expect(first.mirror?.partnerGuessedRight).toBe(false);
  });

  it('builds SCENARIO / FACEAFACE rows with no mirror section at all', () => {
    let state = advanceDemoRound(playRound(startDemo(), () => 'match'));
    state = playRound(state, () => 'match');
    const rows = buildDemoRevealRows(2, state.answers);

    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.mirror === null)).toBe(true);
  });

  it('renders a skipped answer as explicit text, never a blank', () => {
    const state = playRound(startDemo(), (_q, index) => (index === 0 ? 'skip' : 'match'));
    const rows = buildDemoRevealRows(1, state.answers);
    const first = rows[0];
    if (first === undefined) throw new Error('no reveal row');
    expect(first.creatorAnswer).toEqual({ text: 'Passé', isSkipped: true });
    expect(first.mirror?.creatorGuessedRight).toBe(false);
  });
});

describe('no network call', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('drives a complete demo with fetch stubbed to throw', () => {
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error('the demo must never make a network call');
    }) as typeof globalThis.fetch;

    let state = startDemo();
    for (let round = 1; round <= 3; round += 1) {
      state = playRound(state, () => 'match');
      state = advanceDemoRound(state);
    }

    const sections = buildResultsSections(
      toDemoResultsResponse(computeDemoResult(state.answers)),
      demoColumnLabels(),
    );
    const revealRows = [1, 2, 3].flatMap((r) => buildDemoRevealRows(r, state.answers));

    expect(demoScreenForPhase(state.session.phase)).toBe('results');
    expect(sections.length).toBe(5);
    expect(revealRows.length).toBe(DEMO_QUESTIONS.length);
    expect(fetchCalls).toBe(0);
  });

  it('neither demo file talks to the network', () => {
    // Secondary to the stub above, which covers the pure flow. This one
    // covers the two files a node-only test environment cannot mount.
    //
    // This list USED to include `useUser`, because the demo was public and
    // a session gate would have bounced every anonymous visitor away from
    // the page. The product rule reversed that — the trial is what an
    // account buys — so the gate moved from forbidden to required, and the
    // assertion moved with it (next test). The network half is unchanged
    // and still load-bearing: the demo must cost nothing and record
    // nothing, which is precisely why it can be replayed freely while a
    // real game cannot.
    for (const relative of [
      ['..', '..', 'components', 'demo', 'DemoGame.tsx'],
      ['..', '..', 'app', 'demo', 'page.tsx'],
    ]) {
      const source = readFileSync(path.join(demoSrcDir(), ...relative), 'utf8');
      const code = stripComments(source);
      expect(code, relative.join('/')).not.toMatch(/\bfetch\s*\(/);
      expect(code, relative.join('/')).not.toMatch(/from '@\/lib\/api'/);
      expect(code, relative.join('/')).not.toMatch(/\bXMLHttpRequest\b/);
      expect(code, relative.join('/')).not.toMatch(/sendBeacon/);
      expect(code, relative.join('/')).not.toMatch(/\bEventSource\b/);
      expect(code, relative.join('/')).not.toMatch(/\bnew WebSocket\b/);
    }
  });

  it('gates the demo on a signed-in account', () => {
    // The regression this replaces the old rule with. Free play is capped
    // by requiring an account: a demo that renders for anonymous visitors
    // is unlimited free play again, and nothing else in the suite would
    // notice — the page would simply work.
    const code = stripComments(
      readFileSync(
        path.join(demoSrcDir(), '..', '..', 'components', 'demo', 'DemoGame.tsx'),
        'utf8',
      ),
    );
    expect(code).toMatch(/\buseUser\s*\(/);
    // And the bail-out that goes with it: `useUser` only starts a redirect,
    // it does not stop the render. Without this line the whole demo paints
    // for a split second before the browser leaves.
    expect(code).toMatch(/if\s*\(!user\)\s*return null;/);
  });

  // The invariant this whole task rests on: /demo imports the PRODUCTION
  // engine into a browser bundle. Until now that was guaranteed only by a
  // header comment — and nothing in the local toolchain would have caught a
  // regression. `vitest.config.ts` aliases `server-only` to an empty stub
  // and runs `environment: 'node'`, so adding `import 'server-only'` (as
  // the sibling modules `question-selection.ts` and `session-helpers.ts`
  // both legitimately do) or any `node:` import leaves test, lint AND
  // typecheck green. Only a full `next build` would fail — and this repo's
  // build aborts earlier, on the documented pre-existing TypeScript
  // baseline, so in practice nothing would have failed at all.
  it('the engine modules the demo pulls into the browser stay isomorphic', () => {
    for (const file of ['scoring.ts', 'state-machine.ts']) {
      const source = readFileSync(path.join(demoSrcDir(), '..', 'server', 'game', file), 'utf8');
      const code = stripComments(source);
      expect(code, file).not.toMatch(/from 'server-only'/);
      expect(code, file).not.toMatch(/import 'server-only'/);
      expect(code, file).not.toMatch(/from 'node:[a-z]+'/);
      expect(code, file).not.toMatch(/require\(['"]node:/);
      expect(code, file).not.toMatch(/from '@prisma\/client'/);
    }
  });
});

/** Directory of this test file, for reading sources off disk. */
function demoSrcDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Strips comments before pattern-matching. Without this, a doc comment
 * merely *mentioning* `node:crypto` or `useUser` — which several of these
 * files legitimately do, to explain why they avoid it — would fail the
 * assertions above and push the next author toward deleting the
 * explanation rather than keeping it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
