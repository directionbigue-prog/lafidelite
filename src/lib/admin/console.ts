// Les décisions de la console d'administration, hors de tout composant.
//
// Pourquoi ce module existe : ce dépôt n'a ni jsdom ni Testing Library, donc
// rien ne peut être monté. La règle de CLAUDE.md est que la logique d'un écran
// vit dans un module pur, testé directement, et que la page n'en est qu'une
// enveloppe. Ce qui est ici est précisément ce qu'on aurait envie de vérifier
// en cliquant : qui a le droit de quoi, ce que vaut un code d'erreur, et quelle
// requête part vers l'API.
//
// Principe de fond : CE MODULE NE GARDE RIEN. Les routes `/api/admin/*` passent
// toutes par `requireAdmin` ou `requireSuperadmin` côté serveur. Tout ce qui est
// décidé ici sert à ne pas proposer une action qui sera refusée, et à expliquer
// un refus quand il arrive. Masquer un bouton n'est pas une protection, et ce
// fichier ne prétend pas en être une.

export type RoleAdmin = 'USER' | 'ADMIN' | 'SUPERADMIN';

export const ROLES: readonly RoleAdmin[] = ['USER', 'ADMIN', 'SUPERADMIN'] as const;

const LIBELLES: Record<RoleAdmin, string> = {
  USER: 'Utilisateur',
  ADMIN: 'Administrateur',
  SUPERADMIN: 'Super-administrateur',
};

/** Le rôle en français, pour l'affichage. */
export function libelleRole(role: string): string {
  return LIBELLES[role as RoleAdmin] ?? role;
}

/** USER < ADMIN < SUPERADMIN. Sert à comparer, jamais à autoriser. */
export function rangRole(role: string): number {
  const i = ROLES.indexOf(role as RoleAdmin);
  return i === -1 ? -1 : i;
}

export function estRoleConnu(role: string): role is RoleAdmin {
  return rangRole(role) !== -1;
}

/**
 * La console propose-t-elle de changer les rôles ?
 *
 * Seul un SUPERADMIN le peut — `PATCH /api/admin/users/[id]/role` appelle
 * `requireSuperadmin`. Un ADMIN lit les utilisateurs (il a `users:read`) mais
 * toute tentative de sa part reviendrait en 403 ; autant ne pas lui montrer le
 * sélecteur plutôt que de lui offrir un bouton qui échoue.
 */
export function peutChangerLesRoles(roleActeur: string): boolean {
  return roleActeur === 'SUPERADMIN';
}

/**
 * Faut-il proposer un lien vers la console dans la navigation ?
 *
 * La console a été livrée le 02/10/2026 sans AUCUN lien depuis le produit :
 * elle existait à `/admin` et on ne pouvait y arriver qu'en tapant l'URL.
 * Un écran qu'on ne peut pas atteindre n'est pas livré.
 *
 * Même logique que `peutChangerLesRoles`, et même portée : cette fonction ne
 * garde rien. `GET /api/admin/me` passe par `requireAdmin`, donc un USER qui
 * tape l'URL voit l'écran répondre « accès refusé » exactement comme avant.
 * On masque le lien pour ne pas proposer une porte qui renverrait un 403 —
 * c'est de l'ergonomie, pas de la sécurité. Ne jamais déplacer un contrôle
 * d'une route vers cette décision.
 *
 * Un rôle inconnu ou absent n'ouvre rien : la valeur peut venir d'une réponse
 * mise en cache, et l'inconnu ne doit jamais se lire comme un privilège.
 */
export function peutVoirLaConsole(roleActeur: string | null | undefined): boolean {
  return roleActeur === 'ADMIN' || roleActeur === 'SUPERADMIN';
}

export interface Confirmation {
  /** Faut-il demander confirmation avant d'envoyer ? */
  requise: boolean;
  /** Le texte à montrer. Vide quand aucune confirmation n'est requise. */
  message: string;
}

/**
 * Faut-il prévenir avant d'appliquer ce changement de rôle ?
 *
 * Le serveur refuse une seule chose : rétrograder le DERNIER super-administrateur
 * (409 `LAST_SUPERADMIN`). Il ne refuse pas que vous vous rétrogradiez vous-même
 * alors qu'un autre existe — et c'est pourtant l'action qui vous ferme la porte
 * de cette console, immédiatement et sans recours depuis l'interface : il
 * faudrait relancer `pnpm db:make-superadmin` en ligne de commande.
 *
 * D'où cet avertissement, qui n'est pas une garde : il informe, le serveur
 * décide.
 */
