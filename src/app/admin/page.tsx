// /admin — la console de super-administration.
//
// Le back-office de ce dépôt existait entièrement côté serveur : douze routes
// sous /api/admin/*, toutes gardées par requireAdmin ou requireSuperadmin, et
// toutes auditées par logAdminAction. Il n'y avait simplement aucun écran. Cette
// page est cet écran ; elle n'ajoute AUCUNE règle, elle consomme celles qui
// existent.
//
// Ce que la page ne fait pas, et c'est délibéré : elle ne protège rien. Masquer
// un sélecteur n'empêche personne d'appeler l'API, et la vraie garde est
// `requireSuperadmin` dans la route. Ce qui est caché ici l'est pour ne pas
// proposer une action qui reviendrait en 403 — c'est de l'ergonomie, pas de la
// sécurité, et les deux ne doivent jamais être confondues.
//
// Toute la logique testable vit dans lib/admin/console.ts : il n'y a ni jsdom ni
// Testing Library dans ce dépôt, donc un composant ne peut pas être monté. La
// page reste une enveloppe.
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { AppShell } from '@/components/app/AppShell';
import { Connexions } from '@/components/admin/Connexions';
import { Commandes, Retraits, Journal, Systeme } from '@/components/admin/Surfaces';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import {
  ROLES,
  libelleRole,
  peutChangerLesRoles,
  confirmationChangementRole,
  construireRequeteUtilisateurs,
  messageErreurAdmin,
  formaterDate,
  libelleVerification,
  type RoleAdmin,
  ongletsVisibles,
  demandeReconnexion,
  actionStatut,
  confirmationChangementStatut,
  verifierRaison,
  corpsChangementStatut,
  statutApres,
  messageSuccesStatut,
  libelleStatut,
  tonDuStatut,
  RAISON_MAX,
} from '@/lib/admin/console';
import { Pastille } from '@/components/admin/ListeAdmin';

interface Moi {
  admin: { id: string; email: string; role: string };
  can: readonly string[];
}

