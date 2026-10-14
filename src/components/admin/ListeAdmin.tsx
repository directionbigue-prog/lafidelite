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
import { ApiError } from '@/lib/api';
import { apiAdmin } from '@/lib/admin/api-admin';
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
  /** Sans `/api` : `apiAdmin()` le préfixe (voir lib/admin/api-admin.ts). */
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
        const r = await apiAdmin<Page<T>>(construireRequete(chemin, { ...valeurs, cursor }));
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
    <section className={CARTE_CONSOLE}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-ink">{titre}</h2>
          {description && (
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink/60">
              {description}
            </p>
          )}
        </div>
        {page && (
          <p className="text-[13px] text-ink/55">
            {page.items.length} ligne{page.items.length === 1 ? '' : 's'}
            {page.nextCursor ? ' affichées' : ''}
          </p>
        )}
      </header>

      {filtres.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {filtres.map((f) => (
            <label key={f.cle} className="flex items-center gap-2 text-[13px] text-ink/65">
              {f.label}
              <select
                value={valeurs[f.cle] ?? ''}
                onChange={(e) => setValeurs((v) => ({ ...v, [f.cle]: e.target.value }))}
                className={SELECT_CONSOLE}
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

      {erreur && <ErreurConsole>{erreur}</ErreurConsole>}

      {chargement && !page && <p className="text-sm text-ink/55">Chargement…</p>}

      {page && page.items.length === 0 && <p className="text-sm text-ink/50">{vide}</p>}

      {page && page.items.length > 0 && (
        <>
          {/* Téléphone : une carte par ligne, chaque valeur sous son libellé.
              Un tableau de 32rem dans 390 px se lisait en faisant défiler de
              côté, une colonne à la fois, en perdant la ligne en route. Les
              colonnes secondaires, masquées dans le tableau, y figurent. */}
          <ul className="space-y-2 md:hidden">
            {page.items.map((ligne) => (
              <li
                key={ligne.id}
                className="rounded-xl border border-console-ligne bg-console-fond/60 p-3"
              >
                <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {colonnes.map((c) => (
                    <div key={c.cle} className="contents">
                      <dt className="text-[12px] text-ink/50">{c.entete}</dt>
                      <dd className="min-w-0 break-words text-ink/85">{c.rendu(ligne)}</dd>
                    </div>
                  ))}
                </dl>
                {actions && <div className="mt-2.5">{actions(ligne, recharger)}</div>}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-console-ligne text-[11px] uppercase tracking-[0.1em] text-ink/50">
                  {colonnes.map((c) => (
                    <th
                      key={c.cle}
                      className={`py-2 pr-4 font-medium ${c.secondaire ? 'hidden lg:table-cell' : ''}`}
                    >
                      {c.entete}
                    </th>
                  ))}
                  {actions && <th className="py-2 font-medium">Action</th>}
                </tr>
              </thead>
              <tbody>
                {page.items.map((ligne) => (
                  <tr
                    key={ligne.id}
                    className="border-b border-console-ligne/70 last:border-0 hover:bg-console-fond/60"
                  >
                    {colonnes.map((c) => (
                      <td
                        key={c.cle}
                        className={`py-2.5 pr-4 align-top text-ink/85 ${
                          c.secondaire ? 'hidden lg:table-cell' : ''
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
        </>
      )}

      {page?.nextCursor && (
        <button
          type="button"
          onClick={() => void charger(page.nextCursor)}
          disabled={chargement}
          className={BOUTON_CONSOLE}
        >
          {chargement ? 'Chargement…' : 'Charger la suite'}
        </button>
      )}
    </section>
  );
}

// ── Le thème clair de la console (14/10/2026) ───────────────────────────
//
// Partagé par toutes les surfaces de `/admin`, pour qu'une carte, un sélecteur
// ou un message d'erreur ait la même allure d'un onglet à l'autre. Le produit
// reste sombre ; seule la console vit sur ce gris.

/** Une carte de la console : blanche sur le fond gris. */
export const CARTE_CONSOLE =
  'space-y-4 rounded-2xl border border-console-ligne bg-white p-4 shadow-sm sm:p-5';

/** Un `<select>` de la console. */
export const SELECT_CONSOLE =
  'rounded-xl border border-console-ligne bg-white px-2.5 py-1.5 text-ink focus:border-gold-deep focus:outline-none';

/** Un petit bouton secondaire (recharger, charger la suite). */
export const BOUTON_CONSOLE =
  'rounded-xl border border-console-ligne bg-white px-4 py-2 text-sm text-ink/80 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50';

/** Un message d'erreur dans une carte de la console. */
export function ErreurConsole({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-wine/30 bg-wine/5 px-3 py-2 text-sm text-wine-deep"
    >
      {children}
    </p>
  );
}

/** La pastille de statut, partagée par les quatre listes. */
export function Pastille({ ton, children }: { ton: string; children: ReactNode }) {
  const classes: Record<string, string> = {
    succes: 'border-gold-deep/35 bg-gold/20 text-ink',
    attente: 'border-ink/15 bg-ink/5 text-ink/70',
    echec: 'border-wine/35 bg-wine/10 text-wine-deep',
    neutre: 'border-ink/10 bg-ink/[0.03] text-ink/55',
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
