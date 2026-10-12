import type { QuestionSeed } from '@/lib/server/game/question-seed-schema';

// Thème « Mode Piment · 18+ » — 10 questions par manche.
//
// Réservé aux adultes, et écrit comme tel : il parle de désir, d'envies et
// de ce qui ne se dit pas facilement, sans jamais être explicite. Le jeu
// se joue sur un seul appareil, souvent dans un salon — une question qu'on
// ne peut pas lire à voix haute n'a pas sa place ici.
export const MODE_PIMENT: QuestionSeed[] = [
  // ── MIROIR ────────────────────────────────────────────────────────
  {
    slug: 'pi-m01-initiative',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Qui prend l’initiative le plus souvent, selon ton/ta partenaire ?',
    options: [
      { id: 'a', text: 'Lui/elle' },
      { id: 'b', text: 'Toi' },
      { id: 'c', text: 'À parts égales' },
      { id: 'd', text: 'Personne, ça vient tout seul' },
    ],
  },
  {
    slug: 'pi-m02-moment-prefere',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Le moment que ton/ta partenaire préfère :',
    options: [
      { id: 'a', text: 'Le matin' },
      { id: 'b', text: 'En fin de journée' },
      { id: 'c', text: 'Tard le soir' },
      { id: 'd', text: 'Quand c’est imprévu' },
    ],
  },
  {
    slug: 'pi-m03-ce-qui-seduit',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Ce qui séduit le plus ton/ta partenaire chez toi :',
    options: [
      { id: 'a', text: 'Ton regard' },
      { id: 'b', text: 'Ta voix' },
      { id: 'c', text: 'Ton assurance' },
      { id: 'd', text: 'Ton humour' },
    ],
  },
  {
    slug: 'pi-m04-parler-de-desir',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Parler de désir avec toi, pour ton/ta partenaire :',
    options: [
      { id: 'a', text: 'C’est facile' },
      { id: 'b', text: 'C’est gênant mais il/elle le fait' },
      { id: 'c', text: 'Il/elle préfère montrer que dire' },
      { id: 'd', text: 'Il/elle ne l’a jamais vraiment fait' },
    ],
  },
  {
    slug: 'pi-m05-envie-non-dite',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire a-t-il/elle une envie qu’il/elle n’a jamais formulée ?',
    options: [
      { id: 'a', text: 'Oui, et tu la devines' },
      { id: 'b', text: 'Oui, et tu n’en as aucune idée' },
      { id: 'c', text: 'Non, il/elle dit tout' },
      { id: 'd', text: 'Il/elle n’y pense pas en ces termes' },
    ],
  },
  {
    slug: 'pi-m06-signal-envie',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Comment ton/ta partenaire fait-il/elle comprendre qu’il/elle a envie ?',
    options: [
      { id: 'a', text: 'Il/elle le dit' },
      { id: 'b', text: 'Un geste, un regard' },
      { id: 'c', text: 'Il/elle devient plus attentionné(e)' },
      { id: 'd', text: 'Il/elle attend que tu proposes' },
    ],
  },
  {
    slug: 'pi-m07-refuser-sans-blesser',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Quand ton/ta partenaire n’a pas envie, il/elle :',
    options: [
      { id: 'a', text: 'Le dit simplement' },
      { id: 'b', text: 'Trouve une excuse' },
      { id: 'c', text: 'Accepte quand même' },
      { id: 'd', text: 'Propose autre chose' },
    ],
  },
  {
    slug: 'pi-m08-compliment-intime',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Le compliment qui fait le plus d’effet à ton/ta partenaire :',
    options: [
      { id: 'a', text: 'Sur son physique' },
      { id: 'b', text: 'Sur son parfum ou sa tenue' },
      { id: 'c', text: 'Sur ce qu’il/elle te fait ressentir' },
      { id: 'd', text: 'Sur sa confiance en lui/elle' },
    ],
  },
  {
    slug: 'pi-m09-routine-ou-surprise',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire préfère :',
    options: [
      { id: 'a', text: 'Ce qu’il/elle connaît déjà' },
      { id: 'b', text: 'Être surpris(e)' },
      { id: 'c', text: 'Qu’on en parle avant' },
      { id: 'd', text: 'Que ça arrive sans y penser' },
    ],
  },
  {
    slug: 'pi-m10-apres',
    roundType: 'MIROIR',
    category: 'Mode Piment · 18+',
    prompt: 'Juste après, ton/ta partenaire aime :',
    options: [
      { id: 'a', text: 'Parler' },
      { id: 'b', text: 'Rester enlacé(e) en silence' },
      { id: 'c', text: 'Dormir' },
      { id: 'd', text: 'Rire' },
    ],
  },

  // ── SCENARIO ──────────────────────────────────────────────────────
  {
    slug: 'pi-s01-envie-differente',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Tu as envie, ton/ta partenaire non, et ça se répète. Tu…',
    options: [
      { id: 'a', text: 'J’en parle au calme, hors du moment', weight: 10 },
      { id: 'b', text: 'Je respecte et j’attends', weight: 8 },
      { id: 'c', text: 'J’insiste un peu', weight: 2 },
      { id: 'd', text: 'Je boude', weight: 1 },
    ],
  },
  {
    slug: 'pi-s02-envie-formulee',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire te confie une envie qui te surprend. Tu…',
    options: [
      { id: 'a', text: 'Je pose des questions avant de juger', weight: 10 },
      { id: 'b', text: 'Je dis que je vais y réfléchir', weight: 8 },
      { id: 'c', text: 'Je réagis mal puis je m’excuse', weight: 4 },
      { id: 'd', text: 'J’en ris pour cacher ma gêne', weight: 2 },
    ],
  },
  {
    slug: 'pi-s03-refus-mal-pris',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire prend mal un « pas ce soir ». Tu…',
    options: [
      { id: 'a', text: 'J’explique que ce n’est pas un rejet de lui/elle', weight: 10 },
      { id: 'b', text: 'Je propose un autre moment', weight: 9 },
      { id: 'c', text: 'Je cède pour éviter la dispute', weight: 2 },
      { id: 'd', text: 'Je me referme', weight: 3 },
    ],
  },
  {
    slug: 'pi-s04-routine-installee',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'La routine s’est installée et ça vous pèse à tous les deux. Tu…',
    options: [
      { id: 'a', text: 'J’ouvre le sujet franchement', weight: 10 },
      { id: 'b', text: 'Je propose quelque chose de nouveau', weight: 9 },
      { id: 'c', text: 'J’attends que ça revienne tout seul', weight: 3 },
      { id: 'd', text: 'Je pense que c’est normal après des années', weight: 4 },
    ],
  },
  {
    slug: 'pi-s05-comparaison-blessante',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire fait une comparaison avec quelqu’un d’avant. Tu…',
    options: [
      { id: 'a', text: 'Je dis que ça m’a blessé(e)', weight: 10 },
      { id: 'b', text: 'Je demande ce qu’il/elle voulait dire', weight: 9 },
      { id: 'c', text: 'Je fais semblant que ce n’est rien', weight: 3 },
      { id: 'd', text: 'Je rends la pareille', weight: 1 },
    ],
  },
  {
    slug: 'pi-s06-fatigue-et-couple',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Vous êtes tous les deux épuisés depuis des semaines. Tu…',
    options: [
      { id: 'a', text: 'Je propose qu’on se réserve du temps, pour de vrai', weight: 10 },
      { id: 'b', text: 'Je le dis mais je n’y peux rien', weight: 6 },
      { id: 'c', text: 'Je fais comme si de rien n’était', weight: 3 },
      { id: 'd', text: 'Je le reproche à l’autre', weight: 1 },
    ],
  },
  {
    slug: 'pi-s07-complexe-avoue',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire t’avoue un complexe sur son corps. Tu…',
    options: [
      { id: 'a', text: 'Je l’écoute et je lui dis ce que je vois, moi', weight: 10 },
      { id: 'b', text: 'Je le rassure tout de suite', weight: 8 },
      { id: 'c', text: 'Je minimise, « ce n’est rien »', weight: 4 },
      { id: 'd', text: 'Je ne sais pas quoi dire et je change de sujet', weight: 2 },
    ],
  },
  {
    slug: 'pi-s08-limite-posee',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Ton/ta partenaire propose quelque chose qui te met vraiment mal à l’aise. Tu…',
    options: [
      { id: 'a', text: 'Je dis non clairement, et pourquoi', weight: 10 },
      { id: 'b', text: 'Je dis non sans expliquer', weight: 8 },
      { id: 'c', text: 'J’accepte pour lui/elle faire plaisir', weight: 1 },
      { id: 'd', text: 'Je repousse à plus tard, indéfiniment', weight: 4 },
    ],
  },
  {
    slug: 'pi-s09-decouverte-genante',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Tu découvres un contenu privé sur le téléphone de ton/ta partenaire. Tu…',
    options: [
      { id: 'a', text: 'J’en parle sans accuser, en disant comment je l’ai vu', weight: 9 },
      { id: 'b', text: 'Je demande simplement ce que c’est', weight: 8 },
      { id: 'c', text: 'Je fais des allusions sans dire que j’ai vu', weight: 2 },
      { id: 'd', text: 'Je continue à fouiller', weight: 0 },
    ],
  },
  {
    slug: 'pi-s10-anniversaire-intime',
    roundType: 'SCENARIO',
    category: 'Mode Piment · 18+',
    prompt: 'Tu veux organiser une surprise très intime pour votre anniversaire. Tu…',
    options: [
      { id: 'a', text: 'Je m’assure d’abord que ça lui ferait plaisir', weight: 10 },
      { id: 'b', text: 'Je me fie à ce que je sais de lui/elle', weight: 8 },
      { id: 'c', text: 'Je fais ce dont j’ai envie, moi', weight: 3 },
      { id: 'd', text: 'Je renonce, j’ai peur de me tromper', weight: 5 },
    ],
  },

  // ── FACEAFACE ─────────────────────────────────────────────────────
  {
    slug: 'pi-f01-parler-du-desir',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Parler de désir dans un couple :',
    options: [
      { id: 'a', text: 'Devrait être aussi simple que parler d’autre chose' },
      { id: 'b', text: 'Se fait avec des mots choisis' },
      { id: 'c', text: 'Casse un peu la magie' },
      { id: 'd', text: 'Vient avec le temps' },
    ],
  },
  {
    slug: 'pi-f02-frequence',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Dans un couple, la fréquence :',
    options: [
      { id: 'a', text: 'Ne veut rien dire' },
      { id: 'b', text: 'Dit l’état du couple' },
      { id: 'c', text: 'Baisse forcément avec le temps' },
      { id: 'd', text: 'Se discute comme le reste' },
    ],
  },
  {
    slug: 'pi-f03-dire-non',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Dire non à son/sa partenaire :',
    options: [
      { id: 'a', text: 'Doit toujours être possible' },
      { id: 'b', text: 'Demande une explication' },
      { id: 'c', text: 'Blesse forcément un peu' },
      { id: 'd', text: 'Ne devrait pas arriver souvent' },
    ],
  },
  {
    slug: 'pi-f04-initiative-partagee',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'L’initiative :',
    options: [
      { id: 'a', text: 'Doit venir des deux' },
      { id: 'b', text: 'Vient naturellement de l’un des deux' },
      { id: 'c', text: 'N’a pas à être comptée' },
      { id: 'd', text: 'Est un sujet qu’on n’aborde jamais' },
    ],
  },
  {
    slug: 'pi-f05-nouveaute',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Essayer de nouvelles choses :',
    options: [
      { id: 'a', text: 'Entretient le couple' },
      { id: 'b', text: 'Se fait si les deux le veulent vraiment' },
      { id: 'c', text: 'N’est pas nécessaire' },
      { id: 'd', text: 'Demande beaucoup de confiance' },
    ],
  },
  {
    slug: 'pi-f06-complicite-avant-tout',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Ce qui compte le plus dans l’intimité :',
    options: [
      { id: 'a', text: 'La complicité' },
      { id: 'b', text: 'L’attirance' },
      { id: 'c', text: 'La tendresse' },
      { id: 'd', text: 'La confiance' },
    ],
  },
  {
    slug: 'pi-f07-jardin-secret-intime',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Les fantasmes :',
    options: [
      { id: 'a', text: 'Se racontent' },
      { id: 'b', text: 'Se racontent en partie' },
      { id: 'c', text: 'Restent personnels' },
      { id: 'd', text: 'Ne regardent que celui qui les a' },
    ],
  },
  {
    slug: 'pi-f08-apres-une-dispute',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Se réconcilier au lit :',
    options: [
      { id: 'a', text: 'Ne règle rien' },
      { id: 'b', text: 'Aide à passer à autre chose' },
      { id: 'c', text: 'Vient après la discussion, jamais avant' },
      { id: 'd', text: 'Dépend de la dispute' },
    ],
  },
  {
    slug: 'pi-f09-corps-et-confiance',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Un complexe physique :',
    options: [
      { id: 'a', text: 'Se dit à son/sa partenaire' },
      { id: 'b', text: 'Se travaille seul(e)' },
      { id: 'c', text: 'Disparaît quand on se sent aimé(e)' },
      { id: 'd', text: 'Ne devrait jamais être un sujet de couple' },
    ],
  },
  {
    slug: 'pi-f10-temps-pour-deux',
    roundType: 'FACEAFACE',
    category: 'Mode Piment · 18+',
    prompt: 'Quand le désir baisse :',
    options: [
      { id: 'a', text: 'Il faut en parler tout de suite' },
      { id: 'b', text: 'Il faut se réserver du temps' },
      { id: 'c', text: 'C’est une phase, ça revient' },
      { id: 'd', text: 'C’est le signe d’un problème plus large' },
    ],
  },
];
