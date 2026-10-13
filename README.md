# Cœur Fidèle

**Un jeu de couple à deux joueurs, livré comme une seule application Next.js 16.**

Deux partenaires s'apparient dans un *Espace Couple*, puis jouent sur **un seul
téléphone qu'ils se passent** — trois manches (Miroir, Scénarios, Face à face)
qui se terminent sur un score et un Niveau de Complicité. À côté, *le Salon*
propose cinq jeux de plateau, délibérément scellés hors du score du couple.

Tout tient à la racine du dépôt : pages, Route Handlers, logique serveur. Un
seul paquet, pas de workspace, rien d'imbriqué — [`src/`](src/) et le reste sont
posés à côté du `package.json`.

---

## Quickstart

```bash
cp .env.example .env.local            # puis renseignez les six variables du bloc « requises »
pnpm install
pnpm db:push                          # applique le schéma Prisma
pnpm seed:questions                   # charge les 267 questions
pnpm seed:game-couple                 # un couple de test prêt à jouer
pnpm dev                              # http://localhost:3000
```

La base est un Postgres **[Neon](https://neon.tech)** — créez un projet, prenez
les deux URL (poolée et directe). Il n'y a rien à installer localement.

> **En local, mettez `connection_limit=10` dans l'URL poolée.** Le `1` que porte
> [`.env.example`](.env.example) est le contrat de Vercel, où chaque instance de
> fonction a son propre pool. `pnpm dev` n'est qu'un seul processus : avec une
> connexion unique, l'ouverture du Salon sature la file et `/api/auth/me` échoue.
> La page concernée reste alors sur « Chargement… », ce qui ressemble à un bouton
> mort et n'en est pas un.

Puis, dans un autre terminal :

```bash
pnpm smoke:auth        # parcours d'authentification de bout en bout
pnpm smoke:game        # appariement → partie → résultat
```

### Se connecter tout de suite

`pnpm seed:game-couple` crée un couple actif, disclaimer accepté des deux
côtés, avec des identifiants publiés dans le script :

```
couple-a@example.com     TestCouple123!
couple-b@example.com     TestCouple123!
```

Connectez-vous avec **un seul des deux** : le jeu se joue à deux sur un seul
appareil authentifié.

### Trois commandes qui font gagner du temps en local

Aucun cron ne tourne en développement, et rien ne débite de paiement. Ces
scripts court-circuitent les deux, et refusent tous de tourner en production.

| Besoin | Commande |
|---|---|
| Lire un code de vérification sans attendre l'email | `pnpm code <email>` |
| Vider les files (outbox → emails) à la main | `pnpm drain` |
| S'accorder un pack payant | `pnpm abonner <email> [ESSENTIEL\|INTEGRAL\|ANNUEL]` |
| Apparier **son propre** compte | `pnpm seed:game-couple --email=<adresse>` |

---

## Le produit

### Le jeu du couple — et pourquoi le serveur est seul arbitre

Une partie tire ses questions **une fois pour toutes à la création**, pour
qu'une reprise après un onglet fermé ne change jamais la question posée. Une
option de Scénario porte un poids caché, et la réponse de chacun doit rester
secrète jusqu'à la révélation : il y a donc quelque chose à protéger, et le
moteur tourne côté serveur.

Trois formats, qui changent la **longueur** et non la forme — les trois manches
sont toujours jouées : `EXPRESS` (5 questions), `STANDARD` (15),
`LONGUE_SOIREE` (30).

*Les formats sont écrits dans leur casse de code, ici et dans [CLAUDE.md](CLAUDE.md) :
le nom du plus court entre en collision avec celui d'un framework, et un
garde-fou de documentation refuse ce mot écrit en capitale initiale.*

### Les huit thèmes

Un thème traverse toute la partie et porte **dix questions par manche**, soit le
tirage maximal d'une Longue soirée. En dessous de ce seuil, le moteur élargirait
au catalogue entier sans le dire — le couple choisirait « Ex et passé » et
jouerait sur autre chose. [`themes.test.ts`](src/lib/game/themes.test.ts)
rejoue le vrai tirage, thème par thème et manche par manche, et fait échouer CI
si l'un d'eux repasse sous la barre.

### Les paliers d'accès

| Palier | Prix | Thèmes | Salon | Parties |
|---|---|---|---|---|
| Découverte | gratuit | 1 — Confiance & Jalousie | non | une offerte par couple |
| Week-end | 2 000 FCFA / 2 jours | les 8 | inclus | illimitées |
| Semaine | 4 900 FCFA / 7 jours | les 8 | inclus | illimitées |
| Mois | 9 900 FCFA / 30 jours | les 8 | inclus | illimitées |

Les paliers payants diffèrent par la **durée**, pas par le contenu. L'ancien
Annuel est retiré de la vente mais reste dans le registre : les droits déjà
payés vont à leur terme.

Tout vient de [`lib/game/packs.ts`](src/lib/game/packs.ts) : la page de
tarifs affiche avec, le sélecteur de thèmes grise avec, la route de création
refuse avec. Le droit appartient à un **compte**, l'accès au **couple** — il
suffit qu'un des deux partenaires détienne un pack.

**Le paiement passe par PayTech** (Wave, Orange Money, Free Money, carte) dès
que `PAYTECH_API_KEY` et `PAYTECH_API_SECRET` sont posées, par Bictorys sinon.
`POST /api/orders` lit le prix dans le registre, le client est renvoyé vers
`/paiement/[id]`, et c'est le webhook du fournisseur
(`/api/webhooks/paytech`) qui passe la commande à `PAID` et ouvre le pack, dans
la même transaction.

### Le Salon — et pourquoi les règles tournent dans le navigateur

Cinq jeux : dames, awalé, ludo, le mot, mots croisés. Chaque moteur est du
TypeScript pur exécuté **côté client**, et le serveur ne valide jamais un coup.
C'est une décision : ces jeux n'ont aucune information cachée, aucun score réel,
et les deux joueurs partagent un écran — une validation serveur ne protégerait
rien tout en coûtant un aller-retour par coup. Le serveur persiste le plateau et
n'en vérifie que la **forme**.

**Le Salon n'exige pas de partenaire.** Un compte sans couple actif y joue avec
qui est assis à côté de lui ; ses parties sont rangées sous son compte
(`BoardGame.userId`) au lieu du couple. L'accès reste le même : un pack payant.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16, App Router, Turbopack |
| Base | Prisma 5 + Postgres [Neon](https://neon.tech) |
| Cache / rate-limit | Upstash Redis (API REST) |
| Email | Resend |
| Paiements | Bictorys, derrière une interface `PaymentProvider` |
| Média | Cloudinary |
| Observabilité | Sentry (hook `register()` de `instrumentation.ts`) |
| Tests | Vitest, environnement `node` |

---

## Variables d'environnement

Référence complète, chaque clé documentée avec son défaut et son impact :
[`.env.example`](.env.example).

**Requises au démarrage :**

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URL poolée Neon (`?pgbouncer=true&connection_limit=1&pool_timeout=15&sslmode=require`) |
| `DIRECT_URL` | URL Neon directe, non poolée, pour `prisma migrate` |
| `JWT_SECRET` | ≥ 32 caractères — `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | 32 octets base64 — `openssl rand -base64 32` |
| `CRON_SECRET` | Jeton porteur exigé par tous les `/api/cron/*` |
| `APP_URL` | Base des liens email et des redirections OAuth ; défaut `http://localhost:3000` |

**Groupes optionnels** — absent veut dire inerte, jamais cassé :

| Groupe | Variables | Sans elles |
|---|---|---|
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Les emails s'empilent en file et partent dès que la clé arrive |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate-limit en mémoire, avec un avertissement au démarrage — **à ne pas laisser ainsi en production** |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `/api/auth/oauth/google/*` répondent 404 |
| Paiements | `BICTORYS_API_KEY`, `BICTORYS_PRIVATE_KEY`, `BICTORYS_WEBHOOK_SECRET`, `BICTORYS_MERCHANT_SECRET_CODE` | `/api/orders` et le webhook répondent 404 |
| Média | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | `/api/upload` répond 503. **Les URL rendues sont publiques** — convenable pour un avatar, pas pour une pièce d'identité |
| Sentry | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Silence complet, aucun coût |

`BICTORYS_API_KEY` (encaissements) et `BICTORYS_PRIVATE_KEY` (versements) sont
deux clés distinctes et ne doivent jamais être confondues.

---

## Les routes

**62 Route Handlers**, tous sous
[`src/app/api/`](src/app/api/) — la liste vit dans
l'arborescence, pas dans ce fichier, pour qu'elle ne puisse pas mentir.

| Groupe | Routes |
|---|---|
| `auth` | 15 |
| `admin` | 12 |
| `games` | 8 |
| `cron` | 6 |
| `salon` · `couples` | 4 chacun |
| `notifications` | 3 |
| `packs` · `questions` · `invites` · `orders` · `withdrawals` · `upload` · `webhooks` · `pay-redirect` · `health` · `readyz` | 1 chacun |

Le squelette à recopier pour en ajouter une :

```ts
export const runtime = 'nodejs';        // exigé, un test le vérifie
const csrfFail = verifyCsrf(req);       // pour toute mutation
const auth = await requireAuth(...);    // ou requireAdmin / requireOrgRole
return withRequestContext(ctx, ...);    // pour la corrélation des journaux
```

Les six crons (`outbox-drain`, `email-queue-drain`, `verification-cleanup`,
`order-expiration`, `webhook-log-purge`, `email-job-purge`) sont déclarés **deux
fois** — dans [`netlify.toml`](netlify.toml), l’hébergeur en service, et dans
[`vercel.json`](vercel.json), conservé comme repli — et vérifient tous
`Authorization: Bearer ${CRON_SECRET}`.

Chez Vercel ils sont tous **quotidiens**, et ce n’est pas un choix : le plan
Hobby refuse de déployer un cron plus fréquent qu’une fois par jour, avec une
précision de ±59 minutes. Quatre d’entre eux étaient sub-quotidiens et
faisaient échouer le déploiement. Netlify n’a pas cette limite, et ses horaires
sont donc plus serrés.

Les passer en quotidien aurait déployé proprement **et tué l’inscription** :
un code de vérification serait parti jusqu’à 24 heures après la demande.
C’est pourquoi le chemin interactif ne dépend plus du calendrier — une route
qui met un email en file appelle `scheduleDrain()`
([`lib/server/outbox/drain-now.ts`](src/lib/server/outbox/drain-now.ts)),
qui vide l’outbox et la file une fois la réponse envoyée. Les crons restent
le filet de rattrapage pour ce que ce chemin manque : un envoi en échec qui
attend son backoff, une instance froide, le chemin webhook.

`outbox-drain` précède `email-queue-drain` d’une heure pleine, parce que la
première alimente la seconde et que la gigue Hobby ne sort jamais de l’heure
déclarée. Deux garde-fous tiennent ces deux règles dans
[`vercel-json-shape.test.ts`](src/lib/server/observability/vercel-json-shape.test.ts).

---

## Tests

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test    # avant tout commit
pnpm build                                                  # avant tout déploiement
```

**2 470 tests sur 209 fichiers.** Deux choses à savoir avant d'en écrire un :

- **Il n'y a ni jsdom ni Testing Library.** Vitest tourne en environnement
  `node`, aucun composant ne peut être monté. La logique d'un écran vit dans un
  module pur qu'on teste directement ; ce qui reste dans le JSX est vérifié au
  niveau du texte source.
- **Un test qui passe ne prouve rien tant qu'on ne l'a pas vu échouer.**
  `expect(page).toContain('ApiError')` est satisfait par le seul import.
  Cassez l'implémentation, regardez le test rougir, remettez-la.

Plusieurs tests de ce dépôt sont des **garde-fous écrits après un défaut réel** :
un thème sans contenu, un prix écrit à la main, la banque de questions partant
dans le bundle du navigateur. Ils portent chacun l'histoire du défaut en
commentaire — lisez-la avant de les contourner.

---

## Déploiement

### Ce dont le build a besoin

Une seule variable : **`JWT_SECRET`**. Elle est lue au *chargement du module*
[`lib/server/auth.ts`](src/lib/server/auth.ts), donc `next build` la
réclame pendant la collecte des pages — et l’erreur nomme alors la première
route évaluée, qui n’y est pour rien. Vérifié le 22/09/2026 : sans
`.env.local`, avec ce seul secret, le build sort en code 0 et ses 62 routes.

Elle doit faire **32 caractères au moins**, et ne pas commencer par `change-me`,
`secret`, `password`, `test`, `dev`, `todo` ni `placeholder` — ces valeurs sont
refusées.

Tout le reste ne manque qu’à l’exécution : **un build vert ne prouve rien** sur
la configuration du site.

### Sur Vercel

**1. Aucun réglage à faire.** Importez le dépôt et laissez tous les champs par
défaut : *Root Directory* sur la racine, *Framework* détecté, *Build Command* et
*Output Directory* vides. L'application **est** le paquet racine — `package.json`
déclare `next` dans `dependencies`, `vercel.json` est à côté de lui, et
`vercel.json` ne contient aucune surcharge de build.

Si vous voyez encore une valeur dans *Build Command*, *Install Command* ou
*Output Directory*, **videz-la**. Un reste comme `pnpm --filter frontend run
build` échoue maintenant sur « No projects matched the filters », et
`.next` sur « No Output Directory named .next found » : ce sont des
vestiges, pas des réglages.

<details>
<summary>Pourquoi cette section était dix fois plus longue avant le 02/10/2026</summary>

L'application vivait sous ``, derrière un workspace pnpm à un seul
paquet. Le `package.json` de la racine n'était qu'un orchestrateur, sans `next`
dedans. Un projet laissé sur la racine par défaut refusait donc de construire :

> Aucune version de Next.js détectée. Assurez-vous que votre fichier
> `package.json` contient bien « next » dans « dependencies » ou
> « devDependencies ».

Le message nomme la dépendance, jamais la cause — qui était le *répertoire
racine*. Six déploiements de suite ont échoué là-dessus le 01/10/2026.

Le correctif demandait un réglage **qui n'existe que dans le tableau de bord** :
`rootDirectory` n'est pas une propriété de `vercel.json`, la table des propriétés
de la documentation Vercel ne la contient pas. Aucun fichier du dépôt ne pouvait
donc le porter. Et le contournement — un second `vercel.json` à la racine —
créait un piège pire : selon le réglage que personne ne regardait, Vercel lisait
l'un ou l'autre, et ce sont les six tâches planifiées qui changeaient.

Le dépôt a été aplati le 02/10/2026 : un paquet, un `package.json`, un
`vercel.json`, zéro surcharge, zéro réglage. Les deux moitiés sont verrouillées
par [`package-json-deployable.test.ts`](src/lib/server/observability/package-json-deployable.test.ts)
et [`vercel-json-shape.test.ts`](src/lib/server/observability/vercel-json-shape.test.ts) :
re-nicher l'application ou rajouter un `pnpm-workspace.yaml` fait rougir la CI
avant que Vercel n'ait le temps d'échouer.

</details>

**2. Déclarez les variables** requises pour Production, Preview et Development.
`JWT_SECRET` d'abord : c'est la seule qui bloque le build.

**3. Les schedules cron** de `vercel.json` sont alors enregistrés
automatiquement au déploiement.

**4. Vercel refuse de construire un commit dont l'auteur n'est pas dans
l'équipe.** Le statut dit « Deployment was blocked », ce qui ressemble à une
erreur de build et n'en est pas une :

> Git author `<compte>` must have access to the project on Vercel to create
> deployments.

Le piège est qu'il dépend de **l'auteur du commit**, pas de qui pousse. Un même
dépôt peut donc voir la fusion construite — faite depuis le compte propriétaire —
et les commits qui la précèdent refusés. Deux sorties :

- inviter le compte dans l'équipe (*Settings* → *Members*) ;
- ou signer les commits avec un compte déjà autorisé, pour ce dépôt seulement :

  ```bash
  git config user.name  "<compte-autorise>"
  git config user.email "<son-email>"
  ```

La seconde ne coûte rien et n'exige aucun siège. Vérifiez que le compte `gh`
actif est bien le même, sinon le push échoue sur un dépôt privé avec
« Repository not found » — un message qui ne nomme pas la cause non plus.

**5. Ajoutez un second `GOOGLE_REDIRECT_URI`** pour le domaine de production, et
déclarez-le aussi côté console Google.

**6. Pour que les emails arrivent** : un enregistrement `_dmarc` sur le domaine
d'expédition, en plus de SPF et DKIM.

### Sur Netlify

**L’hébergement est passé sur Netlify le 03/10/2026.** Les deux cibles restent
décrites ici parce que les deux configurations sont versionnées et que les
garde-fous tiennent les deux listes de crons d’accord.

**1. Aucun réglage de build à faire**, pour la même raison que chez Vercel :
l’application est le paquet racine. L’adaptateur Next.js de Netlify est appliqué
automatiquement et la documentation déconseille de l’épingler — ne l’installez
pas, ne le déclarez pas dans `[[plugins]]`. [`netlify.toml`](netlify.toml) ne
contient **que** les six horaires : ni `command`, ni `publish`.

**2. `prisma generate` n’a pas à être ajouté** à la commande de build : le script
`postinstall` le lance, et `pnpm install` exécute les postinstall.

**3. Les crons sont du code, pas une déclaration.** `vercel.json` n’est lu que
par Vercel ; Netlify veut des *Scheduled Functions*. Les six coquilles de
[`netlify/functions/`](netlify/functions/) appellent les routes déjà testées via
[`lib/server/cron/appel-planifie.ts`](src/lib/server/cron/appel-planifie.ts), qui
porte toute la décision — origine, secret, verbe, limite de temps. Une coquille
ne décide rien et **n’avale pas son erreur** : une exception marque l’invocation
en échec dans l’interface, et c’est le seul signal observable qu’un cron soit
mort. [`netlify-toml-shape.test.ts`](src/lib/server/observability/netlify-toml-shape.test.ts)
exige que les six routes, les six horaires et les six coquilles se correspondent,
et que `netlify.toml` couvre exactement les mêmes routes que `vercel.json`.

Les horaires y sont **plus serrés** que chez Vercel (10 min pour l’outbox,
15 min pour l’expiration des commandes) : la contrainte du quotidien venait du
plan Hobby de Vercel, pas du produit. Le budget est compté — environ 25 000
invocations par mois, pour 125 000 offertes.

**4. Vérifiez le *scope* de chaque variable.** C’est le piège propre à Netlify :
une variable y porte des scopes (*Builds*, *Functions*, *Runtime*…), et une
variable scopée *Builds* seulement est **invisible à l’exécution**. `CRON_SECRET`
scopé *Builds* fait échouer les six fonctions planifiées ; `DATABASE_URL` ou
`JWT_SECRET` dans le même cas font échouer l’application entière. Vercel n’a pas
cette séparation, donc l’erreur ne peut pas venir de l’habitude.

**5. Node et Prisma doivent viser le même système.** [`.nvmrc`](.nvmrc) demande
Node 22 : Netlify aligne le runtime des fonctions sur la version du build, mais
*seulement* si c’est un runtime AWS Lambda encore supporté — sinon il retombe
silencieusement sur Node 24, et l’on construit sur une version pour exécuter sur
une autre. Et comme le build tourne sur l’image Ubuntu de Netlify tandis que la
fonction tourne sur Amazon Linux, `binaryTargets` de
[`prisma/schema.prisma`](prisma/schema.prisma) déclare `rhel-openssl-3.0.x` en
plus de `native` : sans lui, la première requête échoue sur un build vert.

**6. Le DNS est une étape à part.** Mesuré le 03/10/2026 : `www.coeurfidele.net`
répondait encore depuis Vercel (`x-vercel-error: DEPLOYMENT_NOT_FOUND`). Changer
d’hébergeur dans l’interface ne déplace pas le domaine.

---

## Ce qui n'est pas livré

- **Les moyens de paiement** — prix affichés, rien de débitable.
- **Les tests d'intégration** — deux scripts UAT manuels tiennent ce rôle.
- **La multi-location** (`Organization`, `requireOrgRole`) est câblée mais
  inutilisée : l'unité de ce produit est le `Couple`.
- **Le temps réel.** Si le besoin arrive, c'est [Ably](https://ably.com) qu'il
  faut, pas une connexion longue depuis une fonction serverless.

---

## Aller plus loin

| Fichier | Contenu |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Les invariants qu'on ne peut pas déduire du code — index partiels en SQL brut, modèle d'identité du pass-and-play, fichiers protégés |
| [docs/design/](docs/design/) | Les canevas web et mobile, planches comprises |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Une spécification par jeu du Salon |
| [STATUS.md](STATUS.md) | Le journal historique du portage dont ce dépôt est issu |
| [PRUNING.md](PRUNING.md) | Le protocole pour retirer une surface optionnelle sans casser la compilation |

---

## Licence

Propriétaire.
