import type { QuestionSeed } from '@/lib/server/game/question-seed-schema';
import { CONFIANCE_JALOUSIE } from './themes/confiance-jalousie';
import { RESEAUX_TELEPHONE } from './themes/reseaux-telephone';
import { EX_ET_PASSE } from './themes/ex-et-passe';
import { TENTATIONS_QUOTIDIEN } from './themes/tentations-quotidien';
import { FAMILLE_BELLE_FAMILLE } from './themes/famille-belle-famille';
import { ARGENT_TRANSPARENCE } from './themes/argent-transparence';
import { PROJETS_ENGAGEMENT } from './themes/projets-engagement';
import { MODE_PIMENT } from './themes/mode-piment';

// La banque de questions livrée.
//
// Elle est en deux morceaux, et ce n'est pas un accident d'organisation :
//
//   · les HUIT THÈMES de `lib/game/themes.ts`, un fichier par thème sous
//     `themes/`. Chacun couvre les trois manches avec dix questions
//     chacune — le maximum qu’une manche puisse tirer (Longue soirée :
//     10/10/10). C'est la condition pour qu'un thème choisi soit
//     réellement joué : en dessous, `narrowToCategories` élargit au pool
//     complet et la sélection de l'écran ne change rien, sans rien dire.
//     `lib/game/themes.test.ts` le vérifie thème par thème et manche par
//     manche.
//
//   · le FONDS GÉNÉRAL ci-dessous — les vingt-sept premières questions,
//     écrites avant que les thèmes existent. Leurs catégories (Quotidien,
//     Communication, Valeurs & couple…) ne figurent pas dans les huit :
//     elles ne sont donc jamais proposées à la sélection, mais elles
//     restent tirables par une partie SANS thème choisi, où le pool est
//     la banque entière. Les garder ajoute de la profondeur au tirage par
//     défaut ; les forcer dans un des huit thèmes aurait produit des
//     cartes qui mentent sur leur contenu.
//
// `scripts/seed-questions.ts` fait l'upsert par slug : ajouter une
// question ici et relancer `pnpm seed:questions` suffit.
const FONDS_GENERAL: QuestionSeed[] = [
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
    prompt:
      'Quel souvenir ton/ta partenaire garde-t-il/elle comme le plus marquant de votre relation ?',
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
    prompt: 'Un(e) ex te contacte pour prendre des nouvelles. Tu…',
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
    prompt:
      "Tu apprends qu'un(e) ami(e) commun(e) a menti pour couvrir une sortie de ton/ta partenaire. Tu…",
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
      { id: 'b', text: "Je le donne mais ça me met mal à l'aise", weight: 5 },
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
      { id: 'd', text: "Ça m'agace mais je ne dis rien", weight: 4 },
    ],
  },
  {
    slug: 'scenario-conversation-intime',
    roundType: 'SCENARIO',
    category: 'Réseaux sociaux & Téléphone',
    prompt: "Tu retrouves une ancienne conversation intime avec quelqu'un d'autre. Tu…",
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
    prompt: 'Ce qui aide le plus à décompresser après une journée difficile :',
    options: [
      { id: 'a', text: 'En parler ensemble' },
      { id: 'b', text: 'Un moment de silence' },
      { id: 'c', text: 'Une activité qui change les idées' },
      { id: 'd', text: 'Un câlin ou un contact physique' },
    ],
  },
];

export const QUESTIONS_SEED: QuestionSeed[] = [
  ...CONFIANCE_JALOUSIE,
  ...RESEAUX_TELEPHONE,
  ...EX_ET_PASSE,
  ...TENTATIONS_QUOTIDIEN,
  ...FAMILLE_BELLE_FAMILLE,
  ...ARGENT_TRANSPARENCE,
  ...PROJETS_ENGAGEMENT,
  ...MODE_PIMENT,
  ...FONDS_GENERAL,
];
