# Brancher les services externes — état réel et marche à suivre

**Il n'y a pas de code à écrire.** Les 61 routes de l'API existent, chaque
service est déjà câblé, et tout ce qui manque tient dans `.env.local` puis
dans les variables d'environnement Vercel. Ce document dit, pour chaque
service : ce qui bloque aujourd'hui, où obtenir les clés, et comment
vérifier que ça marche — sans jamais faire confiance à « ça devrait ».

Constat au 2026-09-09, obtenu en lisant le code et en inspectant les noms
de clés présents (jamais leurs valeurs) :

| Service | État | Conséquence aujourd'hui |
|---|---|---|
| Base Neon | ✅ configuré | — |
| Cron | ✅ configuré | — |
| **E-mail (Resend)** | ⚠️ **incomplet** | **aucun e-mail ne part** |
| **Google OAuth** | ❌ absent | bouton « continuer avec Google » inerte |
| **Redis (Upstash)** | ❌ absent | limites de débit en mémoire, file d'e-mails morte |
| **Paiements (Bictorys)** | ❌ absent | aucun encaissement possible |
| Cloudinary | ⚠️ presets manquant | envoi de fichiers probablement refusé |
| Sentry | ❌ absent | aucune remontée d'erreur en production |

---

## 1. L'e-mail — à faire en premier

C'est le blocage le plus profond, et il ne se voit pas : la file d'e-mails
**échoue en silence**. `getEmailQueue()` journalise un avertissement et rend
`null` ; les appelants passent leur chemin sans erreur. Rien ne casse à
l'écran, et rien n'arrive dans les boîtes mail.

Sans e-mail, ces parcours ne fonctionnent pas :

- la **vérification d'inscription** — l'inscription ne pose aucun cookie ;
  c'est le code à 8 caractères reçu par mail qui ouvre la session. Sans lui,
  personne ne peut créer de compte par e-mail ;
- la **réinitialisation de mot de passe** ;
- l'**invitation du partenaire** dans l'Espace Couple.

**Trois choses sont exigées ensemble** (`lib/server/queues/email-queue-singleton.ts`) :

```
RESEND_API_KEY            ✅ déjà présente
EMAIL_FROM                ❌ vide  → à renseigner
UPSTASH_REDIS_REST_URL    ❌ vide  → à renseigner
UPSTASH_REDIS_REST_TOKEN  ❌ vide  → à renseigner
```

La dépendance à Redis surprend : la file est adossée à Upstash, donc une clé
Resend seule ne suffit pas. Voir §2.

**`EMAIL_FROM`** doit être une adresse sur un domaine **vérifié chez Resend**
(https://resend.com/domains) — sinon Resend refuse l'envoi. Forme attendue :
`Cœur Fidèle <bonjour@votredomaine.com>`. Tant que le domaine n'est pas
vérifié, `onboarding@resend.dev` fonctionne, mais **uniquement vers votre
propre adresse** : c'est bon pour tester, pas pour ouvrir aux utilisateurs.

**En attendant**, pour créer des comptes de test sans e-mail :

```bash
pnpm seed:dev            # comptes de développement déjà vérifiés
pnpm seed:game-couple    # un couple actif, prêt à jouer
```

**Vérifier** : lancer une inscription, puis regarder la console de `pnpm dev`.
L'avertissement `email-queue-singleton: not configured` doit avoir disparu.

---

## 2. Redis (Upstash) — exigé par l'e-mail, et pas seulement

Aujourd'hui absent. Le repli en mémoire fonctionne en développement (le
message `refresh-lock using in-memory fallback` le dit), mais il est faux en
production : Vercel lance plusieurs instances, et une limite de débit tenue
en mémoire ne limite plus rien dès la seconde instance.

Ce qui en dépend : la file d'e-mails (§1), les limites de débit
d'authentification, le verrou de renouvellement de session, les baux de
leader entre crons.

Créer une base sur https://console.upstash.com (Redis, région proche de
celle de Vercel), puis copier les deux valeurs REST :

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

**Vérifier** : `curl http://localhost:3000/api/readyz` doit répondre `200`
avec une entrée `redis` (aujourd'hui, la réponse est un `503` sans mention
de Redis).

---

## 3. Google OAuth

Deux clés manquent ; `GOOGLE_REDIRECT_URI` est déjà en place.

```
GOOGLE_CLIENT_ID      ❌ vide
GOOGLE_CLIENT_SECRET  ❌ vide
GOOGLE_REDIRECT_URI   ✅ déjà présente
```

