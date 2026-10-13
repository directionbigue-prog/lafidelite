'use client';

// La section « Connexions » de la console d'administration : avec quel type
// d'appareil, depuis quel pays, et à quel rythme.
//
// Ce composant ne DÉCIDE rien. Les seaux de temps, les étiquettes, les
// drapeaux et les classements viennent tous de `lib/admin/connexions.ts`, qui
// est pur et testé — il n'y a ni jsdom ni Testing Library dans ce dépôt, donc
// un composant ne peut pas être monté, et toute logique écrite ici serait hors
// de portée des tests. Ce fichier se contente de rendre ce que la route a
// calculé.

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { apiAdmin } from '@/lib/admin/api-admin';
import { GRANULARITES, type Granularite, type LigneConnexion } from '@/lib/admin/connexions';
import { messageErreurAdmin } from '@/lib/admin/console';

interface Repartition {
  cle: string;
  libelle: string;
  nombre: number;
  pourcentage: number;
}

interface RepartitionPays extends Repartition {
  drapeau: string;
}

interface PointSerie {
  debut: string;
  libelle: string;
  nombre: number;
}

interface Reponse {
  granularite: Granularite;
  depuis: string;
  total: number;
  comptesDistincts: number;
  tronque: boolean;
  appareils: Repartition[];
  pays: RepartitionPays[];
  methodes: Repartition[];
  serie: PointSerie[];
  dernieres?: LigneConnexion[];
}

const ICONE_APPAREIL: Record<string, string> = {
  TELEPHONE: '📱',
  TABLETTE: '📲',
  ORDINATEUR: '💻',
  AUTRE: '❔',
};

/**
 * Chaque connexion, une par ligne : appareil, heure, jour, mois, année, pays
 * et son drapeau. Tout vient déjà formaté de `ligneConnexion` côté serveur.
 */
