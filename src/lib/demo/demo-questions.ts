// Demo-only question bank for `/demo` (Lot 2, Task 24) — the playable taste
// of the game a visitor gets with no account and no Espace Couple.
//
// WHO PLAYS THE DEMO (project-owner decision): "solo, sans compte ni
// couple". A lone visitor plays a trial game on one phone. They answer
// their own side; the other side is a clearly-labelled DEMO CHARACTER whose
// answers are scripted right here, next to the questions they belong to.
//
// That scripting is the point, not a shortcut. `computeGameResult` needs
// two players' answers to produce a couple score, and the honest way to
// supply the second side without an account is to write it down in the
// open — the visitor can see, on the reveal screen, exactly what the demo
// character "answered". The alternative (inventing a partner behind the
// visitor's back, or faking a score) would present fabricated data as real.
// Every screen names `DEMO_CHARACTER_NAME` as a demo partner, never a
// person.
//
// The content below is FRESH: no slug and no prompt is shared with
// `prisma/seed-data/questions.ts`. The real 27-question bank is paid,
// authenticated content and must not leak pre-auth, and nobody reading
// `/demo` should be able to mistake these for it. The prompts are also
// deliberately light — this is a shop window, not the real emotional
// payload.

/** The three round types, mirroring `lib/game/round-labels.ts`'s `RoundType`. */
export type DemoRoundType = 'MIROIR' | 'SCENARIO' | 'FACEAFACE';

/** Option shape for MIROIR / FACEAFACE — same `{id,text}` Lot 1 uses. */
export interface DemoOption {
  id: string;
  text: string;
}

/**
 * Option shape for SCENARIO — same `{id,text,weight}` Lot 1 uses. `weight`
 * feeds `computeFidelityScore`; it is NEVER rendered (same product rule as
 * the real reveal screen: no score, no points, no raw weight on screen).
 */
export interface DemoWeightedOption extends DemoOption {
  weight: number;
}

/**
 * The demo character's scripted answer for a MIROIR question: what they
 * "answered" for themselves, plus their guess about the visitor. The guess
 * is fixed at authoring time — the character cannot react to a visitor they
 * have never met, and pretending otherwise is exactly the dishonesty this
 * module avoids.
 */
export interface DemoMirrorCharacterAnswer {
  ownOptionId: string;
  predictionOptionId: string;
  elapsedMs: number;
}

/** The demo character's scripted answer for a SCENARIO / FACEAFACE question. */
export interface DemoSingleCharacterAnswer {
  ownOptionId: string;
  elapsedMs: number;
}

export interface DemoMirrorQuestion {
  id: string;
  roundType: 'MIROIR';
  prompt: string;
  options: readonly DemoOption[];
  character: DemoMirrorCharacterAnswer;
}

export interface DemoScenarioQuestion {
  id: string;
  roundType: 'SCENARIO';
  prompt: string;
  options: readonly DemoWeightedOption[];
  character: DemoSingleCharacterAnswer;
}

export interface DemoFaceAFaceQuestion {
  id: string;
  roundType: 'FACEAFACE';
  prompt: string;
  options: readonly DemoOption[];
  character: DemoSingleCharacterAnswer;
}

export type DemoQuestion = DemoMirrorQuestion | DemoScenarioQuestion | DemoFaceAFaceQuestion;

/**
 * The demo partner's first name. Neutral on purpose, and always rendered
 * next to `DEMO_CHARACTER_ROLE_LABEL` so a visitor is never left thinking
 * someone real is on the other side.
 */
export const DEMO_CHARACTER_NAME = 'Naya';

/** Always shown with the name. Short enough to sit under a column header. */
export const DEMO_CHARACTER_ROLE_LABEL = 'partenaire de démo';

/**
 * One line the visitor reads before answering anything, and again on the
 * results screen. Says the quiet part out loud.
 */
export const DEMO_CHARACTER_DISCLOSURE = `${DEMO_CHARACTER_NAME} est un personnage de démonstration : ses réponses sont écrites à l’avance, ce n’est pas une vraie personne.`;

/** Questions per round in the demo — three, against the real game's five. */
export const DEMO_QUESTIONS_PER_ROUND = 3;

/**
 * The nine demo questions, grouped by round in play order (3 MIROIR, then 3
 * SCENARIO, then 3 FACEAFACE — the same fixed round order the real game
 * builds at creation time).
 *
 * MIROIR prompts are phrased neutrally ("on est plutôt…") rather than about
 * the partner, because in MIROIR the visitor answers the SAME prompt twice:
 * once for themselves, once as a guess about the demo character.
 */
