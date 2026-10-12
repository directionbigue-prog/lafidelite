// Le calendrier du rituel : ce qu'est « un jour », et quelle question il porte.
//
// UN JOUR, C'EST UNE DATE UTC. Le public de Cœur Fidèle est au Sénégal, où
// l'heure légale EST l'UTC toute l'année (pas d'heure d'été) : minuit UTC est
// minuit à Dakar. Une date au format AAAA-MM-JJ est aussi ce que stocke
// `ReponseDuJour.jour`, donc la comparaison de deux jours est une comparaison
// de chaînes — pas de fuseau à réinterpréter côté base.
//
// Module pur et isomorphe : il est lu par les routes, par le cron de rappel et
// par l'écran. Aucun `Math.random()` : la question d'un jour doit être la même
// pour les deux partenaires, sur deux appareils, à deux heures différentes.

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const FORME_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** La date UTC d'un instant, au format AAAA-MM-JJ. */
export function jourDe(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

export function estUnJour(valeur: string): boolean {
  if (!FORME_JOUR.test(valeur)) return false;
  // `Date.parse` accepte « 2026-02-31 » en le normalisant au 3 mars ; on
  // refuse une date qui ne se relit pas à l'identique.
  const t = Date.parse(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(t) && jourDe(new Date(t)) === valeur;
}

/** Le nombre de jours entre deux dates (positif si `b` est après `a`). */
export function ecartEnJours(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00.000Z`);
  const tb = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((tb - ta) / MS_PAR_JOUR);
}

/** Le jour situé `n` jours après `jour` (avant si `n` est négatif). */
export function decaler(jour: string, n: number): string {
  return jourDe(new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * MS_PAR_JOUR));
}

/**
 * FNV-1a sur 32 bits. Pas de cryptographie ici : il faut seulement qu'une
 * même entrée rende toujours le même nombre, ici comme dans le navigateur.
 */
function empreinte(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * La question du jour d'un couple, choisie parmi `identifiants`.
 *
 * Déterministe sur (couple, jour) : deux partenaires qui ouvrent l'écran à
 * des heures différentes voient la même question. Le couple entre dans le
 * calcul pour que deux couples ne reçoivent pas la même question le même
 * jour — sinon un couple pourrait se la faire souffler.
 *
 * Les identifiants sont triés avant le tirage : l'ordre dans lequel la base
 * les rend n'est pas garanti, et un ordre différent changerait la question.
 * Rend `null` sur une banque vide plutôt que d'inventer.
 */
export function choisirQuestionDuJour(
  coupleId: string,
  jour: string,
  identifiants: readonly string[],
): string | null {
  if (identifiants.length === 0) return null;
  const tries = [...identifiants].sort();
  return tries[empreinte(`${coupleId}:${jour}`) % tries.length] ?? null;
}
