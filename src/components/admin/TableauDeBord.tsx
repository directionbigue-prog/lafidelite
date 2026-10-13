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
import { Button, ButtonLink } from '@/components/ui/Button';

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
  alertes: {
    payeesSansDroit: string[];
    emailsMorts: number;
    outboxMorts: number;
    emailsEnAttente: number;
  };
  series: { inscriptions: PointDeSerie[]; parties: PointDeSerie[]; ventes: PointDeSerie[] };
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
      <Alert tone="info">
        Ce tableau de bord est réservé au super-administrateur.{' '}
        <Link href="/admin" className="underline">
          Retour à la console
        </Link>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-serif text-3xl text-cream">Tableau de bord</h1>
          <p className="text-sm text-cream/60">
            {d ? `Mis à jour ${dateCourte(d.genereLe)} · rafraîchi chaque minute` : 'Chargement…'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void charger()} disabled={chargement}>
            {chargement ? 'Actualisation…' : 'Actualiser'}
          </Button>
          <ButtonLink href="/admin" variant="ghost">
            Console
          </ButtonLink>
        </div>
      </header>

      {erreur && <Alert tone="error">{erreur}</Alert>}

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

          <div className="grid gap-4 lg:grid-cols-2">
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

          <div className="grid gap-4 lg:grid-cols-3">
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

          <div className="grid gap-4 lg:grid-cols-3">
            <Carte titre="Connexions — 7 jours">
              <Ligne libelle="Total" valeur={nombreLisible(d.connexions7j.total)} />
              <Repartition titre="Appareils" valeurs={d.connexions7j.parAppareil} />
              <Repartition titre="Pays" valeurs={d.connexions7j.parPays} max={6} />
            </Carte>
            <Carte titre="File d’e-mails">
              <Statuts valeurs={d.files.emails} />
            </Carte>
            <Carte titre="Outbox (événements)">
              <Statuts valeurs={d.files.outbox} />
            </Carte>
          </div>
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
  if (a.emailsMorts > 0) messages.push(`${a.emailsMorts} e-mail(s) abandonné(s) après 5 essais.`);
  if (a.outboxMorts > 0) messages.push(`${a.outboxMorts} événement(s) outbox abandonné(s).`);
  if (a.emailsEnAttente > 20)
    messages.push(`${a.emailsEnAttente} e-mails en attente : la file ne se vide pas.`);

  if (messages.length === 0) return <Alert tone="success">Aucune alerte. Tout tourne.</Alert>;
  return (
    <Alert tone="error">
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
    <div
      className={`rounded-2xl border p-4 ${accent ? 'border-gold/60 bg-plum-card' : 'border-cream/12 bg-plum-card/50'}`}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">{titre}</p>
      <p className="mt-1.5 font-serif text-[clamp(22px,3vw,30px)] leading-tight text-gold">
        {valeur}
      </p>
      <p className="mt-1 text-[12px] text-cream/55">{detail}</p>
    </div>
  );
}

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-cream/12 bg-plum-card/50 p-5">
      <h2 className="font-serif text-lg text-cream">{titre}</h2>
      {children}
    </section>
  );
}

function Vide({ children }: { children: ReactNode }) {
  return <p className="text-sm text-cream/45">{children}</p>;
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-cream/65">{libelle}</span>
      <span className="text-right tabular-nums text-cream">{valeur}</span>
    </div>
  );
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-cream/45">
            {entetes.map((e) => (
              <th key={e} className="pb-1.5 pr-3 font-normal">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t border-cream/8">
              {l.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 tabular-nums text-cream/80">
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
      <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">{titre}</p>
      {lignes.length === 0 ? (
        <Vide>Rien encore.</Vide>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {lignes.map((l) => {
            const p = pourcentage(l.valeur, total);
            return (
              <li key={l.cle} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-cream/80">{l.cle}</span>
                  <span className="tabular-nums text-cream/60">
                    {l.valeur} <span className="text-cream/40">{p}%</span>
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-cream/8">
                  <div className="h-full rounded-full bg-gold/60" style={{ width: `${p}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
      <p className="text-sm text-cream/60">
        Total : <span className="font-semibold text-gold">{nombreLisible(total)}</span>
      </p>
      <div className="mt-2 flex h-24 items-end gap-[3px]">
        {serie.map((p) => (
          <div key={p.jour} className="flex flex-1 flex-col justify-end">
            <div
              title={`${p.jour} · ${p.valeur}`}
              style={{ height: `${Math.round((p.valeur / max) * 100)}%` }}
              className={`w-full rounded-t-[3px] ${p.valeur === 0 ? 'min-h-[2px] bg-cream/10' : 'bg-gold/70'}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-cream/40">
        <span>{serie[0]?.jour.slice(5)}</span>
        <span>{serie[serie.length - 1]?.jour.slice(5)}</span>
      </div>
    </div>
  );
}
