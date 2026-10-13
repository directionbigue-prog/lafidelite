'use client';

// Les quatre surfaces de la console qui n'avaient aucun écran.
//
// Douze routes d'administration existaient depuis la phase 5 ; seules
// `users` et `me` étaient affichées. Commandes, retraits, journal d'audit,
// outbox, file d'e-mails et limiteurs répondaient correctement et n'étaient
// atteignables de nulle part — un back-office qu'on ne peut consulter que
// par curl n'est pas un back-office.
//
// Chaque surface n'est qu'une CONFIGURATION de `ListeAdmin` : colonnes,
// filtres, et rien d'autre. Tout ce qui décide — libellés, tons, montants,
// requêtes — vient de `lib/admin/console.ts`, qui est pur et testé.

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { apiAdmin } from '@/lib/admin/api-admin';
import { ListeAdmin, Pastille, type Colonne } from './ListeAdmin';
import {
  libelleStatut,
  tonDuStatut,
  montantLisible,
  formaterInstant,
  identifiantCourt,
  messageErreurAdmin,
  libelleSeau,
  estSeauDeVerrou,
  etatDesLimiteurs,
} from '@/lib/admin/console';

/** La forme que sert `GET /api/admin/rate-limits`. */
interface ReponseLimiteurs {
  buckets: {
    bucket: string;
    totalKeys: number;
    top10: { key: string; hits: number; expiresAt: string | null }[];
    truncated?: boolean;
  }[];
  /** Posé à la place des seaux quand Redis n'est pas configuré. */
  note?: string;
}

const STATUTS_COMMANDE = ['PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED'];
const STATUTS_RETRAIT = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];
const STATUTS_FILE = ['PENDING', 'SENT', 'FAILED', 'DEAD'];

const enOptions = (statuts: string[]) =>
  statuts.map((s) => ({ valeur: s, label: libelleStatut(s) }));

function Statut({ valeur }: { valeur: string | null | undefined }) {
  return <Pastille ton={tonDuStatut(valeur)}>{libelleStatut(valeur)}</Pastille>;
}

// ── Commandes ────────────────────────────────────────────────────────────

interface Commande {
  id: string;
  userId: string | null;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string | null;
  provider: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
}

export function Commandes() {
  const colonnes: Colonne<Commande>[] = [
    { cle: 'date', entete: 'Créée', rendu: (c) => formaterInstant(c.createdAt) },
    {
      cle: 'client',
      entete: 'Client',
      rendu: (c) => c.customerEmail ?? identifiantCourt(c.userId),
    },
    {
      cle: 'montant',
      entete: 'Montant',
      rendu: (c) => <span className="tabular-nums">{montantLisible(c.amount, c.currency)}</span>,
    },
    { cle: 'statut', entete: 'Statut', rendu: (c) => <Statut valeur={c.status} /> },
    {
      cle: 'moyen',
      entete: 'Moyen',
      secondaire: true,
      rendu: (c) => c.paymentMethod ?? c.provider ?? '—',
    },
    { cle: 'paye', entete: 'Payée le', secondaire: true, rendu: (c) => formaterInstant(c.paidAt) },
  ];

  return (
    <ListeAdmin<Commande>
      titre="Commandes"
      description="Les montants sont en entiers, dans la plus petite unité de la devise — aucune décimale en FCFA."
      chemin="/admin/orders"
      colonnes={colonnes}
      filtres={[{ cle: 'status', label: 'Statut', options: enOptions(STATUTS_COMMANDE) }]}
      vide="Aucune commande. Le tunnel de paiement n’est pas encore branché."
    />
  );
}

// ── Retraits ─────────────────────────────────────────────────────────────

