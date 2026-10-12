# Inscription & appairage (Espace Couple) — design

Date : 2026-09-03
Statut : Approuvé (brainstorming)
Périmètre PRD : R1 (Espace Couple et appairage), voir `PRD_Coeur_Fidele.md` §9

## Contexte

Cœur Fidèle est construit sur le starter izikit, qui fournit déjà un système
d'authentification complet par email + mot de passe (JWT, cookies, vérification
d'email, OAuth Google). Le PRD original demandait une inscription par numéro de
téléphone + OTP sans mot de passe (§9 R1). Décision produit (validée avec
l'utilisateur) : **on garde l'auth email + mot de passe existante du kit
telle quelle** pour aller plus vite, et on construit l'appairage
("Espace Couple") par-dessus, sans toucher au code d'authentification.

Ce lot de travail couvre uniquement le parcours d'inscription et d'appairage
à deux — pas le moteur de jeu (manches, score), qui fera l'objet d'un lot
séparé.

## Décisions

- **Auth** : email + mot de passe du kit, inchangée. La colonne
  `User.name` reste `String?` en base (pas de migration de schéma sur ce
  champ — les comptes OAuth Google la remplissent déjà automatiquement) ;
  seule la validation Zod de `POST /api/auth/signup` la rend **requise** à
  l'inscription email/mot de passe (`min(1)`), pour ce produit. C'est le
  prénom affiché sur l'écran d'appariement et dans les échanges avec le
  partenaire.
- **Invité sans compte** : le lien d'invitation mène à une inscription
  pré-contextualisée ("Awa t'invite à rejoindre Cœur Fidèle"). Une fois le
  compte créé, l'appairage se fait automatiquement, sans étape manuelle
  supplémentaire.
- **Après appariement** : écran de confirmation simple ("Vous êtes
  appariés !" avec les deux prénoms). Pas de dashboard couple pour l'instant
  — il sera introduit avec le moteur de jeu.
- **Un seul Espace Couple actif par utilisateur**, appliqué au niveau
  applicatif (pas de contrainte DB stricte, car un couple `DISSOLVED` doit
  pouvoir coexister avec un nouveau couple `PENDING`/`ACTIVE` pour le même
  utilisateur).

## Modèle de données

Nouvelle table `Couple` (migration Prisma additive — n'affecte aucune table
existante) :

```prisma
model Couple {
  id              String    @id @default(cuid())
  status          String    @default("PENDING") // PENDING | ACTIVE | DISSOLVED
  creatorId       String
  creator         User      @relation("CoupleCreator", fields: [creatorId], references: [id], onDelete: Restrict)
  partnerId       String?
  partner         User?     @relation("CouplePartner", fields: [partnerId], references: [id], onDelete: Restrict)
  inviteCode      String    @unique
  inviteExpiresAt DateTime
  pairedAt        DateTime?
  dissolvedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([creatorId])
  @@index([partnerId])
  @@index([inviteCode])
}
```

`User` gagne deux relations inverses : `createdCouples Couple[]
@relation("CoupleCreator")` et `joinedCouples Couple[]
@relation("CouplePartner")`.

`inviteCode` : 6 chiffres (`000000`–`999999`, zéro-paddé), conforme au PRD
§9 R1 ("code à 6 chiffres") — généré via `crypto.randomInt` côté serveur,
retry-on-collision (collision rare sur ~1M de valeurs, mais l'unicité DB est
le filet de sécurité). `inviteExpiresAt = createdAt + 7 jours`.

**Contrainte "un seul couple actif"** vérifiée applicativement à la création
et à la jointure : requête `Couple.findFirst` où
`(creatorId = userId OR partnerId = userId) AND status IN (PENDING, ACTIVE)`.
Si trouvé → refus avec un message explicite.

## Endpoints API

Tous sous `frontend/src/app/api/couples/*`, suivant les conventions
existantes du kit (route handlers, `withRequestContext`, zod, `prisma`,
codes d'erreur `{ error, message }`).

### `POST /api/couples` (auth requise)
Crée un Couple. Refuse (409 `ALREADY_IN_COUPLE`) si l'utilisateur est déjà
`creator`/`partner` d'un couple `PENDING`/`ACTIVE`. Génère `inviteCode` +
`inviteExpiresAt`. Réponse `201` :
`{ id, code, inviteUrl, expiresAt }` où `inviteUrl = ${APP_URL}/invite/${code}`.

### `GET /api/couples/me` (auth requise)
Retourne l'état du couple courant de l'utilisateur (ou `{ couple: null }`
s'il n'en a pas) :
- `PENDING` (l'utilisateur est `creator`) → `{ status, code, inviteUrl, expiresAt }`
- `ACTIVE` → `{ status, partnerName, pairedAt }`

Utilisé en polling (toutes les 3s) par l'écran d'attente pour détecter
l'appairage sans WebSocket (portée hors scope pour ce lot — le moteur de jeu
synchronisé, lui, en aura besoin).

### `POST /api/couples/join` (auth requise)
Body `{ code: string }`. Valide le code (existe, `status = PENDING`, non
expiré), refuse si l'utilisateur est le `creator` du couple (ne peut pas
rejoindre son propre couple) ou déjà dans un autre couple actif. Sur succès :
`partnerId = userId`, `status = ACTIVE`, `pairedAt = now()`.

Codes d'erreur : `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_ALREADY_USED`,
`CANNOT_JOIN_OWN_COUPLE`, `ALREADY_IN_COUPLE`.

### `GET /api/invites/[code]` (public, sans auth)
Pour la page `/invite/[code]` affichée avant inscription. Retourne
`{ valid: boolean, creatorName?: string, expired?: boolean }` — ne fuite
aucune donnée sensible (pas d'email, pas d'id interne).

### `POST /api/auth/signup` (existant, étendu)
Le schéma `Body` de la route (actuellement `{ email, password }`) gagne deux
champs : **`name`** (nouveau, requis, `min(1)` — le prénom) et
**`inviteCode`** (nouveau, optionnel). Si `inviteCode` fourni :
- Dans la **même transaction** que la création de l'utilisateur : valider le
  code (existe, `PENDING`, non expiré) ; si valide, appairer immédiatement
  (`partnerId = user.id`, `status = ACTIVE`, `pairedAt = now()`) ; si
  invalide/expiré, **ignorer silencieusement** (le compte est quand même
  créé — ne jamais faire échouer un signup à cause d'un lien d'invitation
  périmé).
- Aucun changement au contrat de réponse anti-énumération (D-22) : la route
  retourne toujours `{ ok: true }` en 201, que l'email soit nouveau ou non,
  et que l'appairage ait eu lieu ou non.
- La branche "email existant" (D-22, réponse identique mais aucune écriture)
  n'effectue **pas** d'appairage — un utilisateur qui a déjà un compte doit
  se connecter puis utiliser `POST /api/couples/join`.

## Écrans (`frontend/src/app/*`)

Thème visuel identique à la landing page (`ink`/`cream`/`gold`, polices
Instrument Serif + Familjen Grotesk, déjà configurées dans
`tailwind.config.ts`). Structure de formulaire/appels API alignée sur
`examples/frontend-pages/{signup,login}.tsx` (helper `@/lib/api`, `ApiError`,
`useAuth()` de `@/contexts/AuthContext`), mais restylée — pas de classes
`gray-*` génériques.

1. **`/inscription`** — email, mot de passe, prénom (`name`, requis, min 1
   caractère). Si l'URL porte `?invite=CODE` : au montage, appelle
   `GET /api/invites/[code]` et affiche un bandeau "*{creatorName} t'invite à
   rejoindre Cœur Fidèle*" (ou un état "lien expiré" si `expired: true` —
   l'inscription reste possible, juste sans appairage automatique). Le
   `inviteCode` est transmis à `POST /api/auth/signup`. Après succès →
   redirection `/verify-email?email=...` (flow email inchangé).

2. **`/connexion`** — reprend le pattern existant (`examples/frontend-pages/login.tsx`),
   restylé.

3. **`/couple/creer`** — accessible uniquement authentifié. Au montage,
   appelle `GET /api/couples/me` :
   - `null` → affiche un CTA unique "Créer notre Espace Couple" →
     `POST /api/couples` → redirection `/couple/attente`
   - `PENDING` → redirection directe `/couple/attente` (reprise après
     fermeture du navigateur)
   - `ACTIVE` → redirection directe `/couple/apparies`

4. **`/couple/attente`** — affiche le lien d'invitation (bouton copier) et le
   code à 6 chiffres, plus un bouton "Relancer sur WhatsApp"
   (`https://wa.me/?text=...` avec le lien encodé). Poll `GET /api/couples/me`
   toutes les 3s ; dès que `status === 'ACTIVE'`, redirection
   `/couple/apparies`.

5. **`/couple/apparies`** — confirmation "Vous êtes appariés !" avec les deux
   prénoms (le sien via `useAuth()`, celui du partenaire via
   `GET /api/couples/me`). Pas de navigation ultérieure pour ce lot (le
   moteur de jeu n'existe pas encore) — écran terminal.

6. **`/invite/[code]`** — page publique (pas d'auth requise). Appelle
   `GET /api/invites/[code]` :
   - valide → "{creatorName} t'invite à rejoindre Cœur Fidèle" + CTA
     "Rejoindre" → `/inscription?invite=CODE`. Si l'utilisateur est déjà
     connecté (cookie présent), le CTA appelle directement
     `POST /api/couples/join` au lieu de renvoyer vers l'inscription.
   - invalide/expiré → écran "Ce lien a expiré, demande à ton/ta partenaire
     de t'en envoyer un nouveau."

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| Code invalide ou expiré (`/invite/[code]`, `/couple/join`) | Message clair, pas de redirection automatique, jamais de blocage du reste du produit |
| Utilisateur déjà dans un couple actif tente `POST /api/couples` ou `/join` | 409 `ALREADY_IN_COUPLE`, message explicite côté UI |
| Tentative de rejoindre son propre couple | 400 `CANNOT_JOIN_OWN_COUPLE` |
| Signup avec `inviteCode` périmé | Compte créé normalement, appairage ignoré silencieusement (pas d'erreur visible) |
| Polling `/couple/attente` échoue (réseau) | Retry silencieux, pas de message d'erreur intrusif tant que le compte utilisateur reste valide |

## Hors périmètre (ce lot)

- Moteur de jeu, manches, score (lot séparé)
- Dashboard couple post-appariement
- Dissolution d'un Espace Couple (`DISSOLVED`) — la colonne existe dans le
  schéma pour anticiper, mais aucun endpoint ne l'expose encore
- Notification push/SMS au partenaire (le partage reste manuel via WhatsApp)
- WebSocket temps réel (le polling REST suffit pour l'attente d'appairage)

## Vérification

- `pnpm typecheck && pnpm lint && pnpm test` verts
- Migration Prisma appliquée sur Neon (`pnpm db:migrate:dev` en local puis
  `deploy`)
- Parcours manuel bout en bout : créer un compte A → créer un Espace Couple →
  copier le lien → l'ouvrir dans une fenêtre privée → créer un compte B via
  le lien → vérifier l'email de B → se connecter → arriver sur
  `/couple/apparies` avec les deux prénoms ; vérifier aussi le flow "compte B
  existe déjà" via `/couple/join` avec le code saisi manuellement