Dans https://console.cloud.google.com → APIs & Services → Credentials →
**OAuth client ID**, type *Web application*. L'URI de redirection autorisée
doit correspondre **exactement** à `GOOGLE_REDIRECT_URI`, à la barre oblique
finale près — c'est la cause n°1 des `redirect_uri_mismatch`. Il en faut une
par environnement : `http://localhost:3000/...` pour le développement, celle
du domaine de production pour Vercel.

**Garde-fou déjà en place, à ne pas retirer** : le rappel OAuth **refuse**
tout compte Google dont `email_verified` n'est pas `true`. Sans cela, un
attaquant créant un compte Google non vérifié à l'adresse d'une victime
prendrait la sienne par liaison automatique. C'est écrit dans `CLAUDE.md`
parmi les invariants.

**Vérifier** : ouvrir `/api/auth/oauth/google/start`. Une redirection vers
Google = configuré. Une erreur = clés absentes ou URI divergente.

---

## 4. Paiements (Bictorys)

Quatre clés sur cinq manquent.

```
BICTORYS_API_KEY               ❌  encaissements (charges)
BICTORYS_PRIVATE_KEY           ❌  versements (payouts)
BICTORYS_WEBHOOK_SECRET        ❌  signature des webhooks
BICTORYS_MERCHANT_SECRET_CODE  ❌
BICTORYS_API_URL               ✅  déjà présente
```

**`BICTORYS_API_KEY` et `BICTORYS_PRIVATE_KEY` sont deux clés distinctes** —
encaissement et versement. Les confondre est listé comme invariant critique
dans `CLAUDE.md` : la première sert à débiter un client, la seconde à envoyer
de l'argent. Une confusion se paie en vrai argent.

Le webhook attend `POST /api/webhooks/bictorys`, et **vérifie la signature
sur le corps brut avant tout parsing JSON** — ne changez pas cet ordre, ce
serait une régression silencieuse de la vérification HMAC. Sa fenêtre de
rejeu est de 60 s par défaut (`BICTORYS_WEBHOOK_REPLAY_WINDOW_MS`).

Deux choses à savoir avant de brancher :

- **les montants sont des entiers, dans la plus petite unité** — le FCFA n'a
  pas de décimales. Jamais de nombre à virgule en base ;
- le disjoncteur qui protège les appels de débit est **en mémoire**, donc
  mono-instance. En production multi-instances, il faudra une version
  adossée à Redis. C'est une limite connue et documentée, pas un oubli.

L'économie de points du Salon n'existe pas encore : rien ne prélève quoi que
ce soit aujourd'hui, et les écrans n'affichent aucun prix. Brancher Bictorys
ne fera donc rien payer tant que cette économie n'est pas construite.

---

## 5. Cloudinary — presque configuré

Trois clés sur quatre sont là ; `CLOUDINARY_UPLOAD_PRESET` est vide. La
route `/api/upload` valide les **octets d'en-tête** du fichier contre
`UPLOAD_ALLOWED_MIME` plutôt que de croire le type déclaré par le
navigateur — ne contournez pas cette vérification.

**Vérifier** : `/api/upload` doit cesser de répondre `503
STORAGE_NOT_CONFIGURED`.

---

## 6. Sentry

`SENTRY_DSN` et `NEXT_PUBLIC_SENTRY_DSN` sont vides : en production, une
erreur serveur ne laisse aucune trace consultable. L'initialisation vit dans
`instrumentation.ts` et ne doit pas bouger — ce point d'entrée s'exécute
avant le code de l'application, ce qu'un import depuis une route ne fait pas.

---

## Au déploiement

Deux points, dans l'ordre d'importance :

1. **La région Vercel doit coïncider avec la région Neon.** Sinon les ~320 ms
   de latence mesurés en développement se reproduisent en production — et là
   ce sera un vrai défaut, pas un artefact local. Voir
   [latence-base-de-donnees.md](latence-base-de-donnees.md).
2. `pnpm db:migrate:deploy` avant la première mise en ligne. La migration
   `20260908000000_board_games` a été appliquée en développement le
   2026-09-09 ; son index unique **partiel** (écrit en SQL brut, le DSL de
   Prisma ne sait pas l'exprimer) a été vérifié en base après coup.

Enfin : toutes les variables doivent être posées **aussi** dans Vercel
(Settings → Environment Variables), par environnement. `.env.local` ne part
jamais avec le dépôt.
