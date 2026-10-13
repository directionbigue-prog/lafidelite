// Les décisions de l'écran /rituel, hors du composant.
//
// Ce dépôt n'a ni jsdom ni Testing Library : un composant ne peut pas être
// monté, donc toute décision laissée dans le JSX est une décision sans test.
// La page ne fait qu'appeler ces fonctions et afficher ce qu'elles rendent.

import type { EtatSerie } from './serie';
import type { Role, Revelation } from './question-du-jour';

export type EtapeQuestion =
  /** Les deux ont répondu : on dévoile. */
  | { kind: 'revele' }
  /** Personne n'est désigné : qui tient le téléphone ? */
  | { kind: 'choisir-qui'; restants: Role[] }
  | { kind: 'repondre'; role: Role }
  /** Ce rôle a répondu ; on attend l'autre. */
  | { kind: 'attente'; manquant: Role };

/**
 * Où en est la question du jour pour cet écran.
 *
 * `roleChoisi` est le partenaire qui a dit « c'est moi » sur ce téléphone.
 * Un rôle déjà répondu ne peut plus être choisi : il passerait directement à
 * l'attente, ce qui est juste, mais lui reproposer le formulaire serait
 * promettre une réponse que le serveur refusera (409 DEJA_REPONDU).
 */
export function etapeQuestion(r: Revelation, roleChoisi: Role | null): EtapeQuestion {
  if (r.revele) return { kind: 'revele' };
  const restants = (['CREATOR', 'PARTNER'] as const).filter((role) => !r.aRepondu[role]);
  if (roleChoisi && !r.aRepondu[roleChoisi]) return { kind: 'repondre', role: roleChoisi };
  if (roleChoisi && r.aRepondu[roleChoisi]) {
    const manquant = restants[0];
    if (manquant) return { kind: 'attente', manquant };
  }
  return { kind: 'choisir-qui', restants: [...restants] };
}

/** Le prénom d'un rôle, ou un repli qui ne laisse jamais une phrase vide. */
export function nomDe(noms: Record<Role, string | null>, role: Role): string {
  const nom = noms[role]?.trim();
  if (nom) return nom;
  return role === 'CREATOR' ? 'Partenaire 1' : 'Partenaire 2';
}

export function autreRole(role: Role): Role {
  return role === 'CREATOR' ? 'PARTNER' : 'CREATOR';
}

/** La ligne sous le compteur de série. */
export function legendeSerie(s: EtatSerie): string {
  if (s.actuelle === 0) {
    return s.record > 0
      ? `Votre record : ${s.record} jour${s.record > 1 ? 's' : ''}. Une nouvelle série commence aujourd’hui.`
      : 'Jouez ou répondez à deux aujourd’hui pour allumer votre première flamme.';
  }
  if (s.joueAujourdhui) {
    return s.actuelle >= s.record
      ? 'Flamme entretenue pour aujourd’hui. C’est votre meilleure série !'
      : `Flamme entretenue pour aujourd’hui. Record : ${s.record} jours.`;
  }
  if (s.enDanger) return 'Votre flamme vacille : jouez à deux aujourd’hui pour la garder.';
  return 'Jouez ou répondez à deux aujourd’hui pour prolonger votre série.';
}

/**
 * Les rappels par email sont-ils actifs, d'après `GET /api/notifications/prefs` ?
 * Même règle que `isChannelEnabled` côté serveur (qui est `server-only`) :
 * activé tant qu'on ne l'a pas explicitement coupé.
 */
export function rappelsActifs(prefs: unknown, type: string): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  const evenement = (prefs as Record<string, unknown>)[type];
  if (!evenement || typeof evenement !== 'object') return true;
  return (evenement as { email?: unknown }).email !== false;
}

/** Millisecondes avant minuit UTC — l'heure où la question du jour change. */
export function msAvantProchaineQuestion(maintenant: Date): number {
  const demain = Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate() + 1,
  );
  return Math.max(0, demain - maintenant.getTime());
}

/** « 5 h 12 », « 42 min », « moins d’une minute ». */
export function compteARebours(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'moins d’une minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export interface Objectif {
  titre: string;
  reste: number;
  /** « jour », « partie », « question du jour » — accordé par `phraseObjectif`. */
  unite: 'jour' | 'partie' | 'question';
}

/**
 * Le badge le plus proche, pour finir chaque écran sur « plus que 2 jours ».
 *
 * Pour une série, ce qui reste se compte depuis la série EN COURS, pas
 * depuis le record : un couple dont le record est 6 mais la série actuelle
 * 1 a encore 6 jours devant lui pour « Une semaine à deux », pas un.
 * Les badges sans compteur (niveaux, télépathes) ne sont pas proposés : on
 * ne peut pas dire « plus que N » pour eux sans mentir.
 */
export function prochainObjectif(
  badges: readonly {
    famille: string;
    titre: string;
    cible: number;
    valeur: number;
    obtenuLe: string | null;
  }[],
  serie: { actuelle: number },
): Objectif | null {
  let meilleur: Objectif | null = null;
  for (const b of badges) {
    if (b.obtenuLe || b.cible <= 1) continue;
    let o: Objectif | null = null;
    if (b.famille === 'serie')
      o = { titre: b.titre, reste: b.cible - serie.actuelle, unite: 'jour' };
    else if (b.famille === 'parties')
      o = { titre: b.titre, reste: b.cible - b.valeur, unite: 'partie' };
    else if (b.famille === 'quotidien')
      o = { titre: b.titre, reste: b.cible - b.valeur, unite: 'question' };
    if (o && o.reste > 0 && (!meilleur || o.reste < meilleur.reste)) meilleur = o;
  }
  return meilleur;
}

export function phraseObjectif(o: Objectif): string {
  const pluriel = o.reste > 1;
  const unite =
    o.unite === 'jour'
      ? `jour${pluriel ? 's' : ''} d’affilée`
      : o.unite === 'partie'
        ? `partie${pluriel ? 's' : ''}`
        : `question${pluriel ? 's' : ''} du jour à deux`;
  return `Plus que ${o.reste} ${unite} pour le badge « ${o.titre} ».`;
}

/** « 1 jour » / « 12 jours ». */
export function joursLibelle(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''}`;
}

const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/**
 * « 3 oct. 2026 ». Écrit à la main plutôt qu'avec `Intl` : le rendu
 * d'`Intl.DateTimeFormat` dépend des données ICU de l'environnement, et un
 * test qui passe ici et pas en CI ne protège rien.
 */
export function dateCourte(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  if (!a || !m || !j || !MOIS[m - 1]) return jour;
  return `${j} ${MOIS[m - 1]} ${a}`;
}
