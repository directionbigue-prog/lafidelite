# Inscription — canvas Claude Design → Next.js 16 + Tailwind v4

## Source

Canvas Claude Design fourni **en image** (capture), pas via le MCP Banani :
il n'y a donc ni `html`, ni `css`, ni `tokens` exploitables. La structure et
la hiérarchie visuelle sont lisibles ; **la micro-copie ne l'est pas
entièrement**. Tout texte non lisible est reconstruit et listé en fin de
document sous « Copie inférée » — à corriger si l'un des libellés diffère.

Planches du canvas :

1. **Inscription — desktop** : deux colonnes, panneau de marque à gauche,
   formulaire à droite.
2. **Inscription — mobile** : une colonne, formulaire d'abord.
3. **Arrivée par invitation** : même écran, précédé d'une carte
   « <Prénom> vous invite à rejoindre votre Espace Couple », CTA
   « Rejoindre <Prénom> ».
4. **États & messages** : messages (erreur / succès / info), états de champ
   (vide, erreur, rempli), niveaux de robustesse du mot de passe.

## Où l'écran s'insère (les 8 questions, répondues avant de coder)

1. **Route** : `/inscription` — [src/app/inscription/page.tsx](../../src/app/inscription/page.tsx).
2. **Public**, non gardé. Aucun `useUser`.
3. **Lit** `GET /api/invites/:code` quand `?invite=` est présent →
   `{ valid: true, creatorName }` ou `{ valid: false, expired }`. La réponse
   ne contient **jamais** l'email du créateur.
4. **Écrit** `POST /api/auth/signup` `{ email, password, name, inviteCode? }`
   → **201 quoi qu'il arrive** (résistance à l'énumération : la réponse est
   identique que l'email existe ou non) et **aucun cookie**. Pas de CSRF sur
   cette route (pas de session à protéger). L'`inviteCode` n'est transmis
   que si l'invitation a été validée.
5. **Navigation** : entrée depuis `/` (CTA), `/connexion`, ou un lien
   `/invite/:code`. Sortie → `/verify-email?email=…`. C'est `/verify-email`
   qui pose les cookies, pas l'inscription.
6. **Réutilisable** : rien. `src/components/` ne contient que `demo/`,
   `game/`. Les primitives de formulaire sont à créer.