export const DEMO_QUESTIONS: readonly DemoQuestion[] = [
  // ── Manche 1 · Miroir ────────────────────────────────────────────────
  {
    id: 'demo-mirror-matin',
    roundType: 'MIROIR',
    prompt: 'Au réveil, on est plutôt…',
    options: [
      { id: 'a', text: 'Debout tout de suite' },
      { id: 'b', text: 'Encore cinq minutes' },
      { id: 'c', text: 'Café avant toute chose' },
      { id: 'd', text: 'Téléphone en premier' },
    ],
    character: { ownOptionId: 'b', predictionOptionId: 'c', elapsedMs: 12_000 },
  },
  {
    id: 'demo-mirror-vacances',
    roundType: 'MIROIR',
    prompt: 'Les vacances idéales, ce serait…',
    options: [
      { id: 'a', text: 'La plage, sans programme' },
      { id: 'b', text: 'Une ville à explorer' },
      { id: 'c', text: 'La montagne, au calme' },
      { id: 'd', text: 'Un tour chez la famille' },
    ],
    character: { ownOptionId: 'a', predictionOptionId: 'b', elapsedMs: 16_500 },
  },
  {
    id: 'demo-mirror-soiree',
    roundType: 'MIROIR',
    prompt: 'Une soirée à deux réussie, c’est…',
    options: [
      { id: 'a', text: 'Un film sous la couette' },
      { id: 'b', text: 'Un restaurant inconnu' },
      { id: 'c', text: 'Cuisiner ensemble' },
      { id: 'd', text: 'Sortir avec des amis' },
    ],
    character: { ownOptionId: 'c', predictionOptionId: 'a', elapsedMs: 9_000 },
  },

  // ── Manche 2 · Scénarios ─────────────────────────────────────────────
  {
    id: 'demo-scenario-message-tard',
    roundType: 'SCENARIO',
    prompt: 'Il est 23h. Un vieux contact t’écrit pour prendre des nouvelles.',
    options: [
      { id: 'a', text: 'J’en parle tout de suite, en riant', weight: 9 },
      { id: 'b', text: 'Je réponds, j’en parle si ça revient', weight: 6 },
      { id: 'c', text: 'Je réponds plus tard, sans en parler', weight: 4 },
      { id: 'd', text: 'Je laisse le message sans réponse', weight: 7 },
    ],
    character: { ownOptionId: 'a', elapsedMs: 14_000 },
  },
  {
    id: 'demo-scenario-sortie-imprevue',
    roundType: 'SCENARIO',
    prompt: 'Une sortie de dernière minute tombe sur la soirée que vous aviez prévue à deux.',
    options: [
      { id: 'a', text: 'Je décline, c’était notre soirée', weight: 9 },
      { id: 'b', text: 'Je propose qu’on décide ensemble', weight: 8 },
      { id: 'c', text: 'J’y vais, je préviens avant', weight: 5 },
      { id: 'd', text: 'J’y vais, on se rattrapera demain', weight: 3 },
    ],
    character: { ownOptionId: 'b', elapsedMs: 21_000 },
  },
  {
    id: 'demo-scenario-photo-publiee',
    roundType: 'SCENARIO',
    prompt: 'Une photo de vous deux te plaît beaucoup. Tu la publies ?',
    options: [
      { id: 'a', text: 'Je demande son avis d’abord', weight: 9 },
      { id: 'b', text: 'Je la publie, ça lui plaira', weight: 6 },
      { id: 'c', text: 'Je la garde pour nous', weight: 8 },
      { id: 'd', text: 'Je la publie sans y penser', weight: 3 },
    ],
    character: { ownOptionId: 'c', elapsedMs: 11_500 },
  },

  // ── Manche 3 · Face à face ───────────────────────────────────────────
  {
    id: 'demo-face-weekend',
    roundType: 'FACEAFACE',
    prompt: 'Un week-end à deux : on part où ?',
    options: [
      { id: 'a', text: 'Au bord de la mer' },
      { id: 'b', text: 'Dans une grande ville' },
      { id: 'c', text: 'Nulle part, à la maison' },
      { id: 'd', text: 'Là où l’un des deux décide' },
    ],
    character: { ownOptionId: 'a', elapsedMs: 8_000 },
  },
  {
    id: 'demo-face-energie',
    roundType: 'FACEAFACE',
    prompt: 'Cette année, on met notre énergie sur…',
    options: [
      { id: 'a', text: 'Voyager plus souvent' },
      { id: 'b', text: 'Mettre de l’argent de côté' },
      { id: 'c', text: 'Passer du temps en famille' },
      { id: 'd', text: 'Un projet rien qu’à nous' },
    ],
    character: { ownOptionId: 'd', elapsedMs: 19_000 },
  },
  {
    id: 'demo-face-apres-dispute',
    roundType: 'FACEAFACE',
    prompt: 'Après une petite dispute, l’idéal c’est…',
    options: [
      { id: 'a', text: 'En parler tout de suite' },
      { id: 'b', text: 'Souffler, puis en parler' },
      { id: 'c', text: 'Passer à autre chose' },
      { id: 'd', text: 'Un geste plutôt qu’un discours' },
    ],
    character: { ownOptionId: 'b', elapsedMs: 13_500 },
  },
];
