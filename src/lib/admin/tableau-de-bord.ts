// Le tableau de bord du super-administrateur : les calculs, sans Prisma.
//
// La route (`/api/admin/tableau-de-bord`) compte en base et passe les lignes
// brutes ici ; l'écran (`components/admin/TableauDeBord.tsx`) affiche ce qui
// en sort. Tout ce qui pourrait se tromper silencieusement — un jour décalé,
// un montant divisé, un pack mal attribué — est donc testable sans base ni
// navigateur.
//
// Les jours sont des jours UTC (= heure de Dakar), comme partout ailleurs
// dans le produit (lib/rituel/jour.ts).

export interface PointDeSerie {
  jour: string; // AAAA-MM-JJ
  valeur: number;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

export function jourUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Les `nbJours` derniers jours, du plus ancien à aujourd'hui inclus. */
export function joursRecents(nbJours: number, maintenant: Date): string[] {
  const jours: string[] = [];
  for (let i = nbJours - 1; i >= 0; i--) {
    jours.push(jourUtc(new Date(maintenant.getTime() - i * JOUR_MS)));
  }
  return jours;
}

/**
 * Une série quotidienne continue : chaque jour de la fenêtre apparaît, à 0
 * s'il ne s'est rien passé. Un graphique qui saute les jours vides fait
 * passer une semaine morte pour une courbe régulière.
 */
export function serieQuotidienne(
  evenements: readonly { date: Date; valeur?: number }[],
  nbJours: number,
  maintenant: Date,
): PointDeSerie[] {
  const jours = joursRecents(nbJours, maintenant);
  const totaux = new Map(jours.map((j) => [j, 0]));
  for (const e of evenements) {
    const j = jourUtc(e.date);
    const courant = totaux.get(j);
    if (courant !== undefined) totaux.set(j, courant + (e.valeur ?? 1));
  }
  return jours.map((jour) => ({ jour, valeur: totaux.get(jour) ?? 0 }));
}

/** `groupBy` de Prisma → un objet { cle: nombre }, clés absentes à 0. */
export function compteParCle<K extends string>(
  groupes: readonly { cle: string | null; n: number }[],
  clesAttendues: readonly K[] = [],
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(clesAttendues.map((k) => [k, 0]));
  for (const g of groupes) {
    const cle = g.cle ?? 'INCONNU';
    out[cle] = (out[cle] ?? 0) + g.n;
  }
  return out;
}

export interface CommandeVendue {
  amount: number;
  metadata: unknown;
}

/** Le pack d'une commande, lu dans `metadata.packId` ; « AUTRE » sinon. */
export function packDeCommande(metadata: unknown): string {
  if (metadata && typeof metadata === 'object' && 'packId' in metadata) {
    const p = (metadata as { packId?: unknown }).packId;
    if (typeof p === 'string' && p) return p;
  }
  return 'AUTRE';
}

/**
 * Le chiffre d'affaires par pack. Les montants restent des entiers dans la
 * plus petite unité (FCFA n'a pas de décimales) : rien n'est divisé ici.
 */
export function ventesParPack(
  commandes: readonly CommandeVendue[],
): { packId: string; nombre: number; montant: number }[] {
  const parPack = new Map<string, { nombre: number; montant: number }>();
  for (const c of commandes) {
    const id = packDeCommande(c.metadata);
    const courant = parPack.get(id) ?? { nombre: 0, montant: 0 };
    parPack.set(id, { nombre: courant.nombre + 1, montant: courant.montant + c.amount });
  }
  return [...parPack.entries()]
    .map(([packId, v]) => ({ packId, ...v }))
    .sort((a, b) => b.montant - a.montant);
}

/** Les N premières clés d'un décompte, les autres regroupées. */
export function premiers(
  decompte: Record<string, number>,
  n: number,
): { cle: string; valeur: number }[] {
  const tries = Object.entries(decompte)
    .map(([cle, valeur]) => ({ cle, valeur }))
    .sort((a, b) => b.valeur - a.valeur);
  if (tries.length <= n) return tries;
  const reste = tries.slice(n).reduce((s, x) => s + x.valeur, 0);
  return [...tries.slice(0, n), { cle: 'Autres', valeur: reste }];
}

/** Un pourcentage entier, 0 quand le dénominateur est nul (jamais NaN). */
export function pourcentage(partie: number, total: number): number {
  return total > 0 ? Math.round((partie / total) * 100) : 0;
}

/** 12 500 → « 12 500 » avec une espace fine insécable, comme /tarifs. */
export function nombreLisible(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
