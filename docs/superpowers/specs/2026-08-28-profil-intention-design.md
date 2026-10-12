# Profil & intention — design

**Date :** 2026-08-28
**Statut :** Approuvé (brainstorming), prêt pour plan d'implémentation
**Sous-projet 1/8 du PRD Cœur Fidèle** (voir décomposition ci-dessous)

## Contexte

Le PRD complet de Cœur Fidèle (plateforme de rencontre orientée relation sérieuse/mariage,
construite sur le starter `izikit` — Next.js 16 + Prisma + Neon) décrit un produit qui couvre
plusieurs sous-systèmes indépendants. Il a été décomposé en 8 chantiers, à brainstormer et
implémenter un par un :

1. **Profil & intention** ← ce document
2. Vérification photo/identité
3. Moteur de compatibilité (règles)
4. Mise en relation mutuelle
5. Messagerie sécurisée
6. Modération (signalement, file admin)
7. Abonnement & paiement
8. Conformité RGPD (export/suppression de données)

Le kit fournit déjà : auth complète (signup/login/vérif email/reset password), rôles,
statut de compte (ACTIVE/SUSPENDED), upload Cloudinary (`FileUpload`), notifications,
journal d'audit admin (`AdminAction`). Rien n'existe encore côté domaine rencontre.

`Order`/`Withdrawal` existants sont taillés pour un marketplace mobile money (Bictorys,
Wave/Orange Money, XOF) — probablement pas réutilisables tels quels pour un abonnement
récurrent (sous-projet 7, à traiter séparément).

## Décisions prises pendant le brainstorming

- **Genre/orientation** : modèle binaire homme/femme, matching hétérosexuel uniquement.
- **Intention** : une seule valeur implicite (positionnement de la plateforme, pas un
  filtre) — pas de champ à plusieurs niveaux.
- **Champs « critères de fond » retenus** : enfants (a des enfants + en veut), religion +
  pratique religieuse, situation familiale actuelle, niveau d'études + profession.
- **Photos** : 1 à 6 par profil, au moins 1 obligatoire avant d'apparaître dans les
  suggestions (la logique de suggestion elle-même est hors scope — sous-projet 3).
- **Onboarding** : assistant en plusieurs étapes obligatoire après vérification email ;
  rien d'autre n'est accessible tant qu'il n'est pas terminé.
- **Localisation** : ville + pays en liste fermée dans l'esprit, mais voir l'hypothèse
  ci-dessous — `city` reste en texte libre pour ne pas figer une décision stratégique
  encore ouverte dans le PRD (marché prioritaire).