export function DernieresConnexions({ lignes }: { lignes: LigneConnexion[] }) {
  return (
    <div className="rounded-xl border border-cream/10 bg-plum-card2/60 p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
        Dernières connexions (heure de Dakar)
      </p>
      {lignes.length === 0 ? (
        <p className="mt-2 text-sm text-cream/45">Aucune connexion encore.</p>
      ) : (
        <div className="mt-2.5 max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-plum-card2">
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-cream/45">
                <th className="pb-1.5 pr-3 font-normal">Appareil</th>
                <th className="pb-1.5 pr-3 font-normal">Heure</th>
                <th className="pb-1.5 pr-3 font-normal">Jour</th>
                <th className="pb-1.5 pr-3 font-normal">Mois</th>
                <th className="pb-1.5 pr-3 font-normal">Année</th>
                <th className="pb-1.5 font-normal">Pays</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={`${l.quand}-${i}`} className="border-t border-cream/8 text-cream/80">
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    <span className="mr-1.5" aria-hidden>
                      {ICONE_APPAREIL[l.typeAppareil] ?? '❔'}
                    </span>
                    {l.appareil}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{l.heure}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{l.jour}</td>
                  <td className="py-1.5 pr-3">{l.mois}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{l.annee}</td>
                  <td className="whitespace-nowrap py-1.5">
                    <span className="mr-1.5 text-base" aria-hidden>
                      {l.drapeau}
                    </span>
                    {l.pays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const LIBELLES_GRANULARITE: Record<Granularite, string> = {
  heure: 'Par heure',
  jour: 'Par jour',
  semaine: 'Par semaine',
  mois: 'Par mois',
  annee: 'Par année',
};

export function Connexions() {
  const [granularite, setGranularite] = useState<Granularite>('jour');
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async (g: Granularite) => {
    setChargement(true);
    setErreur(null);
    try {
      setDonnees(await apiAdmin<Reponse>(`/admin/connexions?granularite=${g}`));
    } catch (e) {
      setErreur(
        messageErreurAdmin(
          e instanceof ApiError ? e.code : null,
          e instanceof ApiError ? e.status : undefined,
        ),
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(granularite);
  }, [granularite, charger]);

  return (
    <section className="space-y-4 rounded-2xl border border-cream/12 bg-plum-card/50 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-cream">Connexions</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-cream/55">
            Type d’appareil et pays, déduits à la connexion. Ni l’adresse IP ni le navigateur ne
            sont conservés.
          </p>
        </div>
        {donnees && (
          <p className="text-[13px] text-cream/60">
            <span className="font-semibold text-gold">{donnees.total}</span> connexion
            {donnees.total === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold text-gold">{donnees.comptesDistincts}</span> compte
            {donnees.comptesDistincts === 1 ? '' : 's'}
          </p>
        )}
      </header>

      {/* Sélecteur d'échelle. `rounded-xl` et un fond teinté, pas une pastille
          pleine : une pastille `rounded-full bg-gold` serait un bouton d'action
          au sens de la charte, et `one-button-design.test.ts` le signalerait —
          à raison, puisque ce sont des onglets, pas des actions. */}
      <div role="tablist" aria-label="Échelle de temps" className="flex flex-wrap gap-1.5">
        {GRANULARITES.map((g) => {
          const actif = g === granularite;
          return (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={actif}
              onClick={() => setGranularite(g)}
              className={`rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                actif
                  ? 'bg-gold/15 font-semibold text-gold'
                  : 'text-cream/60 hover:bg-plum-card hover:text-cream'
              }`}
            >
              {LIBELLES_GRANULARITE[g]}
            </button>
          );
        })}
      </div>

      {erreur && (
        <p className="rounded-xl border border-wine/40 bg-wine/10 px-3 py-2 text-sm text-cream">
          {erreur}
        </p>
      )}

      {chargement && !donnees && <p className="text-sm text-cream/50">Chargement…</p>}

      {donnees && (
        <div className="space-y-5">
          <Histogramme serie={donnees.serie} />

          <div className="grid gap-4 md:grid-cols-2">
            <Liste titre="Appareils" lignes={donnees.appareils} vide="Aucune connexion encore." />
            <Liste titre="Pays" lignes={donnees.pays} vide="Aucun pays encore identifié." />
          </div>

          <Liste
            titre="Par quel chemin"
            lignes={donnees.methodes}
            vide="Aucune connexion encore."
          />

          <DernieresConnexions lignes={donnees.dernieres ?? []} />

          {donnees.tronque && (
            <p className="text-[12px] text-cream/45">
              Volume plafonné à 50 000 connexions : les chiffres ci-dessus sont partiels.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Les barres de la série.
 *
 * L'échelle est relative au plus haut point de la fenêtre, et le maximum est
 * forcé à 1 : diviser par le maximum d'une série toute à zéro donnerait `NaN`,
 * ce qui rend une barre sans hauteur et une console qui a l'air cassée alors
 * qu'elle dit simplement « rien ne s'est passé ».
 */
function Histogramme({ serie }: { serie: PointSerie[] }) {
  const max = Math.max(1, ...serie.map((p) => p.nombre));
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]">
        {serie.map((p) => (
          <div key={p.debut} className="group relative flex flex-1 flex-col justify-end">
            <div
              // `title` plutôt qu'une infobulle maison : la série peut compter
              // 30 points sur un téléphone, donc les étiquettes sous l'axe sont
              // espacées, et il faut pouvoir lire un point au survol.
              title={`${p.libelle} · ${p.nombre}`}
              style={{ height: `${Math.round((p.nombre / max) * 100)}%` }}
              className={`w-full rounded-t-[3px] ${
                p.nombre === 0 ? 'min-h-[2px] bg-cream/10' : 'bg-gold/70'
              }`}
            />
          </div>
        ))}
      </div>
      {/* Une étiquette sur quatre au plus : trente libellés côte à côte se
          chevauchent et deviennent illisibles. Les extrêmes sont toujours
          affichés, sinon on ne sait pas où commence ni où finit la fenêtre. */}
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-cream/40">
        {serie.map((p, i) => {
          const pas = Math.max(1, Math.ceil(serie.length / 6));
          const montrer = i === 0 || i === serie.length - 1 || i % pas === 0;
          return (
            <span key={p.debut} className="flex-1 truncate text-center">
              {montrer ? p.libelle : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Liste({
  titre,
  lignes,
  vide,
}: {
  titre: string;
  lignes: (Repartition | RepartitionPays)[];
  vide: string;
}) {
  return (
    <div className="rounded-xl border border-cream/10 bg-plum-card2/60 p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">{titre}</p>
      {lignes.length === 0 ? (
        <p className="mt-2 text-sm text-cream/45">{vide}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {lignes.map((l) => (
            <li key={l.cle || '(vide)'} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-cream/80">
                  {'drapeau' in l && <span className="mr-1.5">{l.drapeau}</span>}
                  {l.libelle}
                </span>
                <span className="shrink-0 tabular-nums text-cream/60">
                  {l.nombre}
                  <span className="ml-1.5 text-cream/40">{l.pourcentage}%</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-cream/8">
                <div
                  className="h-full rounded-full bg-gold/60"
                  style={{ width: `${l.pourcentage}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
