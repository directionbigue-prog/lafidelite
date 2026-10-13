// Ce qu'on dit à quelqu'un dont le pack n'ouvre pas le Salon.
//
// La phrase nommait en dur « les packs Essentiel, Intégral et Annuel » —
// trois noms que la boutique n'affichait plus depuis que les paliers se
// vendent à la durée (Week-end, Semaine, Mois), dont un retiré de la vente.
// Même défaut que celui que `tarifs-derives.test.ts` verrouille sur la page
// d'accueil : le registre change, la copie ne suit pas. Elle est donc
// dérivée du registre, comme les cartes de prix.
import { PACKS_PAYANTS } from '@/lib/game/packs';

function enumeration(noms: readonly string[]): string {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

const NOMS = PACKS_PAYANTS.filter((pack) => pack.salon).map((pack) => pack.nom);

export const MESSAGE_SALON_VERROUILLE = `Le Salon est inclus dans les packs ${enumeration(
  NOMS,
)}. Choisissez-en un dans Tarifs.`;
