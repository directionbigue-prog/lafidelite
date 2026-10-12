import type { QuestionSeed } from '@/lib/server/game/question-seed-schema';

// Thème « Confiance & Jalousie » — 10 questions par manche.
//
// Le poids d'une option SCENARIO n'est PAS une note morale : il mesure à
// quel point la réaction préserve le lien (transparence, parole donnée).
// Il ne sort jamais vers un client — voir game/response-shaping.ts.
export const CONFIANCE_JALOUSIE: QuestionSeed[] = [
  // ── MIROIR ────────────────────────────────────────────────────────
  {
    slug: 'cj-m01-retard-inexplique',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt:
      'Ton/ta partenaire rentre deux heures plus tard que prévu sans prévenir. Sa première réaction en arrivant :',
    options: [
      { id: 'a', text: 'Il/elle explique avant même qu’on demande' },
      { id: 'b', text: 'Il/elle attend la question' },
      { id: 'c', text: 'Il/elle s’excuse longuement' },
      { id: 'd', text: 'Il/elle fait comme si de rien n’était' },
    ],
  },
  {
    slug: 'cj-m02-signe-jalousie',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'À quoi reconnaît-on que ton/ta partenaire est jaloux(se) ?',
    options: [
      { id: 'a', text: 'Il/elle devient silencieux(se)' },
      { id: 'b', text: 'Il/elle pose beaucoup de questions' },
      { id: 'c', text: 'Il/elle ironise' },
      { id: 'd', text: 'Il/elle se rapproche physiquement' },
    ],
  },
  {
    slug: 'cj-m03-declencheur',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Ce qui déclenche le plus facilement la jalousie de ton/ta partenaire :',
    options: [
      { id: 'a', text: 'Un(e) ex qui réapparaît' },
      { id: 'b', text: 'Un(e) collègue trop proche' },
      { id: 'c', text: 'Un téléphone retourné sur la table' },
      { id: 'd', text: 'Une soirée sans lui/elle' },
    ],
  },
  {
    slug: 'cj-m04-secret-tolerable',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Selon toi, quel petit secret ton/ta partenaire trouve acceptable ?',
    options: [
      { id: 'a', text: 'Le prix réel d’un achat' },
      { id: 'b', text: 'Un compliment reçu' },
      { id: 'c', text: 'Une contrariété gardée pour soi' },
      { id: 'd', text: 'Aucun, même petit' },
    ],
  },
  {
    slug: 'cj-m05-preuve-confiance',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Ce qui rassure le plus ton/ta partenaire sur ta fidélité :',
    options: [
      { id: 'a', text: 'Que tu racontes tes journées' },
      { id: 'b', text: 'Que tu répondes vite' },
      { id: 'c', text: 'Que tu le/la présentes à tout le monde' },
      { id: 'd', text: 'Que tu ne caches jamais ton écran' },
    ],
  },
  {
    slug: 'cj-m06-reaction-doute',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Si ton/ta partenaire doutait de toi, que ferait-il/elle en premier ?',
    options: [
      { id: 'a', text: 'Te le dire franchement' },
      { id: 'b', text: 'Observer sans rien dire' },
      { id: 'c', text: 'En parler à un(e) proche' },
      { id: 'd', text: 'Chercher des preuves' },
    ],
  },
  {
    slug: 'cj-m07-sortie-solo',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Quand tu sors sans lui/elle, ton/ta partenaire préfère :',
    options: [
      { id: 'a', text: 'Savoir avec qui, à l’avance' },
      { id: 'b', text: 'Un message en arrivant' },
      { id: 'c', text: 'Ne rien savoir, c’est ta soirée' },
      { id: 'd', text: 'Être invité(e), même s’il/elle refuse' },
    ],
  },
  {
    slug: 'cj-m08-limite-claire',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'La limite que ton/ta partenaire considère comme infranchissable :',
    options: [
      { id: 'a', text: 'Un message ambigu' },
      { id: 'b', text: 'Un dîner en tête-à-tête' },
      { id: 'c', text: 'Un contact physique' },
      { id: 'd', text: 'Un mensonge, quel qu’il soit' },
    ],
  },
  {
    slug: 'cj-m09-confiance-passee',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Ton/ta partenaire pense qu’une confiance trahie :',
    options: [
      { id: 'a', text: 'Se reconstruit avec le temps' },
      { id: 'b', text: 'Ne revient jamais tout à fait' },
      { id: 'c', text: 'Dépend entièrement de la faute' },
      { id: 'd', text: 'Se répare en en parlant beaucoup' },
    ],
  },
  {
    slug: 'cj-m10-jalousie-flatteuse',
    roundType: 'MIROIR',
    category: 'Confiance & Jalousie',
    prompt: 'Pour ton/ta partenaire, un peu de jalousie de ta part, c’est :',
    options: [
      { id: 'a', text: 'Flatteur' },
      { id: 'b', text: 'Rassurant' },
      { id: 'c', text: 'Pesant' },
      { id: 'd', text: 'Inquiétant' },
    ],
  },

  // ── SCENARIO ──────────────────────────────────────────────────────
  {
    slug: 'cj-s01-ex-au-restaurant',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Tu croises ton ex au restaurant, avec ton/ta partenaire à table. Tu…',
    options: [
      { id: 'a', text: 'Je salue brièvement et je présente mon/ma partenaire', weight: 9 },
      { id: 'b', text: 'Je fais un signe de loin, sans plus', weight: 7 },
      { id: 'c', text: 'Je fais semblant de ne pas l’avoir vu(e)', weight: 4 },
      { id: 'd', text: 'Je vais discuter quelques minutes, seul(e)', weight: 2 },
    ],
  },
  {
    slug: 'cj-s02-notification-nuit',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Le téléphone de ton/ta partenaire s’allume à 2 h du matin, à côté de toi. Tu…',
    options: [
      { id: 'a', text: 'Je le laisse et j’en parle demain si ça me travaille', weight: 8 },
      { id: 'b', text: 'Je le réveille pour lui/elle demander', weight: 5 },
      { id: 'c', text: 'Je regarde l’écran sans y toucher', weight: 4 },
      { id: 'd', text: 'Je prends le téléphone et je lis', weight: 1 },
    ],
  },
  {
    slug: 'cj-s03-collegue-insistant',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Un(e) collègue t’invite à dîner seul(e) à seul(e), une deuxième fois. Tu…',
    options: [
      { id: 'a', text: 'Je refuse et j’en parle à mon/ma partenaire', weight: 10 },
      { id: 'b', text: 'Je refuse, sans en parler', weight: 6 },
      { id: 'c', text: 'J’accepte et je le dis après coup', weight: 3 },
      { id: 'd', text: 'J’accepte et je garde ça pour moi', weight: 0 },
    ],
  },
  {
    slug: 'cj-s04-doute-sans-preuve',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Tu as un mauvais pressentiment, sans la moindre preuve. Tu…',
    options: [
      { id: 'a', text: 'Je le dis tel quel, comme un ressenti', weight: 9 },
      { id: 'b', text: 'J’attends d’en savoir plus', weight: 6 },
      { id: 'c', text: 'Je surveille discrètement', weight: 2 },
      { id: 'd', text: 'Je prends mes distances sans expliquer', weight: 3 },
    ],
  },
  {
    slug: 'cj-s05-ami-prevenant',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Un(e) ami(e) te dit avoir vu ton/ta partenaire « très proche » de quelqu’un. Tu…',
    options: [
      { id: 'a', text: 'Je demande à mon/ma partenaire sa version', weight: 9 },
      { id: 'b', text: 'Je demande des détails à l’ami(e) d’abord', weight: 5 },
      { id: 'c', text: 'Je n’en parle à personne et j’observe', weight: 3 },
      { id: 'd', text: 'J’accuse directement', weight: 2 },
    ],
  },
  {
    slug: 'cj-s06-jalousie-en-public',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Ton/ta partenaire te fait une scène de jalousie devant des amis. Tu…',
    options: [
      { id: 'a', text: 'Je propose qu’on en parle dehors, calmement', weight: 9 },
      { id: 'b', text: 'Je me justifie sur le moment', weight: 6 },
      { id: 'c', text: 'Je réponds sur le même ton', weight: 2 },
      { id: 'd', text: 'Je pars sans rien dire', weight: 3 },
    ],
  },
  {
    slug: 'cj-s07-mensonge-utile',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Dire la vérité ferait de la peine pour rien. Tu…',
    options: [
      { id: 'a', text: 'Je dis la vérité, en choisissant le moment', weight: 9 },
      { id: 'b', text: 'Je dis la vérité, tout de suite', weight: 7 },
      { id: 'c', text: 'Je réponds à côté sans mentir vraiment', weight: 4 },
      { id: 'd', text: 'Je mens, c’est plus simple pour tout le monde', weight: 1 },
    ],
  },
  {
    slug: 'cj-s08-photo-ancienne',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Ton/ta partenaire trouve une photo de ton ex encore dans ton téléphone. Tu…',
    options: [
      {
        id: 'a',
        text: 'Je la supprime devant lui/elle et j’explique pourquoi elle y était',
        weight: 9,
      },
      { id: 'b', text: 'J’explique, et je la garde si ça ne le/la dérange pas', weight: 7 },
      { id: 'c', text: 'Je trouve la réaction exagérée et je le dis', weight: 3 },
      { id: 'd', text: 'Je supprime en vitesse sans commentaire', weight: 4 },
    ],
  },
  {
    slug: 'cj-s09-verification-compte',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt: 'Tu découvres que ton/ta partenaire a lu tes messages en cachette. Tu…',
    options: [
      { id: 'a', text: 'Je demande ce qui l’a inquiété(e) à ce point', weight: 9 },
      { id: 'b', text: 'Je le prends mal mais j’en parle', weight: 7 },
      { id: 'c', text: 'Je change mon code sans rien dire', weight: 3 },
      { id: 'd', text: 'Je fais pareil de mon côté', weight: 1 },
    ],
  },
  {
    slug: 'cj-s10-pardon-apres-faute',
    roundType: 'SCENARIO',
    category: 'Confiance & Jalousie',
    prompt:
      'Ton/ta partenaire t’avoue spontanément une faute que tu n’aurais jamais découverte. Tu…',
    options: [
      { id: 'a', text: 'Je retiens l’aveu autant que la faute, et j’en parle', weight: 9 },
      { id: 'b', text: 'Je demande du temps avant de répondre', weight: 8 },
      { id: 'c', text: 'Je pardonne tout de suite pour passer à autre chose', weight: 5 },
      { id: 'd', text: 'Je le/la punis par mon silence', weight: 1 },
    ],
  },

  // ── FACEAFACE ─────────────────────────────────────────────────────
  {
    slug: 'cj-f01-fondement-confiance',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Ce qui fonde la confiance dans un couple :',
    options: [
      { id: 'a', text: 'La transparence totale' },
      { id: 'b', text: 'La régularité des actes' },
      { id: 'c', text: 'La parole tenue' },
      { id: 'd', text: 'Le fait de ne jamais se sentir surveillé(e)' },
    ],
  },
  {
    slug: 'cj-f02-jalousie-normale',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Un peu de jalousie dans un couple, c’est :',
    options: [
      { id: 'a', text: 'Normal et même sain' },
      { id: 'b', text: 'Normal mais à contenir' },
      { id: 'c', text: 'Le début d’un problème' },
      { id: 'd', text: 'Un signe qu’on tient à l’autre' },
    ],
  },
  {
    slug: 'cj-f03-pire-trahison',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'La pire trahison :',
    options: [
      { id: 'a', text: 'Le mensonge répété' },
      { id: 'b', text: 'L’infidélité physique' },
      { id: 'c', text: 'L’attachement à quelqu’un d’autre' },
      { id: 'd', text: 'Parler du couple à l’extérieur' },
    ],
  },
  {
    slug: 'cj-f04-amitie-mixte',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Une amitié proche avec une personne qui pourrait plaire :',
    options: [
      { id: 'a', text: 'Ne pose aucun problème' },
      { id: 'b', text: 'Se gère en en parlant' },
      { id: 'c', text: 'Demande des limites claires' },
      { id: 'd', text: 'Vaut mieux être évitée' },
    ],
  },
  {
    slug: 'cj-f05-tout-se-dit',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Dans un couple, tout doit se dire :',
    options: [
      { id: 'a', text: 'Oui, absolument tout' },
      { id: 'b', text: 'Tout ce qui concerne le couple' },
      { id: 'c', text: 'Tout sauf ce qui blesserait pour rien' },
      { id: 'd', text: 'Chacun garde son jardin' },
    ],
  },
  {
    slug: 'cj-f06-apres-une-faute',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Après une trahison, ce qui compte le plus :',
    options: [
      { id: 'a', text: 'Comprendre pourquoi' },
      { id: 'b', text: 'Voir des actes, pas des mots' },
      { id: 'c', text: 'Du temps, beaucoup' },
      { id: 'd', text: 'Ne plus jamais en reparler' },
    ],
  },
  {
    slug: 'cj-f07-surveillance',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Vérifier le téléphone de l’autre :',
    options: [
      { id: 'a', text: 'Ne se fait jamais' },
      { id: 'b', text: 'Se fait ensemble ou pas du tout' },
      { id: 'c', text: 'Se comprend quand il y a un doute' },
      { id: 'd', text: 'Est le signe que le couple va mal' },
    ],
  },
  {
    slug: 'cj-f08-doute-exprime',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Un doute, ça se dit :',
    options: [
      { id: 'a', text: 'Tout de suite, même mal formulé' },
      { id: 'b', text: 'Une fois posé et réfléchi' },
      { id: 'c', text: 'Seulement s’il y a du concret' },
      { id: 'd', text: 'Le moins possible' },
    ],
  },
  {
    slug: 'cj-f09-passe-de-lautre',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Le passé amoureux de l’autre :',
    options: [
      { id: 'a', text: 'Ne regarde que lui/elle' },
      { id: 'b', text: 'Se raconte une fois, puis on tourne la page' },
      { id: 'c', text: 'Se discute autant qu’on en a besoin' },
      { id: 'd', text: 'Vaut mieux ne pas être détaillé' },
    ],
  },
  {
    slug: 'cj-f10-rassurer-lautre',
    roundType: 'FACEAFACE',
    category: 'Confiance & Jalousie',
    prompt: 'Rassurer son/sa partenaire, c’est surtout :',
    options: [
      { id: 'a', text: 'Le/la mettre au courant avant qu’il/elle demande' },
      { id: 'b', text: 'Être joignable' },
      { id: 'c', text: 'Le/la montrer dans sa vie, publiquement' },
      { id: 'd', text: 'Répéter qu’on tient à lui/elle' },
    ],
  },
];