- **Préférences de recherche** (tranche d'âge, ville souhaitée) : capturées dès ce
  sous-projet, dans la dernière étape du wizard — le moteur de compatibilité n'aura qu'à
  les lire.

## Hypothèses à valider (non tranchées explicitement par le PRD)

- `country` : liste fermée commençant par Sénégal + quelques destinations diaspora
  courantes (France, USA, Canada…) + « Autre ». `city` : texte libre plutôt que liste
  rigide, tant que le marché prioritaire n'est pas figé (question ouverte du PRD).
- `religion` : liste fermée `MUSLIM | CHRISTIAN | OTHER | NONE` — cohérent avec le
  contexte du marché ouest-africain francophone que le kit cible déjà (XOF, mobile money
  Sénégal), à confirmer.
- `educationLevel` : liste fermée `SECONDARY | BACHELOR | MASTER | DOCTORATE | OTHER`.
- Âge minimum : 18 ans, imposé à la validation (non demandé explicitement mais standard
  légal pour ce type de plateforme).

## Modèle de données

```prisma
model Profile {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Qui je suis
  gender            String   // MALE | FEMALE
  birthDate         DateTime // 18+ imposé à la validation
  country           String
  city              String
  maritalStatus     String   // SINGLE | DIVORCED | WIDOWED
  hasChildren       Boolean
  childrenCount     Int?
  wantsChildren     String   // YES | NO | MAYBE
  religion          String   // MUSLIM | CHRISTIAN | OTHER | NONE
  religiousPractice String   // PRACTICING | BELIEVER_NON_PRACTICING | NON_PRACTICING
  educationLevel    String   // SECONDARY | BACHELOR | MASTER | DOCTORATE | OTHER
  profession        String?
  bio               String?  @db.Text

  // Qui je cherche
  seekingGender  String // MALE | FEMALE
  seekingMinAge  Int
  seekingMaxAge  Int
  seekingCountry String?
  seekingCity    String?

  onboardingCompletedAt DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([gender, seekingGender])
  @@index([country, city])
}
```

Style cohérent avec le kit existant : champs `String` + commentaire listant les valeurs
valides (comme `User.role`/`User.status`), pas d'enum Prisma.

**Photos** : pas de nouvelle table. Extension de `FileUpload` (déjà branché Cloudinary) :

```prisma
model FileUpload {
  // ... champs existants inchangés ...
  purpose  String? // PROFILE_PHOTO | null (générique)
  position Int?    // 0-5 pour PROFILE_PHOTO, ordre d'affichage
}
```

## API

Convention existante : `runtime = 'nodejs'`, colocation `route.ts` + `route.test.ts`.

| Méthode | Path | Rôle |
|---|---|---|
| GET | `/api/profile` | Profil de l'utilisateur connecté (`null` si pas encore créé) |
| PATCH | `/api/profile` | Crée/met à jour partiellement — appelée à chaque étape du wizard |
| POST | `/api/profile/complete` | Marque `onboardingCompletedAt` — 400 si champ requis manquant ou 0 photo |
| POST | `/api/profile/photos` | Upload une photo (réutilise `/api/upload` + Cloudinary) — 400 au-delà de 6 |
| DELETE | `/api/profile/photos/[id]` | Supprime une photo |

### Flux d'onboarding

Après vérification email, une garde middleware/proxy redirige tout utilisateur avec
`profile.onboardingCompletedAt == null` vers `/onboarding` (sauf routes d'auth et API).
4 écrans :

1. Intention + infos de base (genre, naissance, ville/pays)
2. Critères de fond (enfants, religion, études/profession, situation familiale)
3. Bio + préférences de recherche
4. Photos (1 minimum)

Chaque étape → `PATCH /api/profile`. Dernière étape → `POST /api/profile/complete`.

### Hors scope MVP (différé)

- Réordonnancement des photos par drag-and-drop (l'ordre d'upload suffit pour le P0).
- UI dédiée « éditer mon profil » après l'onboarding (édition possible via l'API, mais
  pas d'écran dédié en P0 — P1).

## Validation & erreurs

- Âge ≥ 18 ans calculé depuis `birthDate` → 400 `AGE_MINIMUM` sinon.
- Champs à valeurs fermées (`gender`, `maritalStatus`, `wantsChildren`, `religion`,
  `religiousPractice`, `educationLevel`) validés côté API contre leur liste autorisée →
  400 `INVALID_FIELD_VALUE` sinon.
- `seekingMinAge <= seekingMaxAge`, tous deux ≥ 18 → 400 sinon.
- `POST /api/profile/complete` vérifie atomiquement tous les champs requis + ≥ 1 photo →
  400 `PROFILE_INCOMPLETE` avec la liste des champs manquants.
- Upload photo : 400 si déjà 6 photos, ou format non supporté (même validation que
  `/api/upload` existant).
- Conventions du kit : réponses `{ error: "CODE" }`, pas de fuite de détails internes.
  `runtime-enforcement.test.ts` continue d'imposer `runtime = 'nodejs'`.

## Tests

- `route.test.ts` par endpoint (Vitest, colocalisé) : cas valide, champ manquant, valeur
  hors liste, âge < 18, complétion avec/sans photo.
- Test de la garde d'onboarding : redirection si profil incomplet, accès libre une fois
  complété.
- Pas de test E2E navigateur (infra absente du kit) ; `pnpm smoke:auth` reste le seul
  smoke test manuel existant (connu cassé sous Windows — bug préexistant du kit, hors
  scope de ce sous-projet).