export function confirmationChangementRole(args: {
  idActeur: string;
  idCible: string;
  roleActuel: string;
  nouveauRole: string;
}): Confirmation {
  const { idActeur, idCible, roleActuel, nouveauRole } = args;

  if (roleActuel === nouveauRole) {
    return { requise: false, message: '' };
  }

  const surSoiMeme = idActeur === idCible;
  const perdLAcces = surSoiMeme && roleActuel === 'SUPERADMIN' && nouveauRole !== 'SUPERADMIN';

  if (perdLAcces) {
    return {
      requise: true,
      message:
        'Vous êtes sur le point de retirer VOTRE propre statut de super-administrateur. ' +
        'Vous perdrez l’accès à cette console immédiatement, et seule la ligne de commande ' +
        '(pnpm db:make-superadmin) pourra vous le rendre. Continuer ?',
    };
  }

  if (nouveauRole === 'SUPERADMIN') {
    return {
      requise: true,
      message:
        'Un super-administrateur peut changer les rôles de tout le monde, y compris le vôtre. ' +
        'Confirmer la promotion ?',
    };
  }

  return { requise: false, message: '' };
}

export interface FiltresUtilisateurs {
  q?: string | undefined;
  role?: string | undefined;
  cursor?: string | null | undefined;
  limite?: number | undefined;
}

/**
 * La chaîne de requête pour `GET /api/admin/users`.
 *
 * Les paramètres vides sont OMIS, pas envoyés vides. La route lit
 * `url.searchParams.get('role')` et le passe tel quel au `where` de Prisma :
 * `?role=` vaudrait filtrer sur la chaîne vide et ne rien retourner, en
 * ressemblant à « aucun utilisateur » plutôt qu'à une erreur.
 */
export function construireRequeteUtilisateurs(f: FiltresUtilisateurs = {}): string {
  const p = new URLSearchParams();
  const q = f.q?.trim();
  if (q) p.set('q', q.slice(0, 200));
  if (f.role && estRoleConnu(f.role)) p.set('role', f.role);
  if (f.cursor) p.set('cursor', f.cursor);
  if (typeof f.limite === 'number' && Number.isFinite(f.limite)) {
    p.set('limit', String(Math.trunc(f.limite)));
  }
  const s = p.toString();
  return s ? `/admin/users?${s}` : '/admin/users';
}