interface Retrait {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  destination: string | null;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export function Retraits({ peutAnnuler }: { peutAnnuler: boolean }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const colonnes: Colonne<Retrait>[] = [
    { cle: 'date', entete: 'Demandé', rendu: (r) => formaterInstant(r.requestedAt) },
    { cle: 'compte', entete: 'Compte', rendu: (r) => identifiantCourt(r.userId) },
    {
      cle: 'montant',
      entete: 'Montant',
      rendu: (r) => <span className="tabular-nums">{montantLisible(r.amount, r.currency)}</span>,
    },
    { cle: 'statut', entete: 'Statut', rendu: (r) => <Statut valeur={r.status} /> },
    {
      cle: 'destination',
      entete: 'Destination',
      secondaire: true,
      rendu: (r) => r.destination ?? '—',
    },
    {
      cle: 'motif',
      entete: 'Motif d’échec',
      secondaire: true,
      rendu: (r) => r.failureReason ?? '—',
    },
  ];

  async function annuler(r: Retrait, recharger: () => void) {
    // Une annulation rend de l'argent à un solde : la confirmation est le
    // dernier filet avant une opération que rien ne défait.
    if (!confirm(`Annuler le retrait de ${montantLisible(r.amount, r.currency)} ?`)) return;
    setEnCours(r.id);
    setErreur(null);
    try {
      await apiAdmin(`/admin/withdrawals/${r.id}/cancel`, { method: 'POST' });
      recharger();
    } catch (e) {
      setErreur(
        messageErreurAdmin(
          e instanceof ApiError ? e.code : null,
          e instanceof ApiError ? e.status : undefined,
        ),
      );
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="space-y-3">
      {erreur && (
        <p className="rounded-xl border border-wine/40 bg-wine/10 px-3 py-2 text-sm text-cream">
          {erreur}
        </p>
      )}
      <ListeAdmin<Retrait>
        titre="Retraits"
        description={
          peutAnnuler
            ? 'Seul un SUPERADMIN peut annuler, et la route le revérifie — ce bouton ne protège rien.'
            : 'L’annulation est réservée aux SUPERADMIN.'
        }
        chemin="/admin/withdrawals"
        colonnes={colonnes}
        filtres={[{ cle: 'status', label: 'Statut', options: enOptions(STATUTS_RETRAIT) }]}
        vide="Aucun retrait."
        {...(peutAnnuler
          ? {
              actions: (r: Retrait, recharger: () => void) =>
                r.status === 'PENDING' ? (
                  <button
                    type="button"
                    disabled={enCours === r.id}
                    onClick={() => void annuler(r, recharger)}
                    className="whitespace-nowrap rounded-xl border border-wine/50 px-2.5 py-1 text-[12px] text-rose transition-colors hover:bg-wine/15 disabled:opacity-50"
                  >
                    {enCours === r.id ? '…' : 'Annuler'}
                  </button>
                ) : null,
            }
          : {})}
      />
    </div>
  );
}

// ── Journal d'audit ──────────────────────────────────────────────────────

interface Entree {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
}

export function Journal() {
  const colonnes: Colonne<Entree>[] = [
    { cle: 'date', entete: 'Quand', rendu: (e) => formaterInstant(e.createdAt) },
    { cle: 'acteur', entete: 'Qui', rendu: (e) => identifiantCourt(e.actorId) },
    {
      cle: 'action',
      entete: 'Quoi',
      rendu: (e) => <span className="font-mono text-[12px]">{e.action}</span>,
    },
    {
      cle: 'cible',
      entete: 'Sur quoi',
      rendu: (e) => (e.targetType ? `${e.targetType} ${identifiantCourt(e.targetId)}` : '—'),
    },
    { cle: 'ip', entete: 'Depuis', secondaire: true, rendu: (e) => e.ip ?? '—' },
  ];

  return (
    <ListeAdmin<Entree>
      titre="Journal d’audit"
      description="Chaque mutation du back-office y laisse une ligne. C’est ce qui permet de répondre « qui a fait quoi, quand » après un incident."
      chemin="/admin/audit-log"
      colonnes={colonnes}
      vide="Aucune action enregistrée."
    />
  );
}

// ── Système ──────────────────────────────────────────────────────────────

interface Evenement {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

interface Courriel {
  id: string;
  to: string;
  subject: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export function Systeme() {
  const outbox: Colonne<Evenement>[] = [
    { cle: 'date', entete: 'Créé', rendu: (e) => formaterInstant(e.createdAt) },
    {
      cle: 'kind',
      entete: 'Type',
      rendu: (e) => <span className="font-mono text-[12px]">{e.kind}</span>,
    },
    { cle: 'statut', entete: 'Statut', rendu: (e) => <Statut valeur={e.status} /> },
    {
      cle: 'essais',
      entete: 'Essais',
      rendu: (e) => <span className="tabular-nums">{e.attempts}</span>,
    },
    {
      cle: 'erreur',
      entete: 'Dernière erreur',
      secondaire: true,
      rendu: (e) => (
        <span className="text-[12px] text-cream/55">{e.lastError?.slice(0, 90) ?? '—'}</span>
      ),
    },
  ];

  const emails: Colonne<Courriel>[] = [
    { cle: 'date', entete: 'Créé', rendu: (c) => formaterInstant(c.createdAt) },
    { cle: 'to', entete: 'Destinataire', rendu: (c) => c.to },
    { cle: 'sujet', entete: 'Sujet', secondaire: true, rendu: (c) => c.subject ?? '—' },
    { cle: 'statut', entete: 'Statut', rendu: (c) => <Statut valeur={c.status} /> },
    {
      cle: 'essais',
      entete: 'Essais',
      rendu: (c) => <span className="tabular-nums">{c.attempts}</span>,
    },
    {
      cle: 'erreur',
      entete: 'Dernière erreur',
      secondaire: true,
      rendu: (c) => (
        <span className="text-[12px] text-cream/55">{c.lastError?.slice(0, 90) ?? '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <ListeAdmin<Evenement>
        titre="Outbox"
        description="Les effets de bord des webhooks passent par là avant d’être exécutés. Une ligne bloquée en « Abandonné » signale un effet jamais appliqué."
        chemin="/admin/outbox"
        colonnes={outbox}
        filtres={[{ cle: 'status', label: 'Statut', options: enOptions(STATUTS_FILE) }]}
        vide="Aucun événement en attente."
      />
      <ListeAdmin<Courriel>
        titre="File d’e-mails"
        description="Les codes de vérification passent ici. Un compte bloqué à l’inscription se diagnostique sur cette ligne, pas dans les journaux."
        chemin="/admin/email-queue"
        colonnes={emails}
        filtres={[{ cle: 'status', label: 'Statut', options: enOptions(STATUTS_FILE) }]}
        vide="Aucun e-mail en file."
      />
      <Limiteurs />
    </div>
  );
}

/**
 * Les limiteurs de débit — la dernière des douze routes sans écran.
 *
 * Pas un `ListeAdmin` : la réponse n'est pas `{ items, nextCursor }` mais un
 * résumé par seau. Elle sert un usage d'incident — « je n'arrive plus à me
 * connecter » — et répond en une ligne si c'est un verrou ou une panne.
 *
 * Lecture seule, comme la route : on ne peut pas lever un verrou d'ici. La
 * route le dit (« admins cannot reset a lockout here »), donc l'écran ne
 * propose aucun bouton qui échouerait.
 */
export function Limiteurs() {
  const [donnees, setDonnees] = useState<ReponseLimiteurs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setDonnees(await apiAdmin<ReponseLimiteurs>('/admin/rate-limits'));
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
    void charger();
  }, [charger]);

  const etat = donnees ? etatDesLimiteurs(donnees) : null;

  return (
    <section className="space-y-4 rounded-2xl border border-cream/12 bg-plum-card/50 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-cream">Limiteurs</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-cream/55">
            À lire quand quelqu’un dit ne plus pouvoir se connecter : cet écran distingue un verrou
            de sécurité d’une panne. Lecture seule — un verrou s’éteint à son expiration.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void charger()}
          disabled={chargement}
          className="rounded-xl border border-cream/20 px-3 py-1.5 text-[13px] text-cream/80 transition-colors hover:bg-plum-card disabled:opacity-50"
        >
          {chargement ? 'Lecture…' : 'Rafraîchir'}
        </button>
      </header>

      {erreur && (
        <p className="rounded-xl border border-wine/40 bg-wine/10 px-3 py-2 text-sm text-cream">
          {erreur}
        </p>
      )}

      {chargement && !donnees && <p className="text-sm text-cream/50">Chargement…</p>}

      {/* Trois absences se ressemblent et ne veulent pas dire la même chose :
          Redis absent, aucun seau, aucun compteur. `etatDesLimiteurs` tranche. */}
      {etat && !etat.utilisable && <p className="text-sm text-cream/55">{etat.message}</p>}

      {etat?.utilisable &&
        (donnees?.buckets ?? [])
          .filter((s) => s.totalKeys > 0)
          .map((s) => (
            <div key={s.bucket} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-medium text-cream">{libelleSeau(s.bucket)}</h3>
                <Pastille ton={estSeauDeVerrou(s.bucket) ? 'echec' : 'attente'}>
                  {s.totalKeys} {estSeauDeVerrou(s.bucket) ? 'verrouillé' : 'suivi'}
                  {s.totalKeys === 1 ? '' : 's'}
                </Pastille>
                {s.truncated && (
                  <span className="text-[12px] text-cream/45">liste tronquée à 1 000 clés</span>
                )}
              </div>
              <ul className="space-y-1">
                {s.top10.map((e) => (
                  <li
                    key={e.key}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-cream/8 pb-1 text-[13px] last:border-0"
                  >
                    <span className="break-all font-mono text-[12px] text-cream/75">{e.key}</span>
                    <span className="text-cream/55">
                      {estSeauDeVerrou(s.bucket)
                        ? 'verrouillé'
                        : `${e.hits} tentative${e.hits === 1 ? '' : 's'}`}
                      {e.expiresAt ? ` · jusqu’à ${formaterInstant(e.expiresAt)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
    </section>
  );
}
