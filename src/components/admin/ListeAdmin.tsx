'use client';

// Une liste paginée de la console, configurée plutôt que recopiée.
//
// Les quatre surfaces ajoutées le 03/10 — commandes, retraits, journal
// d'audit, système — ont exactement la même mécanique : des filtres, un GET
// qui rend `{ items, nextCursor }`, un tableau, un bouton « charger la suite ».
// Quatre composants auraient été quatre copies à maintenir, et c'est
// précisément ainsi que les écrans divergent : l'un gagne une gestion
// d'erreur, les trois autres l'oublient.
//
// Ce fichier ne DÉCIDE rien : la construction de la requête, les libellés de
// statut et le formatage des montants vivent dans `lib/admin/console.ts`, qui
// est pur et testé. Il n'y a ni jsdom ni Testing Library dans ce dépôt, donc
// tout ce qui serait écrit ici échapperait aux tests.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { construireRequete, messageErreurAdmin } from '@/lib/admin/console';

export interface Colonne<T> {
  cle: string;
  entete: string;
  /** Le rendu d'une cellule. Reçoit la ligne entière. */
  rendu: (ligne: T) => ReactNode;
  /** Colonne secondaire : masquée sous `md`, pour que le tableau tienne. */
  secondaire?: boolean;
}

export interface Filtre {
  cle: string;
  label: string;
  options: { valeur: string; label: string }[];
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function ListeAdmin<T extends { id: string }>({
  titre,
  description,
  chemin,
  colonnes,
  filtres = [],
  vide,
  actions,
  rafraichir,
}: {
  titre: string;
  description?: string;
  /** Sans `/api` : `api()` le préfixe, comme partout ailleurs. */
  chemin: string;
  colonnes: Colonne<T>[];
  filtres?: Filtre[];
  vide: string;
  /** Une colonne d'actions en fin de ligne, quand le rôle le permet. */
  actions?: (ligne: T, recharger: () => void) => ReactNode;
  /** Incrémenté par le parent pour forcer un rechargement. */
  rafraichir?: number;
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [page, setPage] = useState<Page<T> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(
    async (cursor?: string | null) => {
      setChargement(true);
      setErreur(null);
      try {
        const r = await api<Page<T>>(construireRequete(chemin, { ...valeurs, cursor }));
        // Une page suivante s'AJOUTE ; un rechargement filtré REMPLACE. Sans
        // cette distinction, changer un filtre empilerait les résultats sur
        // les précédents et le tableau mentirait sur ce qu'il montre.
        setPage((avant) =>
          cursor && avant ? { items: [...avant.items, ...r.items], nextCursor: r.nextCursor } : r,
        );
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
    },
    [chemin, valeurs],
  );

  // `charger` est volontairement absent des dépendances : il est recréé à
  // chaque changement de `valeurs`, donc l'inclure ferait repartir l'effet une
  // seconde fois pour le même filtre. `valeurs` et `rafraichir` suffisent.
  //
  // Pas de `eslint-disable` ici : la règle `react-hooks/exhaustive-deps` n'est
  // pas chargée dans la configuration plate de ce dépôt, et désactiver une
  // règle absente est elle-même une erreur ESLint — le même piège que la page
  // d'administration documente déjà.
  useEffect(() => {
    void charger(null);
  }, [valeurs, rafraichir]);

  const recharger = useCallback(() => void charger(null), [charger]);

  return (
    <section className="space-y-4 rounded-2xl border border-cream/12 bg-plum-card/50 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-cream">{titre}</h2>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-cream/55">{description}</p>
          )}
        </div>
        {page && (
          <p className="text-[13px] text-cream/55">
            {page.items.length} ligne{page.items.length === 1 ? '' : 's'}
            {page.nextCursor ? ' affichées' : ''}
          </p>
        )}
      </header>

      {filtres.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {filtres.map((f) => (
            <label key={f.cle} className="flex items-center gap-2 text-[13px] text-cream/60">
              {f.label}
              <select
                value={valeurs[f.cle] ?? ''}
                onChange={(e) => setValeurs((v) => ({ ...v, [f.cle]: e.target.value }))}
                className="rounded-xl border border-cream/14 bg-plum-card2 px-2.5 py-1.5 text-cream"
              >
                <option value="">Tous</option>
                {f.options.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {erreur && (
        <p className="rounded-xl border border-wine/40 bg-wine/10 px-3 py-2 text-sm text-cream">
          {erreur}
        </p>
      )}

      {chargement && !page && <p className="text-sm text-cream/50">Chargement…</p>}

      {page && page.items.length === 0 && <p className="text-sm text-cream/45">{vide}</p>}

      {page && page.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-cream/12 text-[11px] uppercase tracking-[0.1em] text-cream/45">
                {colonnes.map((c) => (
                  <th
                    key={c.cle}
                    className={`py-2 pr-4 font-medium ${c.secondaire ? 'hidden md:table-cell' : ''}`}
                  >
                    {c.entete}
                  </th>
                ))}
                {actions && <th className="py-2 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {page.items.map((ligne) => (
                <tr key={ligne.id} className="border-b border-cream/8 last:border-0">
                  {colonnes.map((c) => (
                    <td
                      key={c.cle}
                      className={`py-2.5 pr-4 align-top text-cream/80 ${
                        c.secondaire ? 'hidden md:table-cell' : ''
                      }`}
                    >
                      {c.rendu(ligne)}
                    </td>
                  ))}
                  {actions && <td className="py-2.5 align-top">{actions(ligne, recharger)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page?.nextCursor && (
        <button
          type="button"
          onClick={() => void charger(page.nextCursor)}
          disabled={chargement}
          className="rounded-xl border border-cream/20 px-4 py-2 text-sm text-cream/80 transition-colors hover:bg-plum-card disabled:opacity-50"
        >
          {chargement ? 'Chargement…' : 'Charger la suite'}
        </button>
      )}
    </section>
  );
}

/** La pastille de statut, partagée par les quatre listes. */
export function Pastille({ ton, children }: { ton: string; children: ReactNode }) {
  const classes: Record<string, string> = {
    succes: 'border-gold/40 bg-gold/12 text-gold',
    attente: 'border-cream/24 bg-cream/8 text-cream/75',
    echec: 'border-wine/50 bg-wine/14 text-rose',
    neutre: 'border-cream/16 bg-cream/5 text-cream/55',
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${
        classes[ton] ?? classes.neutre
      }`}
    >
      {children}
    </span>
  );
}