const MESSAGES: Record<string, string> = {
  LAST_SUPERADMIN:
    'Refusé : c’est le dernier super-administrateur. Promouvez quelqu’un d’autre avant de le rétrograder.',
  USER_NOT_FOUND: 'Ce compte n’existe plus. Rechargez la liste.',
  // Volontairement générique depuis le 03/10/2026. Ce message disait « Le rôle
  // demandé n'est pas reconnu », ce qui était vrai tant que le changement de
  // rôle était la seule mutation de la console. La suspension répond le MÊME
  // code quand la raison dépasse 500 caractères, et le message aurait alors
  // parlé d'un rôle que personne n'avait touché. `verifierRaison` attrape ce
  // cas avant l'envoi ; celui-ci ne couvre plus que l'imprévu.
  VALIDATION_FAILED: 'Cette demande a été refusée : une valeur envoyée n’est pas acceptée.',
  RESTORE_REQUIRES_SUPERADMIN: 'Seul un super-administrateur peut rétablir un compte suspendu.',
  SUSPEND_REQUIRES_SUPERADMIN:
    'Seul un super-administrateur peut suspendre un super-administrateur.',
  FORBIDDEN: 'Votre rôle ne permet pas cette action.',
  UNAUTHORIZED: 'Votre session a expiré. Reconnectez-vous.',
  RATE_LIMITED: 'Trop d’actions en peu de temps. Patientez un instant.',

  // ─── Ce que les gardes envoient VRAIMENT ───────────────────────────────
  //
  // Mesuré le 03/10/2026 sur la console en production, qui affichait
  // « L’action a échoué. Réessayez. » sans rien dire de plus.
  //
  // `middleware/index.ts` n'émet pas de codes stables pour l'authentification :
  // il met de la PROSE ANGLAISE dans le champ `error` — « Missing token »,
  // « Session expired », « Account not found ». La table ci-dessus mappait
  // `UNAUTHORIZED`, que le serveur n'envoie jamais, donc TOUT 401 retombait
  // sur la phrase générique. Un écran d'administration qui cache le motif de
  // son échec est inutilisable : on ne sait pas s'il faut se reconnecter,
  // patienter, ou prévenir quelqu'un.
  //
  // On les mappe ICI plutôt que de les corriger côté serveur : `middleware/
  // index.ts` est dans la liste des fichiers protégés de CLAUDE.md, et ces
  // chaînes sont consommées par toutes les routes. Les changer serait une
  // modification de contrat pour une question d'affichage.
  'Missing token': 'Votre session a expiré. Reconnectez-vous.',
  'Invalid or expired token': 'Votre session a expiré. Reconnectez-vous.',
  'Session expired': 'Votre session a expiré. Reconnectez-vous.',
  'Account not found': 'Ce compte n’existe plus. Reconnectez-vous.',
  ADMIN_REQUIRED: 'Votre compte n’a pas les droits d’administration.',
  TOO_MANY_REQUESTS: 'Trop d’actions en peu de temps. Patientez un instant.',
  RATE_LIMIT_BACKEND_UNAVAILABLE:
    'Le service de limitation est indisponible, et la console refuse de s’ouvrir sans lui. Réessayez dans un instant.',

  // Multi-tenancy : câblée dans la couche héritée, inutilisée par ce produit —
  // l'unité de tenance ici est le Couple, pas une organisation. Ces deux codes
  // ne peuvent donc pas atteindre la console aujourd'hui. Ils sont traduits
  // quand même : le test lit les codes DANS la source des gardes, et une
  // exception ouverte pour deux chaînes rouvrirait la porte à la suivante.
  'Organization not found': 'Cette organisation n’existe pas, ou vous n’en faites pas partie.',
  ORG_ROLE_INSUFFICIENT: 'Votre rôle dans cette organisation ne permet pas cette action.',
};

/** Le dernier recours : dire au moins ce que le serveur a répondu. */
const PAR_STATUT: Record<number, string> = {
  401: 'Votre session a expiré. Reconnectez-vous.',
  403: 'Votre rôle ne permet pas cette action.',
  404: 'Cette ressource n’existe plus.',
  429: 'Trop d’actions en peu de temps. Patientez un instant.',
  500: 'Le serveur a rencontré une erreur. Réessayez dans un instant.',
  502: 'Le serveur est momentanément injoignable.',
  503: 'Le service est momentanément indisponible.',
  504: 'Le serveur a mis trop de temps à répondre.',
};

/**
 * Le code de l'API en français.
 *
 * On bascule sur `ApiError.code`, jamais sur le message : les messages du
 * serveur sont en anglais et destinés aux journaux. `LAST_SUPERADMIN` dit
 * « Refuse to demote the last SUPERADMIN. », ce qu'on ne montre à personne.
 *
 * `statut` est le second recours, et il compte autant que le premier : un
 * code inconnu ne doit pas effacer l'information qu'on a. Le dernier recours
 * NOMME le statut plutôt que de dire « réessayez » — un écran qui annonce
 * « erreur 503 » se diagnostique ; un écran qui dit « réessayez » ne se
 * diagnostique pas, et c'est exactement ce qui a coûté une session à
 * comprendre le 03/10.
 */
export function messageErreurAdmin(code: string | undefined | null, statut?: number): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (statut && PAR_STATUT[statut]) return PAR_STATUT[statut];
  if (statut) return `L’action a échoué (erreur ${statut}). Réessayez.`;
  return 'L’action a échoué. Réessayez.';
}

/** Faut-il proposer de se reconnecter ? */
export function demandeReconnexion(code: string | undefined | null, statut?: number): boolean {
  if (statut === 401) return true;
  return (
    code === 'Missing token' ||
    code === 'Invalid or expired token' ||
    code === 'Session expired' ||
    code === 'Account not found' ||
    code === 'UNAUTHORIZED'
  );
}

