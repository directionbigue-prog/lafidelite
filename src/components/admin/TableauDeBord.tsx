'use client';

// Le tableau de bord du super-administrateur : comptes, couples, parties,
// rituel, Salon, ventes, files d'envoi et alertes, sur une seule page.
//
// Ce composant ne calcule rien : la route `/api/admin/tableau-de-bord`
// compte, `lib/admin/tableau-de-bord.ts` agrège (et est testé), ce fichier
// affiche. Il se relit toutes les 60 secondes tant que l'onglet est ouvert.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { apiAdmin } from '@/lib/admin/api-admin';
import { messageErreurAdmin } from '@/lib/admin/console';
import {
  nombreLisible,
  pourcentage,
  premiers,
  type PointDeSerie,
} from '@/lib/admin/tableau-de-bord';
import { packParId } from '@/lib/game/packs';
import { Alert } from '@/components/ui/Alert';
import { DernieresConnexions } from '@/components/admin/Connexions';
import { BOUTON_CONSOLE } from '@/components/admin/ListeAdmin';
import type { LigneConnexion } from '@/lib/admin/connexions';

interface Donnees {
  genereLe: string;
  comptes: {
    total: number;
    invites: number;
    nouveaux7j: number;
    nouveaux30j: number;
    suspendus: number;
  };
  couples: Record<string, number>;
  parties: {
    parStatut: Record<string, number>;
    terminees7j: number;
    partiesOffertesJouees: number;
    niveaux: Record<string, number>;
  };
  salon: { jeu: string; total: number; enCours: number }[];
  rituel: { couplesAujourdhui: number; couplesCompletsAujourdhui: number; reponses7j: number };
  ventes: {
    commandes: Record<string, number>;
    montantTotal: number;
    montant30j: number;
    devise: string;
    parPack: { packId: string; nombre: number; montant: number }[];
    droitsActifs: Record<string, number>;
    derniers: {
      id: string;
      montant: number;
      packId: string;
      methode: string | null;
      payeeLe: string | null;
    }[];
  };
  files: { emails: Record<string, number>; outbox: Record<string, number> };
  connexions7j: {
    total: number;
    parAppareil: Record<string, number>;
    parPays: Record<string, number>;
  };
  dernieresConnexions: LigneConnexion[];
  /** Absent d'une réponse antérieure au 14/10/2026 : lu avec `?? []`. */
  paysConnectes?: PaysConnecte[];
  alertes: {
    payeesSansDroit: string[];
    emailsMorts: number;
    outboxMorts: number;
    emailsEnAttente: number;
    commandesEchouees24h: number;
    configuration: string[];
    paiement: string[];
  };
  series: { inscriptions: PointDeSerie[]; parties: PointDeSerie[]; ventes: PointDeSerie[] };
}

interface PaysConnecte {
  cle: string;
  libelle: string;
  drapeau: string;
  nombre: number;
  pourcentage: number;
}

const RAFRAICHISSEMENT_MS = 60_000;

const NIVEAUX: Record<string, string> = {
  DECOUVERTE: 'Découverte',
  COMPLICES: 'Complices',
  FUSIONNELS: 'Fusionnels',
  INSEPARABLES: 'Inséparables',
};

const JEUX: Record<string, string> = {
  DAMES: 'Dames',
  AWALE: 'Awalé',
  LUDO: 'Ludo',
  MOT: 'Le mot',
  MOTS_CROISES: 'Mots croisés',
};

function nomDuPack(id: string): string {
  return id === 'AUTRE' ? 'Hors pack' : (packParId(id)?.nom ?? id);
}