7. **États** : chargement de l'invitation, invitation invalide/expirée
   (l'inscription reste possible), erreur de soumission, envoi en cours.
8. **Effets de bord** : email de vérification via l'outbox, côté serveur.

## Découpage en composants

| Statut | Composant | Rôle |
|---|---|---|
| **NEW** | `components/ui/Field.tsx` | label + input + aide + erreur, `id` lié, `aria-describedby` |
| **NEW** | `components/ui/PasswordField.tsx` | `Field` + bascule voir/masquer + jauge |
| **NEW** | `components/ui/PasswordStrength.tsx` | les 4 segments + libellé |
| **NEW** | `components/ui/Alert.tsx` | les cartes de la planche « États & messages » (`error` / `success` / `info`) |
| **NEW** | `components/auth/GoogleButton.tsx` | bouton fournisseur contourné |
| **NEW** | `components/auth/AuthSplitLayout.tsx` | coquille deux colonnes, réutilisable pour `/connexion` |
| **NEW** | `components/auth/SignupAside.tsx` | contenu du panneau gauche (3 étapes + carte score) |
| **NEW** | `components/auth/InviteBanner.tsx` | carte d'arrivée par invitation |
| **NEW** | `lib/auth/password-strength.ts` | fonction **pure**, testée en Node (le projet ne ship ni jsdom ni Testing Library) |

## Correspondance des tokens

Le canvas utilise exactement la palette déjà déclarée dans
[tailwind.config.ts](../../tailwind.config.ts) — aucun nouveau token,
aucun hex en dur, aucun `style={{}}`.

| Rôle dans le canvas | Token projet |
|---|---|
| Fond général | `bg-ink` (#170D1B) |
| Panneau de marque | dégradé `from-plum to-plum-deep2` |
| Cartes / champs | `bg-plum-card`, `bg-plum-card2` |
| CTA principal | `bg-gold` → texte `text-ink` |
| Accent titre, pastilles | `text-rose` |
| Erreur | `text-wine` / `border-wine` |
| Texte | `text-cream` et opacités `/70 /60 /50` |
| Titres | `font-serif` · corps `font-grotesk` |

## Plan responsive (mobile-first, base = 375px)

- **Base (375px)** : une seule colonne. Le **formulaire d'abord** — c'est la
  tâche ; le panneau de marque est un argumentaire, il passe **après** le
  formulaire dans le DOM et reste visible (réordonné en `lg:` pour repasser
  à gauche). CTA pleine largeur, cibles tactiles ≥ 48px
  (`py-3.5` sur les champs, `py-4` sur les boutons).
- **md (768px)** : paddings élargis, largeur de formulaire plafonnée.
- **lg (1024px+)** : bascule en deux colonnes `lg:grid-cols-2`, panneau de
  marque à gauche via `lg:order-first`, hauteur pleine, coins arrondis.
- **xl (1280px)** : conteneur `max-w-6xl` centré — c'est la maquette du
  canvas.

Aucun débordement horizontal : pas de largeur fixe, tout en `w-full` +
`max-w-*`.

## Décision : le bouton Google est conditionnel

Le canvas met « Continuer avec Google » en tête du formulaire. Or
`GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont **absents** de cet
environnement, et `/api/auth/oauth/google/start` répond alors **404**
(volontairement, motif « inerte » du starter). Afficher le bouton tel quel
ajouterait un bouton mort — exactement ce qui vient d'être corrigé partout
ailleurs.

`page.tsx` devient donc un **composant serveur** qui appelle
`tryCreateGoogleProvider()` — le juge unique déjà utilisé par la route — et
passe `googleEnabled` au formulaire client. Pas de `NEXT_PUBLIC_*`
dupliquée, pas de condition redérivée : le bouton apparaît le jour où les
variables sont renseignées, et pas avant. Le séparateur « ou par email »
disparaît avec lui.

## Copie inférée (à corriger si un libellé diffère)

Illisible à la résolution fournie ; reconstruite d'après la mise en page :

- Pastille : « Essai gratuit · 15 questions · 12 minutes »
- Titre : « Un compte, puis votre Espace Couple. »
- Étapes : 01 « Vous créez votre compte » / 02 « Vous invitez votre
  partenaire » / 03 « Vous jouez les 15 questions », avec une ligne de
  description chacune.
- Carte score : « Score du couple · 248 · Niveau : Complices ».
  **248 est la valeur d'exemple de la maquette**, reprise telle quelle comme
  illustration — ce n'est pas une donnée réelle et l'écran n'en lit aucune.
- Mentions sous le CTA : lien vers les CGU et la confidentialité.
  **Ces pages n'existent pas** (voir README, « Limites connues ») : la
  mention est rendue en texte, sans lien, plutôt qu'en lien mort.

## Registre : « vous » hors du jeu, « tu » dedans

Ce n'est **pas** une incohérence à corriger.

- Les écrans de compte, d'onboarding et d'appairage disent **« vous »** :
  ils s'adressent au couple, ou poliment au titulaire du compte.
- Les écrans **en cours de partie** disent **« tu »** : ils s'adressent à la
  personne qui tient le téléphone à cet instant. C'est épinglé par des
  tests (`stepCopy` renvoie « Ta réponse », `revealColumnLabels` renvoie
  « Toi »), donc une passe d'uniformisation les ferait échouer — et à
  raison.

`/settings` a été ramené au « vous » : c'est un écran de compte, il tutoyait
seul de son côté.

## Passe desktop — « une version web aussi jolie que la version mobile »

Le canvas était respecté ; c'est son **exécution en grand** qui ne l'était
pas. Trois causes, aucune dans le design :

1. **Composition alignée en haut** dans une page `min-h-screen` : en
   1280×800 le panneau débordait et la carte de score était coupée en deux.
   La grille réclame maintenant la hauteur du viewport (`lg:min-h-screen`,
   border-box, son propre padding compris).
2. **La colonne du formulaire n'avait aucune surface.** À côté d'un panneau
   dégradé plein, elle se lisait comme de l'espace restant, pas comme
   l'autre moitié d'une paire. Elle reçoit une carte **à partir de `lg`
   seulement** — le mobile, lui, était déjà juste.
3. **Rien derrière.** À 375 px le fond ne se voit pas ; à 1500 px il occupe
   l'essentiel de l'écran, et un aplat d'encre se lit comme un écran
   inachevé. `AmbientBackdrop` reprend l'idiome de lueurs de la landing.

Deux corrections trouvées **en mesurant**, pas en supposant :

- Le panneau **étiré** à pleine hauteur laissait un trou de 250 px sur
  `/connexion`, dont le contenu fait la moitié de celui de `/inscription`.
  Chaque panneau épouse désormais son contenu (`lg:self-center`) — d'où la
  disparition des `mt-auto`, devenus inopérants.
- `xl` commence **exactement à 1280 px** : une variante `xl:` annulait
  l'économie de padding visée pour ce format précis.

### `FocusLayout` était du code mort

Il existait, son commentaire annonçait « les quatorze pages qui l'utilisent »,
et **aucun fichier ne l'importait** — pendant que 22 racines `<main>`
écrites à la main se répartissaient quatre gaps et deux paddings différents.
Rien n'échouait. Le coût n'apparaissait qu'en grand écran, où un correctif
appliqué à la coquille n'atteignait aucune page.

`one-layout-root.test.ts` épingle les deux règles : aucune page ne réécrit
une racine pleine page, **et** les coquilles sont réellement importées — la
seconde parce que la première seule laissait passer exactement ce défaut.

## Vérification

- [x] `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (1116 verts)
- [x] `password-strength` testée par mutation
- [x] Les 14 routes publiques répondent 200, `?invite=` compris
- [x] Aucun `style={{}}`, aucun hex en dur hors tokens
- [x] Pas de bouton Google tant que l'OAuth n'est pas configuré
- [x] **Rendu vérifié pour de vrai** à 375 / 768 / 1024 / 1280 / 1366 / 1440.

Le Chromium de Playwright est en cache sur la machine
(`~/AppData/Local/ms-playwright/`) même si le paquet npm n'est pas installé :
`scratchpad/shoot.mjs` le pilote en CDP, mesure `scrollWidth` / `scrollHeight`
et capture chaque écran. La parité pixel n'est donc plus une supposition.

Résultats mesurés : **aucun débordement horizontal à aucune largeur**.
`/inscription` et `/connexion` tiennent exactement en 1280×800.

Réserve restante : sur un viewport de **768 px de haut** (1366×768,
1024×768), `/inscription` dépasse de 20 px. C'est du contenu réel — les
trois étapes plus la carte de score — et le rogner coûterait plus que les
20 px de défilement que cela épargne. Signalé, pas masqué.

Attention si quelqu'un règle ces paddings : **`xl` commence exactement à
1280 px.** Une variante `xl:` s'applique donc au format même qu'on cherche
à faire tenir — c'est ainsi qu'une première correction est restée sans
effet ici.