interface UtilisateurAdmin {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface Page {
  items: UtilisateurAdmin[];
  nextCursor: string | null;
}

export default function AdminPage() {
  // Redirige vers /connexion quand il n'y a pas de session du tout. Une page
  // d'administration qui affiche un écran vide à un visiteur anonyme ressemble
  // à une panne.
  const utilisateur = useUser('/connexion');

  const [moi, setMoi] = useState<Moi | null>(null);
  const [refuse, setRefuse] = useState(false);
  const [reconnexion, setReconnexion] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // L'onglet courant. 'comptes' par defaut : c'est la surface qui existait
  // avant, et celle qu'on ouvre le plus souvent.
  const [onglet, setOnglet] = useState('comptes');
  const [recherche, setRecherche] = useState('');
  const [filtreRole, setFiltreRole] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // 1. Qui suis-je, et qu'ai-je le droit de faire ? La réponse vient du
  //    serveur ; on ne déduit rien du jeton côté navigateur.
  useEffect(() => {
    if (!utilisateur) return;
    let vivant = true;
    (async () => {
      try {
        const r = await api<Moi>('/admin/me');
        if (vivant) setMoi(r);
      } catch (e) {
        if (!vivant) return;
        // 403 n'est pas une panne : c'est la réponse normale pour un compte
        // sans droits. On le dit comme tel, sans message d'erreur alarmant.
        if (e instanceof ApiError && (e.status === 403 || e.code === 'FORBIDDEN')) setRefuse(true);
        else {
          const code = e instanceof ApiError ? e.code : null;
          const statut = e instanceof ApiError ? e.status : undefined;
          setErreur(messageErreurAdmin(code, statut));
          // Une session morte se répare en se reconnectant, pas en
          // réessayant. L'écran proposait « Réessayez » à quelqu'un dont le
          // jeton avait expiré : le conseil était faux autant que le message.
          setReconnexion(demandeReconnexion(code, statut));
        }
      } finally {
        if (vivant) setChargement(false);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [utilisateur]);

  const charger = useCallback(
    async (cursor?: string | null) => {
      setErreur(null);
      try {
        const chemin = construireRequeteUtilisateurs({
          q: recherche,
          role: filtreRole,
          cursor: cursor ?? null,
          limite: 25,
        });
        const r = await api<Page>(chemin);
        setPage((precedent) =>
          cursor && precedent
            ? { items: [...precedent.items, ...r.items], nextCursor: r.nextCursor }
            : r,
        );
      } catch (e) {
        setErreur(
          messageErreurAdmin(
            e instanceof ApiError ? e.code : null,
            e instanceof ApiError ? e.status : undefined,
          ),
        );
      }
    },
    [recherche, filtreRole],
  );

  // Premier chargement, une fois les droits connus.
  //
  // `charger` est volontairement ABSENT des dépendances : il change à chaque
  // frappe dans le champ de recherche (useCallback dépend de `recherche` et de
  // `filtreRole`), donc l'inclure relancerait une requête par caractère tapé.
  // Le rechargement filtré se fait à la soumission du formulaire.
  //
  // Pas de eslint-disable ici : la règle react-hooks/exhaustive-deps n'est pas
  // chargée dans la config plate de ce dépôt, et désactiver une règle absente
  // est elle-même une erreur ESLint.
  useEffect(() => {
    if (moi) void charger();
  }, [moi]);

  async function changerRole(cible: UtilisateurAdmin, nouveauRole: string) {
    if (!moi || nouveauRole === cible.role) return;

    const confirmation = confirmationChangementRole({
      idActeur: moi.admin.id,
      idCible: cible.id,
      roleActuel: cible.role,
      nouveauRole,
    });
    if (confirmation.requise && !window.confirm(confirmation.message)) return;

    setEnCours(cible.id);
    setErreur(null);
    setSucces(null);
    try {
      await api(`/admin/users/${cible.id}/role`, {
        method: 'PATCH',
        body: { role: nouveauRole },
      });
      setPage((p) =>
        p
          ? {
              ...p,
              items: p.items.map((u) => (u.id === cible.id ? { ...u, role: nouveauRole } : u)),
            }
          : p,
      );
      setSucces(`${cible.email} est désormais ${libelleRole(nouveauRole).toLowerCase()}.`);
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

  // Suspendre ou rétablir un compte.
  //
  // La route existait depuis la phase 5 et n'était joignable que par `curl` ;
  // la liste lisait même `status` sans jamais l'afficher. Toutes les décisions
  // — quelle action proposer, quoi confirmer, quelle borne pour la raison —
  // vivent dans `lib/admin/console.ts` et y sont testées. Cette fonction ne
  // fait qu'enchaîner.
  async function changerStatut(cible: UtilisateurAdmin) {
    if (!moi) return;

    const action = actionStatut({
      can: moi.can,
      roleActeur: moi.admin.role,
      cible,
    });
    if (!action.offerte) return;

    const confirmation = confirmationChangementStatut({
      sens: action.sens,
      idActeur: moi.admin.id,
      cible,
    });
    if (confirmation.requise && !window.confirm(confirmation.message)) return;

    // La raison part dans `AdminAction.metadata`. C'est elle qui répondra
    // « pourquoi ce compte est-il fermé ? » dans six mois, quand plus personne
    // ne s'en souviendra. Facultative côté route, donc facultative ici.
    const saisie = window.prompt(
      `Raison (facultative, ${RAISON_MAX} caractères au plus). Elle sera enregistrée dans le journal d’audit.`,
      '',
    );
    // `null` = dialogue annulé. On n'envoie rien : annuler doit annuler.
    if (saisie === null) return;

    const verifiee = verifierRaison(saisie);
    if (!verifiee.ok) {
      // Vérifié avant l'envoi : le serveur répondrait un VALIDATION_FAILED qui
      // ne nommerait pas le champ fautif.
      setErreur(verifiee.probleme);
      return;
    }

    setEnCours(cible.id);
    setErreur(null);
    setSucces(null);
    try {
      await api(`/admin/users/${cible.id}/status`, {
        method: 'PATCH',
        body: corpsChangementStatut(action.sens, verifiee.raison),
      });
      const nouveau = statutApres(action.sens);
      setPage((p) =>
        p
          ? { ...p, items: p.items.map((u) => (u.id === cible.id ? { ...u, status: nouveau } : u)) }
          : p,
      );
      setSucces(messageSuccesStatut(action.sens, cible.email));
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

  function soumettreRecherche(e: FormEvent) {
    e.preventDefault();
    setPage(null);
    void charger();
  }

  if (!utilisateur) return null;

  const corps = (() => {
    if (chargement) {
      return <p className="text-sm text-cream/60">Vérification de vos droits…</p>;
    }

    if (refuse) {
      return (
        <Alert tone="error">
          Cette console est réservée aux administrateurs. Si vous pensez que c’est une erreur,
          demandez une promotion à un super-administrateur.
        </Alert>
      );
    }

    if (!moi) {
      return (
        <div className="space-y-3">
          <Alert tone="error">{erreur ?? 'Impossible de vérifier vos droits.'}</Alert>
          {reconnexion ? (
            // L'action qui répare, pas celle qui échouera encore.
            <ButtonLink href="/connexion?next=/admin">Se reconnecter</ButtonLink>
          ) : (
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Réessayer
            </Button>
          )}
        </div>
      );
    }

    const modifiable = peutChangerLesRoles(moi.admin.role);

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-cream/10 bg-plum-card/40 px-4 py-3 text-sm">
          <p className="text-cream/80">
            Connecté comme <strong className="text-cream">{moi.admin.email}</strong> —{' '}
            {libelleRole(moi.admin.role)}
          </p>
          {!modifiable && (
            <p className="mt-1 text-cream/60">
              Vous pouvez consulter les comptes. Seul un super-administrateur change les rôles.
            </p>
          )}
        </div>

        <form onSubmit={soumettreRecherche} className="space-y-3">
          <Field
            label="Rechercher"
            name="q"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Adresse e-mail ou nom"
            helper="Laissez vide pour voir les comptes les plus récents."
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-cream/80">
              Rôle
              <select
                value={filtreRole}
                onChange={(e) => setFiltreRole(e.target.value)}
                className="rounded-xl border border-cream/15 bg-plum-deep px-3 py-2 text-cream"
              >
                <option value="">Tous</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {libelleRole(r)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              Filtrer
            </Button>
          </div>
        </form>

        {erreur && <Alert tone="error">{erreur}</Alert>}
        {succes && <Alert tone="success">{succes}</Alert>}

        {page === null ? (
          <p className="text-sm text-cream/60">Chargement des comptes…</p>
        ) : page.items.length === 0 ? (
          <p className="text-sm text-cream/60">Aucun compte ne correspond à cette recherche.</p>
        ) : (
          <ul className="space-y-3">
            {page.items.map((u) => {
              // L'action de statut, ou la raison pour laquelle il n'y en a pas.
              const statut = actionStatut({
                can: moi.can,
                roleActeur: moi.admin.role,
                cible: u,
              });
              return (
                <li
                  key={u.id}
                  className="rounded-2xl border border-cream/10 bg-plum-card/30 px-4 py-3"
                >
                  {/* Le statut était lu dans la réponse et jamais affiché : un
                    compte suspendu était indiscernable d'un compte actif dans
                    la console qui l'avait suspendu. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-cream">{u.email}</p>
                    <Pastille ton={tonDuStatut(u.status)}>{libelleStatut(u.status)}</Pastille>
                  </div>
                  <p className="text-sm text-cream/60">
                    {u.name ?? 'Sans nom'} · inscrit le {formaterDate(u.createdAt)} ·{' '}
                    {libelleVerification(u.emailVerifiedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {modifiable ? (
                      <label className="flex items-center gap-2 text-sm text-cream/80">
                        Rôle
                        <select
                          value={u.role}
                          disabled={enCours === u.id}
                          onChange={(e) => void changerRole(u, e.target.value)}
                          className="rounded-xl border border-cream/15 bg-plum-deep px-3 py-1.5 text-cream disabled:opacity-50"
                        >
                          {ROLES.map((r: RoleAdmin) => (
                            <option key={r} value={r}>
                              {libelleRole(r)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="text-sm text-cream/70">{libelleRole(u.role)}</span>
                    )}
                    {statut.offerte ? (
                      <Button
                        variant="secondary"
                        disabled={enCours === u.id}
                        onClick={() => void changerStatut(u)}
                      >
                        {statut.label}
                      </Button>
                    ) : (
                      // Dire pourquoi, plutôt que de ne rien afficher : un bouton
                      // absent se lit comme une panne.
                      <span className="text-[13px] text-cream/45">{statut.empeche}</span>
                    )}
                    {enCours === u.id && <span className="text-sm text-cream/60">Envoi…</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {page?.nextCursor && (
          <Button variant="secondary" onClick={() => void charger(page.nextCursor)}>
            Charger la suite
          </Button>
        )}
      </div>
    );
  })();

  // Les onglets visibles dépendent des capacités que le SERVEUR annonce.
  // Masquer un onglet ne protège rien — chaque route refait son contrôle — mais
  // évite d'offrir une porte qui reviendrait en 403.
  const onglets = ongletsVisibles(moi?.can);

  return (
    <AppShell active="administration" coupleLabel={null}>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="font-serif text-3xl text-cream">Administration</h1>
          <p className="text-sm text-cream/60">
            Comptes, connexions, commandes et journal. Chaque modification est enregistrée dans le
            journal d’audit.
          </p>
        </header>

        {/* Les onglets n'apparaissent qu'une fois les droits connus : avant,
            on ne sait pas lesquels afficher, et après un refus la page montre
            déjà son message. */}
        {moi && onglets.length > 1 && (
          <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-1.5">
            {onglets.map((o) => {
              const actif = o.id === onglet;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={actif}
                  onClick={() => setOnglet(o.id)}
                  className={`rounded-xl px-3 py-1.5 text-[13px] transition-colors ${
                    actif
                      ? 'bg-gold/15 font-semibold text-gold'
                      : 'text-cream/60 hover:bg-plum-card hover:text-cream'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}

        {!moi && corps}
        {moi && onglet === 'comptes' && corps}
        {moi && onglet === 'connexions' && <Connexions />}
        {moi && onglet === 'commandes' && <Commandes />}
        {moi && onglet === 'retraits' && (
          <Retraits peutAnnuler={moi.can.includes('withdrawals:cancel')} />
        )}
        {moi && onglet === 'journal' && <Journal />}
        {moi && onglet === 'systeme' && <Systeme />}
      </div>
    </AppShell>
  );
}