function dateCourte(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TableauDeBord() {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [refuse, setRefuse] = useState(false);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setD(await apiAdmin<Donnees>('/admin/tableau-de-bord'));
      setErreur(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setRefuse(true);
      else
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
    void charger();
    const id = setInterval(() => void charger(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(id);
  }, [charger]);

  if (refuse) {
    return (
      <Alert tone="info" surface="clair">
        Ce tableau de bord est réservé au super-administrateur.{' '}
        <Link href="/admin" className="underline">
          Retour à la console
        </Link>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-serif text-3xl text-ink sm:text-4xl">Tableau de bord</h1>
          <p className="text-sm text-ink/60">
            {d ? `Mis à jour ${dateCourte(d.genereLe)} · rafraîchi chaque minute` : 'Chargement…'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void charger()}
            disabled={chargement}
            className={BOUTON_CONSOLE}
          >
            {chargement ? 'Actualisation…' : 'Actualiser'}
          </button>
          <Link href="/admin" className={BOUTON_CONSOLE}>
            Console
          </Link>
        </div>
      </header>

      {erreur && (
        <Alert tone="error" surface="clair">
          {erreur}
        </Alert>
      )}

      {d && (
        <>
          <Alertes a={d.alertes} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Chiffre
              titre="Chiffre d’affaires"
              valeur={`${nombreLisible(d.ventes.montantTotal)} ${d.ventes.devise}`}
              detail={`${nombreLisible(d.ventes.montant30j)} ${d.ventes.devise} sur 30 jours`}
              accent
            />
            <Chiffre
              titre="Comptes"
              valeur={nombreLisible(d.comptes.total)}
              detail={`+${d.comptes.nouveaux7j} cette semaine · +${d.comptes.nouveaux30j} sur 30 j`}
            />
            <Chiffre
              titre="Couples actifs"
              valeur={nombreLisible(d.couples.ACTIVE ?? 0)}
              detail={`${d.couples.PENDING ?? 0} en attente de partenaire`}
            />
            <Chiffre
              titre="Parties terminées"
              valeur={nombreLisible(d.parties.parStatut.COMPLETED ?? 0)}
              detail={`${d.parties.terminees7j} cette semaine · ${d.parties.parStatut.IN_PROGRESS ?? 0} en cours`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Carte titre="Inscriptions — 14 jours">
              <Barres serie={d.series.inscriptions} />
            </Carte>
            <Carte titre="Parties terminées — 14 jours">
              <Barres serie={d.series.parties} />
            </Carte>
            <Carte titre={`Ventes (${d.ventes.devise}) — 14 jours`}>
              <Barres serie={d.series.ventes} />
            </Carte>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Carte titre="Ventes par pack">
              {d.ventes.parPack.length === 0 ? (
                <Vide>Aucune vente encore.</Vide>
              ) : (
                <Tableau
                  lignes={d.ventes.parPack.map((p) => [
                    nomDuPack(p.packId),
                    `${p.nombre}`,
                    `${nombreLisible(p.montant)} ${d.ventes.devise}`,
                  ])}
                  entetes={['Pack', 'Ventes', 'Montant']}
                />
              )}
              <Repartition
                titre="Packs actifs en ce moment"
                valeurs={Object.fromEntries(
                  Object.entries(d.ventes.droitsActifs).map(([k, v]) => [nomDuPack(k), v]),
                )}
              />
              <Ligne
                libelle="Commandes"
                valeur={`${d.ventes.commandes.PAID ?? 0} payées · ${d.ventes.commandes.PENDING ?? 0} en attente · ${d.ventes.commandes.FAILED ?? 0} échouées · ${d.ventes.commandes.EXPIRED ?? 0} expirées`}
              />
              <Ligne
                libelle="Conversion"
                valeur={`${pourcentage(
                  Object.values(d.ventes.droitsActifs).reduce((s, n) => s + n, 0),
                  d.couples.ACTIVE ?? 0,
                )} % des couples actifs ont un pack en cours`}
              />
            </Carte>

            <Carte titre="Derniers paiements">
              {d.ventes.derniers.length === 0 ? (
                <Vide>Aucun paiement reçu.</Vide>
              ) : (
                <Tableau
                  entetes={['Date', 'Pack', 'Moyen', 'Montant']}
                  lignes={d.ventes.derniers.map((p) => [
                    dateCourte(p.payeeLe),
                    nomDuPack(p.packId),
                    p.methode ?? '—',
                    `${nombreLisible(p.montant)} ${d.ventes.devise}`,
                  ])}
                />
              )}
            </Carte>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Carte titre="Comptes">
              <Ligne libelle="Total" valeur={nombreLisible(d.comptes.total)} />
              <Ligne
                libelle="Partenaires invités (sans email)"
                valeur={nombreLisible(d.comptes.invites)}
              />
              <Ligne libelle="Suspendus" valeur={nombreLisible(d.comptes.suspendus)} />
              <Ligne
                libelle="Partie offerte jouée"
                valeur={nombreLisible(d.parties.partiesOffertesJouees)}
              />
              <Ligne libelle="Couples dissous" valeur={nombreLisible(d.couples.DISSOLVED ?? 0)} />
            </Carte>

            <Carte titre="Le jeu">
              <Ligne
                libelle="Abandonnées"
                valeur={nombreLisible(d.parties.parStatut.ABANDONED ?? 0)}
              />
              <Repartition
                titre="Niveaux de complicité obtenus"
                valeurs={Object.fromEntries(
                  Object.entries(d.parties.niveaux).map(([k, v]) => [NIVEAUX[k] ?? k, v]),
                )}
              />
            </Carte>

            <Carte titre="Rituel et Salon">
              <Ligne
                libelle="Couples ayant répondu aujourd’hui"
                valeur={`${d.rituel.couplesAujourdhui} (${d.rituel.couplesCompletsAujourdhui} à deux)`}
              />
              <Ligne libelle="Réponses sur 7 jours" valeur={nombreLisible(d.rituel.reponses7j)} />
              {d.salon.length === 0 ? (
                <Vide>Aucune partie de Salon.</Vide>
              ) : (
                <Tableau
                  entetes={['Jeu', 'Parties', 'En cours']}
                  lignes={d.salon.map((s) => [JEUX[s.jeu] ?? s.jeu, `${s.total}`, `${s.enCours}`])}
                />
              )}
            </Carte>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Carte titre="Connexions — 7 jours">
              <Ligne libelle="Total" valeur={nombreLisible(d.connexions7j.total)} />
              <Repartition titre="Appareils" valeurs={d.connexions7j.parAppareil} />
            </Carte>
            <Carte titre="File d’e-mails">
              <Statuts valeurs={d.files.emails} />
            </Carte>
            <Carte titre="Outbox (événements)">
              <Statuts valeurs={d.files.outbox} />
            </Carte>
          </div>

          <PaysConnectes pays={d.paysConnectes ?? []} />

          <DernieresConnexions lignes={d.dernieresConnexions ?? []} />
        </>
      )}
    </div>
  );
}

function Alertes({ a }: { a: Donnees['alertes'] }) {
  const messages: string[] = [];
  if (a.payeesSansDroit.length > 0)
    messages.push(
      `${a.payeesSansDroit.length} paiement(s) reçu(s) sans pack ouvert — le client a payé et ne peut pas jouer. Commandes : ${a.payeesSansDroit.slice(0, 5).join(', ')}`,
    );
  if (a.emailsMorts > 0)
    messages.push(`${a.emailsMorts} e-mail(s) abandonné(s) après 5 essais cette semaine.`);
  if (a.outboxMorts > 0)
    messages.push(`${a.outboxMorts} événement(s) outbox abandonné(s) cette semaine.`);
  if (a.emailsEnAttente > 20)
    messages.push(`${a.emailsEnAttente} e-mails en attente : la file ne se vide pas.`);
  if (a.commandesEchouees24h > 0)
    messages.push(
      `${a.commandesEchouees24h} commande(s) en échec ces dernières 24 h : la page de paiement ne s’est pas ouverte. Motif dans les logs Vercel (« order charge failed »).`,
    );
  messages.push(...a.paiement);
  if (a.configuration.length > 0)
    messages.push(
      `Variable(s) d’environnement mal formée(s) : ${a.configuration.join(', ')}. À reposer dans Vercel sans caractère caché, puis redéployer.`,
    );

  if (messages.length === 0)
    return (
      <Alert tone="success" surface="clair">
        Aucune alerte. Tout tourne.
      </Alert>
    );
  return (
    <Alert tone="error" surface="clair">
      <ul className="list-disc space-y-1 pl-4">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </Alert>
  );
}

function Chiffre({
  titre,
  valeur,
  detail,
  accent = false,
}: {
  titre: string;
  valeur: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    // Le chiffre d'affaires en carte encre : sur un tableau de bord clair,
    // c'est le seul chiffre qu'on doit trouver sans le chercher.
    <div
      className={`min-w-0 rounded-2xl border p-4 shadow-sm ${
        accent ? 'border-ink bg-ink text-cream' : 'border-console-ligne bg-white text-ink'
      }`}
    >
      <p
        className={`text-[10px] uppercase tracking-[0.14em] ${accent ? 'text-cream/60' : 'text-ink/50'}`}
      >
        {titre}
      </p>
      <p
        className={`mt-1.5 break-words font-serif text-[clamp(22px,3vw,32px)] leading-tight ${
          accent ? 'text-gold' : 'text-ink'
        }`}
      >
        {valeur}
      </p>
      <p className={`mt-1 text-[12px] ${accent ? 'text-cream/65' : 'text-ink/55'}`}>{detail}</p>
    </div>
  );
}

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-console-ligne bg-white p-4 shadow-sm sm:p-5">
      <h2 className="font-serif text-lg text-ink">{titre}</h2>
      {children}
    </section>
  );
}

function Vide({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink/50">{children}</p>;
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink/65">{libelle}</span>
      <span className="text-right font-medium tabular-nums text-ink">{valeur}</span>
    </div>
  );
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink/50">
            {entetes.map((e) => (
              <th key={e} className="pb-1.5 pr-3 font-normal">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t border-console-ligne">
              {l.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 tabular-nums text-ink/85">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Repartition({
  titre,
  valeurs,
  max = 8,
}: {
  titre: string;
  valeurs: Record<string, number>;
  max?: number;
}) {
  const lignes = premiers(valeurs, max);
  const total = lignes.reduce((s, l) => s + l.valeur, 0);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink/50">{titre}</p>
      {lignes.length === 0 ? (
        <Vide>Rien encore.</Vide>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {lignes.map((l) => {
            const p = pourcentage(l.valeur, total);
            return (
              <li key={l.cle} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-ink/85">{l.cle}</span>
                  <span className="tabular-nums text-ink/60">
                    {l.valeur} <span className="text-ink/40">{p}%</span>
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-ink/8">
                  <div className="h-full rounded-full bg-gold-deep/70" style={{ width: `${p}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Tous les pays d'où l'on s'est connecté, sans plafond ni « Autres » : la
 * route compte sur toute la durée conservée. Le drapeau porte la classe
 * `drapeau` (police dédiée, voir globals.css) : sans elle, Windows écrit
 * « SN » au lieu de dessiner le drapeau.
 */
function PaysConnectes({ pays }: { pays: PaysConnecte[] }) {
  const total = pays.reduce((s, p) => s + p.nombre, 0);
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-console-ligne bg-white p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">Pays connectés</h2>
        <p className="text-[13px] text-ink/60">
          <span className="font-semibold text-ink">{pays.length}</span> pays ·{' '}
          {nombreLisible(total)} connexion{total === 1 ? '' : 's'} conservée
          {total === 1 ? '' : 's'}
        </p>
      </header>
      {pays.length === 0 ? (
        <Vide>Aucune connexion encore.</Vide>
      ) : (
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pays.map((p) => (
            <li key={p.cle || '(inconnu)'} className="min-w-0 space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-baseline gap-2 text-ink/85">
                  <span className="drapeau text-lg leading-none" aria-hidden>
                    {p.drapeau}
                  </span>
                  <span className="truncate">{p.libelle}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink/60">
                  {nombreLisible(p.nombre)} <span className="text-ink/40">{p.pourcentage}%</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-ink/8">
                <div
                  className="h-full rounded-full bg-gold-deep/70"
                  style={{ width: `${p.pourcentage}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Statuts({ valeurs }: { valeurs: Record<string, number> }) {
  const libelles: Record<string, string> = {
    PENDING: 'En attente',
    SENT: 'Envoyés',
    FAILED: 'En échec (réessai)',
    DEAD: 'Abandonnés',
  };
  return (
    <div className="space-y-1.5">
      {Object.entries(valeurs).map(([k, v]) => (
        <Ligne key={k} libelle={libelles[k] ?? k} valeur={nombreLisible(v)} />
      ))}
    </div>
  );
}

/** Barres sur 14 jours. Max forcé à 1 : une série nulle ne doit pas rendre NaN. */
function Barres({ serie }: { serie: PointDeSerie[] }) {
  const max = Math.max(1, ...serie.map((p) => p.valeur));
  const total = serie.reduce((s, p) => s + p.valeur, 0);
  return (
    <div>
      <p className="text-sm text-ink/60">
        Total : <span className="font-semibold text-ink">{nombreLisible(total)}</span>
      </p>
      <div className="mt-2 flex h-24 items-end gap-[3px]">
        {serie.map((p) => (
          // `h-full` : sans lui, la colonne d'un conteneur `items-end` prend la
          // hauteur de son contenu, soit zéro, et la barre en % aussi — les
          // trois histogrammes s'affichaient vides.
          <div key={p.jour} className="flex h-full flex-1 flex-col justify-end">
            <div
              title={`${p.jour} · ${p.valeur}`}
              style={{ height: `${Math.round((p.valeur / max) * 100)}%` }}
              className={`w-full rounded-t-[3px] ${p.valeur === 0 ? 'min-h-[2px] bg-ink/10' : 'bg-gold-deep/75'}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink/45">
        <span>{serie[0]?.jour.slice(5)}</span>
        <span>{serie[serie.length - 1]?.jour.slice(5)}</span>
      </div>
    </div>
  );
}