/** Date courte et lisible, ou un tiret quand il n'y a rien. */
export function formaterDate(valeur: string | Date | null | undefined): string {
  if (!valeur) return '—';
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  const deuxChiffres = (n: number) => String(n).padStart(2, '0');
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** « Vérifié le 02/10/2026 » ou « Jamais vérifié ». */
export function libelleVerification(emailVerifiedAt: string | null | undefined): string {
  return emailVerifiedAt ? `Vérifié le ${formaterDate(emailVerifiedAt)}` : 'Jamais vérifié';
}

// ─────────────────────────────────────────────────────────────────────────
// Les onglets de la console.
//
// Douze routes d'administration existaient ; deux seulement avaient un écran.
// Les autres — commandes, retraits, journal d'audit, outbox, file d'e-mails,
// limiteurs — répondaient correctement et n'étaient visibles de nulle part.
// ─────────────────────────────────────────────────────────────────────────

export interface Onglet {
  id: string;
  label: string;
  /**
   * La capacité que `/api/admin/me` doit annoncer pour afficher l'onglet, ou
   * `null` quand être administrateur suffit.
   *
   * On NE CRÉE PAS de nouvelle capacité : la liste est verrouillée par
   * `me/route.test.ts` (exactement 8 pour ADMIN, 11 pour SUPERADMIN) et
   * CLAUDE.md la déclare contractuelle. L'onglet « Connexions » se contente
   * donc d'être réservé aux administrateurs, ce que sa route exige déjà.
   */
  capacite: string | null;
}

export const ONGLETS: readonly Onglet[] = [
  { id: 'comptes', label: 'Comptes', capacite: 'users:read' },
  { id: 'connexions', label: 'Connexions', capacite: null },
  { id: 'commandes', label: 'Commandes', capacite: 'orders:read' },
  { id: 'retraits', label: 'Retraits', capacite: 'withdrawals:read' },
  { id: 'journal', label: 'Journal d’audit', capacite: 'audit-log:read' },
  { id: 'systeme', label: 'Système', capacite: 'outbox:read' },
] as const;

/**
 * Les onglets qu'un administrateur donné peut voir.
 *
 * Comme le reste de ce module, CELA NE GARDE RIEN : chaque route refait son
 * contrôle. Masquer un onglet évite d'offrir une porte qui reviendrait en 403.
 */
export function ongletsVisibles(can: readonly string[] | undefined): Onglet[] {
  const capacites = new Set(can ?? []);
  return ONGLETS.filter((o) => o.capacite === null || capacites.has(o.capacite));
}

export function estOnglet(id: string | null | undefined): boolean {
  return ONGLETS.some((o) => o.id === id);
}

/**
 * `9900` + `XOF` → « 9 900 FCFA ».
 *
 * Les montants sont des ENTIERS dans la plus petite unité (CLAUDE.md : « FCFA
 * = pas de décimales »). Les diviser par 100 « pour faire joli » afficherait
 * un centième du vrai prix sur un écran d'administration financier.
 *
 * Le séparateur est une espace fine insécable posée à la main, pour la même
 * raison que sur /tarifs : ICU varie selon la version de Node, et un prix
 * coupé en fin de ligne se lit comme deux nombres.
 */
export function montantLisible(montant: number, devise?: string | null): string {
  const groupe = String(Math.trunc(montant)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  const libelle = !devise || devise === 'XOF' ? 'FCFA' : devise;
  return `${groupe} ${libelle}`;
}

/** La couleur d'une pastille de statut. */
export type TonStatut = 'neutre' | 'succes' | 'attente' | 'echec';

const TONS: Record<string, TonStatut> = {
  // Commandes
  PENDING: 'attente',
  PAID: 'succes',
  EXPIRED: 'neutre',
  FAILED: 'echec',
  REFUNDED: 'neutre',
  // Retraits
  PROCESSING: 'attente',
  COMPLETED: 'succes',
  CANCELLED: 'neutre',
  // Outbox et file d'e-mails
  SENT: 'succes',
  DEAD: 'echec',
  // Comptes
  ACTIVE: 'succes',
  SUSPENDED: 'echec',
};

export function tonDuStatut(statut: string | null | undefined): TonStatut {
  return TONS[statut ?? ''] ?? 'neutre';
}

const LIBELLES_STATUT: Record<string, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  EXPIRED: 'Expirée',
  FAILED: 'Échouée',
  REFUNDED: 'Remboursée',
  PROCESSING: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  SENT: 'Envoyé',
  DEAD: 'Abandonné',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
};

export function libelleStatut(statut: string | null | undefined): string {
  if (!statut) return '—';
  return LIBELLES_STATUT[statut] ?? statut;
}

/**
 * Une chaîne de requête, à partir de filtres dont beaucoup seront vides.
 *
 * Généralise `construireRequeteUtilisateurs`, qui reste pour les comptes :
 * les quatre nouvelles listes partagent le même besoin — n'envoyer que ce qui
 * est renseigné. Un `?status=&cursor=` serait interprété comme un filtre sur
 * la chaîne vide par certaines routes.
 */
export function construireRequete(
  base: string,
  filtres: Record<string, string | number | null | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    const v = typeof valeur === 'number' ? String(valeur) : valeur?.trim();
    if (v) p.set(cle, v);
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Date ET heure — un journal d'audit sans heure ne sert à rien. */
export function formaterInstant(valeur: string | Date | null | undefined): string {
  if (!valeur) return '—';
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  const n = (x: number) => String(x).padStart(2, '0');
  return `${n(d.getDate())}/${n(d.getMonth() + 1)}/${d.getFullYear()} ${n(d.getHours())}:${n(d.getMinutes())}`;
}

/**
 * Raccourcit un identifiant pour l'affichage, sans le rendre ambigu.
 *
 * Les `cuid` font 25 caractères et remplissent une colonne entière pour une
 * information qu'on ne lit jamais en entier. On garde les huit derniers, qui
 * sont la partie aléatoire — garder les premiers afficherait le même préfixe
 * sur toutes les lignes.
 */
export function identifiantCourt(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length <= 10 ? id : `…${id.slice(-8)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Suspendre ou rétablir un compte.
//
// POURQUOI CECI ARRIVE APRÈS LE RESTE. `PATCH /api/admin/users/[id]/status`
// existe depuis la phase 5, est gardée, auditée et testée — et n'avait AUCUN
// écran jusqu'au 03/10/2026. Pire, la liste des comptes lisait déjà `status`
// dans sa réponse sans jamais l'afficher : un compte suspendu était
// indiscernable d'un compte actif dans la console qui l'avait suspendu. Le
// seul moyen de suspendre quelqu'un était un `curl`.
//
// CE QUE LA SUSPENSION FAIT RÉELLEMENT, et qui justifie les avertissements
// ci-dessous : `status: 'SUSPENDED'` fait répondre 403 ACCOUNT_SUSPENDED à
// `/api/auth/login` ET à `/api/auth/refresh`. Elle ne retire pas un droit,
// elle retire l'authentification.
//
// LE PIÈGE QUI N'A PAS D'ÉQUIVALENT AILLEURS. Le serveur refuse de rétrograder
// le DERNIER super-administrateur, mais cette garde ne regarde que `User.role`
// — jamais `status`. Et `scripts/make-superadmin.ts` n'écrit QUE `role` :
// vérifié, il ne touche jamais `status`. Un administrateur qui se suspend
// lui-même est donc déconnecté immédiatement, et aucune commande de ce dépôt
// ne peut le rétablir — il faut un accès direct à la base. C'est plus grave
// que l'auto-rétrogradation, que `pnpm db:make-superadmin` répare.
// ─────────────────────────────────────────────────────────────────────────

export type SensStatut = 'suspendre' | 'retablir';

/** La borne du champ `reason` de la route : `z.string().min(1).max(500)`. */
export const RAISON_MAX = 500;

export interface ActionStatut {
  /** Déduit du statut actuel : on n'offre jamais l'action déjà appliquée. */
  sens: SensStatut;
  label: string;
  /** Proposable ? */
  offerte: boolean;
  /**
   * Pourquoi elle ne l'est pas. Dire la raison vaut mieux que ne rien
   * afficher : un bouton absent se lit comme une panne.
   */
  empeche: string;
}

/**
 * L'action de statut offerte sur une ligne, ou pourquoi aucune ne l'est.
 *
 * Lit les capacités que le SERVEUR annonce (`/api/admin/me`) plutôt que de
 * redéduire les règles depuis le rôle : cette liste est le contrat, et deux
 * copies d'une règle divergent. `users:status:suspend` est accordée à ADMIN et
 * à SUPERADMIN, `users:status:restore` au seul SUPERADMIN.
 *
 * Ne garde rien, comme le reste de cette console : chaque route refait son
 * contrôle. On évite seulement d'offrir une porte qui reviendrait en 403.
 */
export function actionStatut(args: {
  can: readonly string[] | undefined;
  roleActeur: string;
  cible: { role: string; status: string };
}): ActionStatut {
  const { can, roleActeur, cible } = args;
  const capacites = can ?? [];

  if (cible.status === 'SUSPENDED') {
    const offerte = capacites.includes('users:status:restore');
    return {
      sens: 'retablir',
      label: 'Rétablir',
      offerte,
      empeche: offerte ? '' : 'Seul un super-administrateur rétablit un compte suspendu.',
    };
  }

  if (!capacites.includes('users:status:suspend')) {
    return {
      sens: 'suspendre',
      label: 'Suspendre',
      offerte: false,
      empeche: 'Votre rôle ne permet pas de suspendre un compte.',
    };
  }

  // CR-01 côté serveur : suspendre un SUPERADMIN exige un acteur SUPERADMIN.
  // Sans cela un ADMIN fermerait d'un seul PATCH tous les comptes au-dessus de
  // lui, en contournant la garde du dernier super-administrateur — qui ne
  // regarde que le rôle.
  if (cible.role === 'SUPERADMIN' && roleActeur !== 'SUPERADMIN') {
    return {
      sens: 'suspendre',
      label: 'Suspendre',
      offerte: false,
      empeche: 'Seul un super-administrateur peut suspendre un super-administrateur.',
    };
  }

  return { sens: 'suspendre', label: 'Suspendre', offerte: true, empeche: '' };
}

/**
 * Faut-il prévenir avant d'appliquer ce changement de statut ?
 *
 * Toujours — contrairement au changement de rôle, où une promotion banale
 * passe sans question. Une suspension coupe l'accès de quelqu'un d'autre et un
 * rétablissement le rouvre : aucune des deux n'est une action qu'on veut
 * déclencher d'un clic malheureux dans une liste.
 */
export function confirmationChangementStatut(args: {
  sens: SensStatut;
  idActeur: string;
  cible: { id: string; email: string };
}): Confirmation {
  const { sens, idActeur, cible } = args;

  if (sens === 'retablir') {
    return {
      requise: true,
      message: `Rétablir ${cible.email} ? Ce compte pourra se reconnecter immédiatement.`,
    };
  }

  if (idActeur === cible.id) {
    return {
      requise: true,
      message:
        'Vous êtes sur le point de suspendre VOTRE PROPRE compte. Vous serez déconnecté ' +
        'immédiatement et vous ne pourrez plus vous reconnecter : la suspension refuse la ' +
        'connexion ET le rafraîchissement de session. Aucune commande de ce dépôt ne peut la ' +
        'lever — pnpm db:make-superadmin ne change que le rôle. Il faudrait un accès direct à ' +
        'la base de données. Continuer ?',
    };
  }

  return {
    requise: true,
    message:
      `Suspendre ${cible.email} ? Ce compte ne pourra plus se connecter ni prolonger sa ` +
      'session. Les parties déjà jouées ne sont pas supprimées.',
  };
}

export type RaisonVerifiee = { ok: true; raison?: string } | { ok: false; probleme: string };

/**
 * Vérifie la raison AVANT l'envoi, parce que le serveur la refuse sèchement.
 *
 * `z.string().min(1).max(500)` produit un `VALIDATION_FAILED` qui ne dit pas
 * quel champ a fauté. Vérifier ici évite un aller-retour dont le message
 * n'expliquerait rien — même raison que pour le code à huit caractères de
 * `/verify-email`.
 *
 * Une raison vide est licite : le champ est optionnel côté route. On l'OMET
 * alors, plutôt que d'envoyer une chaîne vide que `min(1)` rejetterait.
 *
 * Pas de troncature silencieuse : couper à 500 caractères changerait ce qui
 * s'écrit dans le journal d'audit sans que personne ne le sache, et ce journal
 * est ce qui répond « qui a fait quoi, quand » pendant un incident.
 */
export function verifierRaison(brut: string | null | undefined): RaisonVerifiee {
  const raison = (brut ?? '').trim();
  if (raison.length === 0) return { ok: true };
  if (raison.length > RAISON_MAX) {
    return {
      ok: false,
      probleme: `La raison fait ${raison.length} caractères ; ${RAISON_MAX} au maximum.`,
    };
  }
  return { ok: true, raison };
}

/** Le corps attendu par `PATCH /api/admin/users/[id]/status`. */
export function corpsChangementStatut(
  sens: SensStatut,
  raison?: string | undefined,
): { status: 'ACTIVE' | 'SUSPENDED'; reason?: string } {
  const status = sens === 'suspendre' ? ('SUSPENDED' as const) : ('ACTIVE' as const);
  return raison ? { status, reason: raison } : { status };
}

/** Le statut obtenu après l'action, pour mettre la ligne à jour sans recharger. */
export function statutApres(sens: SensStatut): 'ACTIVE' | 'SUSPENDED' {
  return corpsChangementStatut(sens).status;
}

export function messageSuccesStatut(sens: SensStatut, email: string): string {
  return sens === 'suspendre'
    ? `${email} est suspendu et ne peut plus se connecter.`
    : `${email} est rétabli et peut se reconnecter.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Les limiteurs de débit.
//
// `GET /api/admin/rate-limits` était la dernière des douze routes sans écran.
// Elle sert un seul usage, et c'est un usage d'incident : quelqu'un dit « je
// n'arrive plus à me connecter », et il faut savoir si c'est un verrou de
// sécurité ou une panne. Sans écran, la réponse demandait un `curl` avec un
// cookie d'administrateur valide — c'est-à-dire qu'on ne la cherchait pas.
//
// La réponse n'est PAS une liste paginée : c'est un résumé par seau, avec les
// dix clés les plus chaudes. Elle ne passe donc pas par `ListeAdmin`.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Les sept seaux, en français.
 *
 * Les clés sont celles que la route déclare dans son tableau `BUCKETS` ; le
 * test les relit dans la source plutôt que de les recopier, parce qu'un seau
 * renommé laisserait ici un libellé orphelin et afficherait un identifiant
 * technique à sa place, sans que rien n'échoue.
 */
const SEAUX: Record<string, string> = {
  'auth:login': 'Connexion',
  'auth:signup': 'Inscription',
  'auth:verify': 'Vérification de l’e-mail',
  'auth:forgot': 'Mot de passe oublié',
  'auth:reset': 'Réinitialisation du mot de passe',
  'auth:pin': 'Code de retrait',
  lockout: 'Comptes verrouillés',
};

export function libelleSeau(seau: string): string {
  return SEAUX[seau] ?? seau;
}

/**
 * Ce qu'un seau verrouillé veut dire pour la personne concernée.
 *
 * `lockout` n'est pas un compteur mais un drapeau : la clé existe, donc le
 * compte est fermé jusqu'à l'expiration. C'est la seule ligne de cet écran qui
 * demande une action humaine, et elle mérite de le dire.
 */
export function estSeauDeVerrou(seau: string): boolean {
  return seau === 'lockout';
}

export interface EtatLimiteurs {
  /** Y a-t-il quelque chose à montrer ? */
  utilisable: boolean;
  /** Le message à afficher à sa place. Vide quand il y a des données. */
  message: string;
}

/**
 * Interprète la réponse avant de l'afficher.
 *
 * Trois cas se ressemblent à l'écran et ne veulent pas dire la même chose, et
 * la route le dit explicitement : « Caller must read this gracefully ». Sans
 * cette distinction, un Redis non configuré s'afficherait comme « aucune
 * tentative », c'est-à-dire comme une bonne nouvelle.
 */
export function etatDesLimiteurs(reponse: {
  buckets?: readonly { totalKeys: number }[];
  note?: string;
}): EtatLimiteurs {
  if (reponse.note) {
    return {
      utilisable: false,
      message:
        'Les limiteurs ne sont pas mesurables : Redis n’est pas configuré sur cet ' +
        'environnement. Ce n’est pas une absence de tentatives.',
    };
  }
  const seaux = reponse.buckets ?? [];
  if (seaux.length === 0) {
    return { utilisable: false, message: 'Aucun seau n’a été renvoyé.' };
  }
  if (seaux.every((s) => s.totalKeys === 0)) {
    return {
      utilisable: false,
      message: 'Aucune tentative en cours de comptage, et aucun compte verrouillé.',
    };
  }
  return { utilisable: true, message: '' };
}
