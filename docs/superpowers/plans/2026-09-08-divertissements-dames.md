# Divertissements — jeu de dames — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une rubrique « Divertissement » dans l'espace couple, avec un premier jeu complet et jouable : les dames internationales 10×10, à deux sur le même appareil.

**Architecture:** Le moteur de règles est un module TypeScript **pur** (`src/lib/dames/`) exécuté dans le navigateur — pas d'information cachée, pas de score réel, donc rien à valider côté serveur. Le serveur ne fait que **conserver le plateau** dans une table `BoardGame` générique, pour qu'une partie survive à un onglet fermé ; il valide la forme de l'état, jamais la légalité des coups.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Prisma 5 / Postgres (Neon) · Vitest (environnement `node`) · Tailwind v4.

Spec de référence : [docs/superpowers/specs/2026-09-08-divertissements-dames-design.md](../specs/2026-09-08-divertissements-dames-design.md)

## Global Constraints

- **Règles** : dames internationales 10×10. Prise obligatoire, en avant comme en arrière, enchaînée, **au maximum de pièces** ; dame volante.
- **Le moteur parle `'blanc'` et `'noir'`**, jamais les prénoms ni les couleurs de la palette. C'est ce qui permet de le confronter aux valeurs publiées. L'interface fait la traduction.
- **Le moteur est pur** : aucun `import` de Prisma, de React, de `next/*`, ni d'accès au DOM dans `src/lib/dames/`.
- **Étanchéité** : aucune écriture, dans aucun sens, vers `Couple.cumulativeCoupleScore`, `GameResult`, `GameSession` ou `User.freeGameUsedAt`. Une partie de dames ne coûte rien et ne rapporte rien.
- **Toute Route Handler** : `export const runtime = 'nodejs'`, `makeRequestContext` / `withRequestContext`, `requireAuth`, `verifyCsrf(req)` sur les mutations. **404** (jamais 403) quand la ressource n'appartient pas au couple de l'appelant.
- **TypeScript strict** avec `noUncheckedIndexedAccess` : `cases[i]` a le type `Case | undefined`. Ne jamais le contourner par un cast `as`.
- **Français** dans toute la copie destinée à l'utilisateur. Les identifiants de code sont en français dans `src/lib/dames/` (domaine métier), en anglais ailleurs, conformément au dépôt.
- **Avant chaque commit** : `pnpm format && pnpm lint && pnpm typecheck && pnpm test` doivent passer.
- **Commits** : Conventional Commits, et chaque message se termine par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Le canevas de design fait foi pour l'écran, la spec fait foi pour les règles.** La rubrique s'appelle « Le Salon », ses routes sont `/salon` et `/salon/dames` (le canevas web les montre en clair dans sa barre d'adresse), et les couleurs du damier en sont relevées. Trois choses du canevas sont **délibérément écartées**, chaque fois parce que ce sur quoi elles reposent n'existe pas : le damier 8×8 qu'il dessine (arbitré en faveur du 10×10 international), les prix en points (l'économie n'est pas construite — un prix que rien ne prélève est une promesse vide), et tout ce qui suppose deux appareils (présence, « Rejoindre la table », reconnexion — lot séparé). La carte « Tournoi du couple » du canevas suppose de compter les victoires : hors périmètre elle aussi.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/lib/dames/plateau.ts` | Géométrie du damier : numérotation 1–50, conversion case ↔ coordonnées, voisinage diagonal, sens d'avance, rangée de promotion. Aucune notion de coup. |
| `src/lib/dames/etat.ts` | Types `Camp`, `Piece`, `Case`, `EtatPlateau`, `Coup` ; position de départ ; lecture sûre d'une case. |
| `src/lib/dames/coups.ts` | Génération des coups : déplacements simples, rafles récursives (pions puis dames), rafle maximale, déduplication. Expose `coupsLegaux`. |
| `src/lib/dames/partie.ts` | `appliquer` (avec promotion) et `issue` (fin de partie). L'API que consomme l'interface. |
| `src/lib/dames/etat-schema.ts` | Schéma Zod de la **forme** de l'état, partagé par la route de sauvegarde et la reprise côté client. |
| `src/lib/dames/interaction.ts` | Ce qui se passe quand on touche une case : sélection, progression dans une rafle, refus expliqué. Pur, donc testable. |
| `src/lib/dames/perft.ts` | Le compteur de nœuds, utilisé uniquement par les tests. |
| `tailwind.config.ts` | Les deux teintes du damier relevées dans le canevas (`damier.clair`, `damier.fonce`). |
| `prisma/schema.prisma` | Modèle `BoardGame` + relation inverse sur `Couple`. |
| `prisma/migrations/20260908000000_board_games/migration.sql` | Table + index unique partiel. |
| `src/app/api/salon/route.ts` | `POST` — créer ou reprendre. |
| `src/app/api/salon/current/route.ts` | `GET` — la partie en cours. |
| `src/app/api/salon/[id]/state/route.ts` | `PUT` — sauvegarder, avec la garde monotone sur `moveCount`. |
| `src/app/api/salon/[id]/end/route.ts` | `POST` — terminer ou abandonner. |
| `src/lib/salon/api.ts` | Le client typé des quatre routes, côté navigateur. |
| `src/components/dames/Damier.tsx` | Le rendu du plateau et son accessibilité. Ne décide d'aucune règle. |
| `src/app/salon/page.tsx` | Le menu de la rubrique. |
| `src/app/salon/dames/page.tsx` | L'écran de jeu : sélection, rafles, persistance. |
| `src/components/app/AppShell.tsx` | Ajout de l'entrée de navigation. |

---

### Task 1: Géométrie du damier

**Files:**
- Create: `frontend/src/lib/dames/plateau.ts`
- Test: `frontend/src/lib/dames/plateau.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `NB_CASES: 50`, `DIRECTIONS: readonly Direction[]`, `coordonnees(caseNum: number): Coordonnees`, `numeroCase(rangee: number, colonne: number): number | null`, `voisine(caseNum: number, dir: Direction, distance?: number): number | null`, `sensAvance(camp: 'blanc' | 'noir'): -1 | 1`, `rangeePromotion(camp: 'blanc' | 'noir'): 0 | 9`. Types `Direction` et `Coordonnees` exportés.

Le damier compte 100 cases mais seules les 50 sombres sont jouables. La notation officielle FMJD les numérote 1 à 50, de gauche à droite puis de haut en bas. Toute la suite manipule ces numéros ; les coordonnées ne servent qu'ici.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/plateau.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  coordonnees,
  numeroCase,
  voisine,
  sensAvance,
  rangeePromotion,
  NB_CASES,
  DIRECTIONS,
} from './plateau';

describe('numérotation officielle des 50 cases jouables', () => {
  it('place la case 1 en haut à gauche, sur la première case sombre', () => {
    expect(coordonnees(1)).toEqual({ rangee: 0, colonne: 1 });
  });

  it('place la case 50 en bas à droite', () => {
    expect(coordonnees(50)).toEqual({ rangee: 9, colonne: 8 });
  });

  it("fait l'aller-retour case → coordonnées → case sur les 50 cases", () => {
    for (let n = 1; n <= NB_CASES; n += 1) {
      const { rangee, colonne } = coordonnees(n);
      expect(numeroCase(rangee, colonne)).toBe(n);
    }
  });

  it('refuse les cases claires, qui ne sont jamais jouables', () => {
    // Rangée 0 : les cases jouables sont en colonnes impaires.
    expect(numeroCase(0, 0)).toBeNull();
    // Rangée 1 : elles sont en colonnes paires.
    expect(numeroCase(1, 1)).toBeNull();
  });

  it('refuse tout ce qui sort du damier', () => {
    expect(numeroCase(-1, 1)).toBeNull();
    expect(numeroCase(10, 1)).toBeNull();
    expect(numeroCase(0, 11)).toBeNull();
  });
});

describe('voisinage diagonal', () => {
  // Valeur de référence : depuis la case 1, les deux seules cases
  // atteignables en descendant sont 6 et 7. C'est la première ligne de
  // toutes les tables publiées, et elle vérifie la formule d'un coup.
  it('relie la case 1 aux cases 6 et 7 en descendant', () => {
    const descendantes = DIRECTIONS.filter((d) => d.dr === 1)
      .map((d) => voisine(1, d))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(descendantes).toEqual([6, 7]);
  });

  it("n'a aucune voisine hors du damier depuis un bord", () => {
    // La case 5 est au bord droit de la rangée 0 : pas de voisine à droite,
    // et rien au-dessus.
    expect(voisine(5, { dr: 1, dc: 1 })).toBeNull();
    expect(voisine(5, { dr: -1, dc: -1 })).toBeNull();
  });

  it('glisse sur plusieurs cases dans la même direction', () => {
    // 1 → 7 → 12 : la même diagonale, distance 1 puis 2.
    expect(voisine(1, { dr: 1, dc: 1 })).toBe(7);
    expect(voisine(1, { dr: 1, dc: 1 }, 2)).toBe(12);
  });

  it('propose exactement les quatre diagonales', () => {
    expect(DIRECTIONS).toHaveLength(4);
  });
});

describe('sens de jeu', () => {
  // Les noirs occupent les cases 1-20 et descendent ; les blancs occupent
  // 31-50 et montent. C'est le standard, et les blancs ouvrent.
  it('fait descendre les noirs et monter les blancs', () => {
    expect(sensAvance('noir')).toBe(1);
    expect(sensAvance('blanc')).toBe(-1);
  });

  it('promeut chaque camp sur la rangée du fond adverse', () => {
    expect(rangeePromotion('blanc')).toBe(0);
    expect(rangeePromotion('noir')).toBe(9);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/plateau.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./plateau"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `frontend/src/lib/dames/plateau.ts` :

```ts
// Géométrie du damier international 10×10.
//
// Le damier a 100 cases, mais on ne joue que sur les 50 sombres. La
// notation officielle de la fédération les numérote 1 à 50, de gauche à
// droite puis de haut en bas — c'est cette numérotation que manipule tout
// le moteur, et c'est elle qu'on lit dans la littérature. Les coordonnées
// (rangée, colonne) ne servent qu'à ce fichier : personne d'autre n'a
// besoin de savoir qu'un damier est un carré.

export const NB_CASES = 50;

export interface Coordonnees {
  readonly rangee: number; // 0 (haut) à 9 (bas)
  readonly colonne: number; // 0 (gauche) à 9 (droite)
}

/** Un pas diagonal. `dr` descend quand il vaut 1, `dc` va à droite. */
export interface Direction {
  readonly dr: -1 | 1;
  readonly dc: -1 | 1;
}

export const DIRECTIONS: readonly Direction[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];

export function coordonnees(caseNum: number): Coordonnees {
  const i = caseNum - 1;
  const rangee = Math.floor(i / 5);
  // Une rangée paire porte ses cases jouables en colonnes impaires, et
  // réciproquement — c'est ce décalage qui fait le damier.
  const colonne = 2 * (i % 5) + (rangee % 2 === 0 ? 1 : 0);
  return { rangee, colonne };
}

/** `null` hors du damier, ou sur une case claire (jamais jouable). */
export function numeroCase(rangee: number, colonne: number): number | null {
  if (rangee < 0 || rangee > 9 || colonne < 0 || colonne > 9) return null;
  const pariteAttendue = rangee % 2 === 0 ? 1 : 0;
  if (colonne % 2 !== pariteAttendue) return null;
  return rangee * 5 + Math.floor(colonne / 2) + 1;
}

/** La case atteinte en partant de `caseNum`, `distance` pas dans `dir`. */
export function voisine(caseNum: number, dir: Direction, distance = 1): number | null {
  const { rangee, colonne } = coordonnees(caseNum);
  return numeroCase(rangee + dir.dr * distance, colonne + dir.dc * distance);
}

/** Les noirs partent du haut et descendent ; les blancs font l'inverse. */
export function sensAvance(camp: 'blanc' | 'noir'): -1 | 1 {
  return camp === 'noir' ? 1 : -1;
}

/** La rangée du fond adverse, où un pion qui s'arrête devient dame. */
export function rangeePromotion(camp: 'blanc' | 'noir'): 0 | 9 {
  return camp === 'blanc' ? 0 : 9;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/plateau.test.ts
```

Attendu : SUCCÈS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/plateau.ts frontend/src/lib/dames/plateau.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): la géométrie du damier international

La numérotation officielle 1-50 des cases sombres, l'aller-retour vers les
coordonnées, et le voisinage diagonal. Le test de référence est le
voisinage de la case 1 (6 et 7), première ligne de toutes les tables
publiées.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: État du plateau et position de départ

**Files:**
- Create: `frontend/src/lib/dames/etat.ts`
- Test: `frontend/src/lib/dames/etat.test.ts`

**Interfaces:**
- Consumes: `NB_CASES`, `coordonnees` de `./plateau`.
- Produces: types `Camp = 'blanc' | 'noir'`, `Piece { camp: Camp; dame: boolean }`, `Case = Piece | null`, `EtatPlateau { cases: readonly Case[]; trait: Camp }`, `Coup { depart: number; arrivee: number; captures: readonly number[]; paliers: readonly number[] }` ; fonctions `positionDepart(): EtatPlateau`, `pieceEn(cases: readonly Case[], caseNum: number): Case`, `adversaire(camp: Camp): Camp`, `plateauVide(): Case[]`.

`pieceEn` existe pour une raison précise : le dépôt active `noUncheckedIndexedAccess`, donc `cases[i]` a le type `Case | undefined`. Une seule fonction normalise ce `undefined` en `null`, plutôt que trente `?? null` dispersés.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/etat.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { positionDepart, pieceEn, adversaire, plateauVide } from './etat';

describe('position de départ', () => {
  const depart = positionDepart();

  it('donne les cases 1 à 20 aux noirs', () => {
    for (let n = 1; n <= 20; n += 1) {
      expect(pieceEn(depart.cases, n)).toEqual({ camp: 'noir', dame: false });
    }
  });

  it('laisse les deux rangées du milieu vides', () => {
    for (let n = 21; n <= 30; n += 1) {
      expect(pieceEn(depart.cases, n)).toBeNull();
    }
  });

  it('donne les cases 31 à 50 aux blancs', () => {
    for (let n = 31; n <= 50; n += 1) {
      expect(pieceEn(depart.cases, n)).toEqual({ camp: 'blanc', dame: false });
    }
  });

  it('ne place aucune dame au départ', () => {
    expect(depart.cases.filter((c) => c?.dame)).toEqual([]);
  });

  it('fait ouvrir les blancs', () => {
    expect(depart.trait).toBe('blanc');
  });

  it('compte exactement 50 cases', () => {
    expect(depart.cases).toHaveLength(50);
  });
});

describe('lecture sûre du plateau', () => {
  it('rend null hors du damier plutôt que undefined', () => {
    // `noUncheckedIndexedAccess` fait de cases[i] un `Case | undefined`.
    // Le moteur ne doit jamais avoir à distinguer les deux.
    expect(pieceEn(plateauVide(), 0)).toBeNull();
    expect(pieceEn(plateauVide(), 51)).toBeNull();
  });
});

describe('camps', () => {
  it('oppose les deux camps', () => {
    expect(adversaire('blanc')).toBe('noir');
    expect(adversaire('noir')).toBe('blanc');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/etat.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./etat"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `frontend/src/lib/dames/etat.ts` :

```ts
// L'état d'une partie de dames, et rien d'autre.
//
// Volontairement sans dépendance : ni Prisma, ni React, ni DOM. C'est ce
// qui permet au même module de tourner dans le navigateur pendant la
// partie, dans Vitest pour le perft, et un jour dans une IA ou sur le
// serveur, sans une ligne à changer.
import { NB_CASES } from './plateau';

export type Camp = 'blanc' | 'noir';

export interface Piece {
  readonly camp: Camp;
  readonly dame: boolean;
}

export type Case = Piece | null;

export interface EtatPlateau {
  /** 50 entrées ; l'index `i` porte la case numéro `i + 1`. */
  readonly cases: readonly Case[];
  readonly trait: Camp;
}

/**
 * Un coup complet, rafle comprise.
 *
 * `paliers` porte les cases d'atterrissage intermédiaires d'une rafle, dans
 * l'ordre où on les traverse — l'interface en a besoin pour animer la
 * séquence et pour ne proposer, après chaque saut, que les continuations de
 * la rafle en cours.
 */
export interface Coup {
  readonly depart: number;
  readonly arrivee: number;
  /** Cases des pièces prises, triées par numéro croissant. */
  readonly captures: readonly number[];
  readonly paliers: readonly number[];
}

export function adversaire(camp: Camp): Camp {
  return camp === 'blanc' ? 'noir' : 'blanc';
}

export function plateauVide(): Case[] {
  return Array.from({ length: NB_CASES }, () => null);
}

/**
 * Lecture d'une case par son numéro officiel (1-50).
 *
 * Rend `null` — jamais `undefined` — pour toute case hors du damier. Le
 * dépôt active `noUncheckedIndexedAccess`, donc `cases[i]` est
 * `Case | undefined` ; cette fonction est le seul endroit qui s'en occupe.
 */
export function pieceEn(cases: readonly Case[], caseNum: number): Case {
  return cases[caseNum - 1] ?? null;
}

export function positionDepart(): EtatPlateau {
  const cases = plateauVide();
  for (let n = 1; n <= 20; n += 1) cases[n - 1] = { camp: 'noir', dame: false };
  for (let n = 31; n <= 50; n += 1) cases[n - 1] = { camp: 'blanc', dame: false };
  // Les blancs ouvrent — standard de la fédération, et l'hypothèse de
  // toutes les valeurs de perft utilisées par Task 7.
  return { cases, trait: 'blanc' };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/etat.test.ts
```

Attendu : SUCCÈS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/etat.ts frontend/src/lib/dames/etat.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): l'état du plateau et la position de départ

Types du domaine, position initiale (noirs 1-20, blancs 31-50, blancs au
trait) et lecture sûre d'une case — `pieceEn` normalise une bonne fois le
`undefined` que `noUncheckedIndexedAccess` impose sur chaque accès indexé.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Déplacements simples

**Files:**
- Create: `frontend/src/lib/dames/coups.ts`
- Test: `frontend/src/lib/dames/coups-simples.test.ts`

**Interfaces:**
- Consumes: `DIRECTIONS`, `voisine`, `sensAvance` de `./plateau` ; `EtatPlateau`, `Coup`, `Case`, `Camp`, `pieceEn`, `plateauVide` de `./etat`.
- Produces: `coupsSimples(etat: EtatPlateau): Coup[]` — les déplacements sans prise du camp au trait. Un pion avance d'une case en diagonale ; une dame glisse sur toute la diagonale libre.

Un déplacement simple n'est légal que s'il n'existe aucune prise (Task 5). Cette fonction ne le sait pas et n'a pas à le savoir : elle génère, `coupsLegaux` arbitre.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/coups-simples.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { coupsSimples } from './coups';
import { positionDepart, plateauVide, type EtatPlateau } from './etat';

describe('déplacements des pions', () => {
  it('offre exactement 9 coups depuis la position de départ', () => {
    // Valeur de référence : perft(1) = 9 depuis la position initiale.
    // Seule la rangée avancée des blancs (cases 31-35) peut bouger, et la
    // case 35, au bord, n'a qu'une diagonale libre : 2+2+2+2+1 = 9.
    expect(coupsSimples(positionDepart())).toHaveLength(9);
  });

  it('ne fait avancer un pion que vers le camp adverse', () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: false }; // case 28, au centre
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    // Les blancs montent : depuis 28, ce sont 22 et 23, jamais 32 ni 33.
    expect(coupsSimples(etat).map((c) => c.arrivee).sort((a, b) => a - b)).toEqual([22, 23]);
  });

  it('ne traverse pas une case occupée', () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: false }; // 28
    cases[21] = { camp: 'noir', dame: false }; // 22, devant à gauche
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    expect(coupsSimples(etat).map((c) => c.arrivee)).toEqual([23]);
  });

  it('ne capture jamais : les coups simples n’ont ni prise ni palier', () => {
    for (const coup of coupsSimples(positionDepart())) {
      expect(coup.captures).toEqual([]);
      expect(coup.paliers).toEqual([]);
    }
  });
});

describe('déplacements des dames', () => {
  it('glisse sur toute la diagonale libre', () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: true }; // dame en 28
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    const arrivees = coupsSimples(etat)
      .map((c) => c.arrivee)
      .sort((a, b) => a - b);
    // Depuis 28, les quatre diagonales complètes sur un plateau par
    // ailleurs vide : 4 + 5 + 4 + 4 = 17 cases.
    expect(arrivees).toEqual([
      5, 6, 10, 11, 14, 17, 19, 22, 23, 32, 33, 37, 39, 41, 44, 46, 50,
    ]);
  });

  it("s'arrête juste avant une pièce, quelle que soit sa couleur", () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: true }; // 28
    cases[21] = { camp: 'blanc', dame: false }; // 22 : bloque la diagonale
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    expect(coupsSimples(etat).map((c) => c.arrivee)).not.toContain(17);
    expect(coupsSimples(etat).map((c) => c.arrivee)).not.toContain(22);
  });
});

describe('trait', () => {
  it("ne génère jamais les coups du camp qui n'est pas au trait", () => {
    const coups = coupsSimples({ ...positionDepart(), trait: 'noir' });
    // Les noirs occupent 1-20 et descendent : leur rangée avancée est 16-20.
    expect(coups.every((c) => c.depart >= 16 && c.depart <= 20)).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/coups-simples.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./coups"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `frontend/src/lib/dames/coups.ts` :

```ts
// Génération des coups.
//
// Trois couches, dans cet ordre : les déplacements simples (ici), les
// rafles (Tasks 4-5), puis l'arbitrage entre les deux (Task 6). La
// séparation est réelle : un déplacement simple n'est légal que s'il
// n'existe aucune prise, et c'est `coupsLegaux` — et lui seul — qui le
// décide.
import { DIRECTIONS, voisine, sensAvance } from './plateau';
import { type Camp, type Case, type Coup, type EtatPlateau, pieceEn } from './etat';

/** Déplacements sans prise du camp au trait. Ne dit rien de leur légalité. */
export function coupsSimples(etat: EtatPlateau): Coup[] {
  const coups: Coup[] = [];
  for (let depart = 1; depart <= etat.cases.length; depart += 1) {
    const piece = pieceEn(etat.cases, depart);
    if (piece === null || piece.camp !== etat.trait) continue;

    if (piece.dame) {
      for (const dir of DIRECTIONS) {
        // La dame glisse tant que la case suivante est libre, et s'arrête
        // sur la première pièce rencontrée — sans distinguer sa couleur :
        // on ne prend pas dans un déplacement simple.
        for (let d = 1; ; d += 1) {
          const arrivee = voisine(depart, dir, d);
          if (arrivee === null || pieceEn(etat.cases, arrivee) !== null) break;
          coups.push({ depart, arrivee, captures: [], paliers: [] });
        }
      }
      continue;
    }

    // Un pion n'avance que vers le camp adverse — contrairement à la
    // prise, qui se fait dans les quatre directions.
    const dr = sensAvance(piece.camp);
    for (const dir of DIRECTIONS) {
      if (dir.dr !== dr) continue;
      const arrivee = voisine(depart, dir);
      if (arrivee === null || pieceEn(etat.cases, arrivee) !== null) continue;
      coups.push({ depart, arrivee, captures: [], paliers: [] });
    }
  }
  return coups;
}

/** Vrai si `caseNum` porte une pièce du camp opposé à `camp`. */
export function estAdverse(cases: readonly Case[], caseNum: number, camp: Camp): boolean {
  const piece = pieceEn(cases, caseNum);
  return piece !== null && piece.camp !== camp;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/coups-simples.test.ts
```

Attendu : SUCCÈS, 8 tests. Le premier — les 9 coups d'ouverture — est déjà une confrontation à `perft(1)`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/coups.ts frontend/src/lib/dames/coups-simples.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): les déplacements sans prise

Le pion avance d'une case vers le camp adverse, la dame glisse sur la
diagonale libre. Le test d'ouverture confronte déjà le générateur à
perft(1) = 9.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rafles des pions

**Files:**
- Modify: `frontend/src/lib/dames/coups.ts`
- Test: `frontend/src/lib/dames/rafles-pions.test.ts`

**Interfaces:**
- Consumes: tout ce que Task 3 a produit.
- Produces: `raflesBrutes(etat: EtatPlateau): Coup[]` — **toutes** les séquences de prise possibles, sans filtrage ni déduplication (Task 6 s'en charge). Gère les pions ; Task 5 y ajoutera les dames.

Deux règles gouvernent cette fonction, et ce sont elles qui font échouer la plupart des implémentations :

1. **Les pièces prises restent sur le plateau** jusqu'à la fin de la rafle. Elles ne peuvent plus être reprises, mais elles bloquent toujours le passage. Les retirer au fil de l'eau autoriserait de sauter deux fois la même pièce.
2. **La pièce qui rafle est retirée de sa case de départ** avant la recherche. Sa case d'origine devient donc libre et peut servir d'atterrissage — ce qui arrive réellement dans les rafles circulaires.

Un pion prend dans les **quatre** directions, en avant comme en arrière. Et il ne devient jamais dame en cours de rafle, même en traversant la dernière rangée : c'est `appliquer` (Task 6) qui décide de la promotion, sur la seule case d'arrivée.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/rafles-pions.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { raflesBrutes } from './coups';
import { plateauVide, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('prise simple par un pion', () => {
  it('saute une pièce adverse et atterrit juste derrière', () => {
    // Blanc en 33 ; noir en 28 ; la case 22 est libre.
    const rafles = raflesBrutes(etatAvec([[33, 'blanc'], [28, 'noir']], 'blanc'));
    expect(rafles).toHaveLength(1);
    expect(rafles[0]).toMatchObject({ depart: 33, arrivee: 22, captures: [28] });
  });

  it('prend aussi en arrière', () => {
    // Le pion blanc en 28 monte normalement ; ici la prise est vers le bas.
    const rafles = raflesBrutes(etatAvec([[28, 'blanc'], [33, 'noir']], 'blanc'));
    expect(rafles.map((r) => r.arrivee)).toEqual([39]);
  });

  it('ne saute pas si la case derrière est occupée', () => {
    expect(raflesBrutes(etatAvec([[33, 'blanc'], [28, 'noir'], [22, 'noir']], 'blanc'))).toEqual([]);
  });

  it('ne saute jamais une pièce de son propre camp', () => {
    expect(raflesBrutes(etatAvec([[33, 'blanc'], [28, 'blanc']], 'blanc'))).toEqual([]);
  });
});

describe('rafles enchaînées', () => {
  it('enchaîne deux prises et garde le palier intermédiaire', () => {
    // 33 saute 28 (atterrit 22), puis saute 17 (atterrit 11).
    const rafles = raflesBrutes(
      etatAvec([[33, 'blanc'], [28, 'noir'], [17, 'noir']], 'blanc'),
    );
    const deux = rafles.filter((r) => r.captures.length === 2);
    expect(deux).toHaveLength(1);
    expect(deux[0]).toMatchObject({ depart: 33, arrivee: 11, paliers: [22] });
    expect([...(deux[0]?.captures ?? [])].sort((a, b) => a - b)).toEqual([17, 28]);
  });

  it('ne saute jamais deux fois la même pièce', () => {
    // Une pièce déjà prise reste sur le plateau et bloque : aucune rafle ne
    // peut donc compter deux fois la même case.
    for (const rafle of raflesBrutes(
      etatAvec([[33, 'blanc'], [28, 'noir'], [17, 'noir'], [16, 'noir']], 'blanc'),
    )) {
      expect(new Set(rafle.captures).size).toBe(rafle.captures.length);
    }
  });
});

describe('rafle traversant la rangée de promotion', () => {
  it('repart de la rangée du fond sans changer de nature', () => {
    // Le pion blanc en 13 saute 8, se pose en 2 — sur la rangée 0, celle
    // de sa promotion — puis repart en arrière sauter 7 et finit en 11.
    //
    // Un pion ne peut atteindre la rangée du fond qu'en s'y posant : le
    // saut suivant devrait sortir du damier. La seule continuation possible
    // est donc un retour en arrière, et c'est exactement ce cas qui
    // distingue « promu en vol » de « promu à l'arrivée ». Que la rafle
    // existe suffit ici ; que la pièce ne soit PAS une dame au bout est
    // vérifié par `appliquer` (Task 6), seul responsable de la promotion.
    const rafles = raflesBrutes(
      etatAvec([[13, 'blanc'], [8, 'noir'], [7, 'noir']], 'blanc'),
    );
    expect(rafles).toHaveLength(1);
    expect(rafles[0]).toMatchObject({ depart: 13, arrivee: 11, paliers: [2] });
    expect([...(rafles[0]?.captures ?? [])].sort((a, b) => a - b)).toEqual([7, 8]);
  });
});

describe('trait', () => {
  it("ne génère aucune rafle pour le camp qui n'est pas au trait", () => {
    expect(raflesBrutes(etatAvec([[33, 'blanc'], [28, 'noir']], 'noir'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/rafles-pions.test.ts
```

Attendu : ÉCHEC — `raflesBrutes is not a function` (export absent).

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à la fin de `frontend/src/lib/dames/coups.ts` :

```ts
/**
 * Toutes les séquences de prise du camp au trait, sans arbitrage.
 *
 * « Brutes » au sens strict : ni filtre de rafle maximale, ni
 * déduplication. Task 6 s'en charge — séparer la génération de l'arbitrage
 * est ce qui rend les deux testables.
 */
export function raflesBrutes(etat: EtatPlateau): Coup[] {
  const coups: Coup[] = [];
  for (let depart = 1; depart <= etat.cases.length; depart += 1) {
    const piece = pieceEn(etat.cases, depart);
    if (piece === null || piece.camp !== etat.trait) continue;

    // La pièce qui rafle est retirée de sa case de départ pour toute la
    // durée de la recherche. Sa case d'origine devient donc un
    // atterrissage possible — ce qui arrive dans les rafles circulaires, et
    // qu'on manquerait en la laissant en place.
    const travail = [...etat.cases];
    travail[depart - 1] = null;

    explorer(travail, piece.camp, piece.dame, depart, depart, [], [], coups);
  }
  return coups;
}

/**
 * Poursuit une rafle depuis `position`, en profondeur.
 *
 * `capturees` porte les cases des pièces déjà prises **dans cette
 * séquence**. Elles restent physiquement sur `cases` : elles ne peuvent
 * plus être reprises, mais elles bloquent toujours le passage. C'est cette
 * distinction — prise mais présente — qui interdit de sauter deux fois la
 * même pièce, et sans elle le générateur invente des rafles impossibles.
 */
function explorer(
  cases: readonly Case[],
  camp: Camp,
  dame: boolean,
  depart: number,
  position: number,
  capturees: readonly number[],
  paliers: readonly number[],
  sortie: Coup[],
): void {
  let prolongee = false;

  for (const dir of DIRECTIONS) {
    // Un pion prend dans les quatre directions — en avant comme en
    // arrière. Seul son déplacement simple est orienté.
    const victime = voisine(position, dir);
    const atterrissage = voisine(position, dir, 2);
    if (victime === null || atterrissage === null) continue;
    if (!estAdverse(cases, victime, camp)) continue;
    if (capturees.includes(victime)) continue;
    if (pieceEn(cases, atterrissage) !== null) continue;

    prolongee = true;
    explorer(
      cases,
      camp,
      dame,
      depart,
      atterrissage,
      [...capturees, victime],
      [...paliers, atterrissage],
      sortie,
    );
  }

  // Une rafle se termine quand plus aucune prise ne la prolonge. Le
  // dernier palier est la case d'arrivée, pas un palier.
  if (!prolongee && capturees.length > 0) {
    sortie.push({
      depart,
      arrivee: position,
      captures: [...capturees].sort((a, b) => a - b),
      paliers: paliers.slice(0, -1),
    });
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/rafles-pions.test.ts
```

Attendu : SUCCÈS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/coups.ts frontend/src/lib/dames/rafles-pions.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): les rafles des pions

Recherche récursive des séquences de prise. Deux invariants portent tout :
les pièces prises restent sur le plateau jusqu'à la fin de la rafle (sinon
on saute deux fois la même), et la pièce qui rafle est retirée de sa case
de départ (qui devient un atterrissage possible dans les rafles
circulaires).

Un pion qui traverse la dernière rangée sans s'y arrêter n'est pas promu :
la promotion appartient à `appliquer`, pas au générateur.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Rafles des dames volantes

**Files:**
- Modify: `frontend/src/lib/dames/coups.ts` (la fonction `explorer`)
- Test: `frontend/src/lib/dames/rafles-dames.test.ts`

**Interfaces:**
- Consumes / Produces: aucune signature ne change. `explorer` cesse d'ignorer son paramètre `dame`.

Une dame glisse sur la diagonale, franchit **exactement une** pièce adverse non encore capturée, et se pose sur **n'importe quelle** case libre au-delà. Chaque atterrissage ouvre des continuations différentes : l'exploration doit donc brancher sur les cases d'arrivée, et pas seulement sur les pièces prises.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/rafles-dames.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { raflesBrutes } from './coups';
import { plateauVide, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('prise par une dame volante', () => {
  it('prend une pièce éloignée sur sa diagonale', () => {
    // Dame blanche en 46, pion noir en 28 : entre les deux, 41 et 37 sont
    // libres, donc la prise est possible malgré la distance.
    const rafles = raflesBrutes(etatAvec([[46, 'blanc', true], [28, 'noir']], 'blanc'));
    expect(rafles.length).toBeGreaterThan(0);
    expect(rafles.every((r) => r.captures.length === 1 && r.captures[0] === 28)).toBe(true);
  });

  it('propose toutes les cases libres derrière la pièce prise', () => {
    // La diagonale montante depuis 46 est 41, 37, 32, 28, 23, 19, 14, 10, 5.
    // Après avoir sauté 28, tout ce qui suit est un atterrissage possible.
    const arrivees = raflesBrutes(etatAvec([[46, 'blanc', true], [28, 'noir']], 'blanc'))
      .map((r) => r.arrivee)
      .sort((a, b) => a - b);
    expect(arrivees).toEqual([5, 10, 14, 19, 23]);
  });

  it("s'arrête sur la première case occupée derrière la pièce prise", () => {
    // Un pion blanc en 19 borne la diagonale : seule la case 23 reste. Il
    // est du même camp délibérément — une pièce noire en 19 serait une
    // seconde prise, et la rafle continuerait au lieu de s'arrêter.
    const rafles = raflesBrutes(
      etatAvec([[46, 'blanc', true], [28, 'noir'], [19, 'blanc']], 'blanc'),
    );
    expect(rafles.map((r) => r.arrivee)).toEqual([23]);
  });

  it('ne franchit jamais deux pièces à la suite', () => {
    // 37 et 32 sont adjacentes sur la diagonale : rien à prendre.
    expect(
      raflesBrutes(etatAvec([[46, 'blanc', true], [41, 'noir'], [37, 'noir']], 'blanc')),
    ).toEqual([]);
  });

  it("ne franchit jamais une pièce de son propre camp", () => {
    expect(raflesBrutes(etatAvec([[46, 'blanc', true], [28, 'blanc']], 'blanc'))).toEqual([]);
  });

  it('ne repasse jamais par-dessus une pièce déjà prise dans la rafle', () => {
    for (const rafle of raflesBrutes(
      etatAvec(
        [[46, 'blanc', true], [28, 'noir'], [13, 'noir'], [22, 'noir']],
        'blanc',
      ),
    )) {
      expect(new Set(rafle.captures).size).toBe(rafle.captures.length);
    }
  });
});

describe('atterrissages et continuations', () => {
  it('ouvre des continuations différentes selon la case d’atterrissage', () => {
    // Le point de la dame volante : après une prise, où l'on se pose
    // décide de ce qu'on peut prendre ensuite. Le générateur doit donc
    // brancher sur chaque atterrissage, pas seulement sur la victime.
    const rafles = raflesBrutes(
      etatAvec([[46, 'blanc', true], [28, 'noir'], [12, 'noir']], 'blanc'),
    );
    const longueurs = new Set(rafles.map((r) => r.captures.length));
    expect(longueurs.has(1)).toBe(true);
    expect(longueurs.has(2)).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/rafles-dames.test.ts
```

Attendu : ÉCHEC — la dame est traitée comme un pion, donc « prend une pièce éloignée » rend un tableau vide.

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `frontend/src/lib/dames/coups.ts`, remplacer la boucle `for (const dir of DIRECTIONS)` de `explorer` par cette version, qui branche sur le type de pièce :

```ts
  for (const dir of DIRECTIONS) {
    if (dame) {
      // Une dame glisse jusqu'à la première pièce rencontrée.
      // Nommée `victimeDame` et non `victime` pour ne pas masquer la
      // variable du bloc voisin — ESLint refuse le doublon.
      let distance = 1;
      let victimeDame: number | null = null;
      for (; ; distance += 1) {
        const sq = voisine(position, dir, distance);
        if (sq === null) break;
        if (pieceEn(cases, sq) === null) continue;
        // Première pièce sur la diagonale. Elle n'est franchissable que si
        // elle est adverse ET pas déjà prise dans cette rafle — une pièce
        // déjà capturée reste un bloqueur.
        if (estAdverse(cases, sq, camp) && !capturees.includes(sq)) victimeDame = sq;
        break;
      }
      if (victimeDame === null) continue;

      // Chaque case libre au-delà de la victime est un atterrissage
      // possible, et chacune ouvre des continuations différentes. C'est
      // pour cela que l'exploration branche ici et pas seulement sur la
      // pièce prise.
      for (let apres = distance + 1; ; apres += 1) {
        const atterrissage = voisine(position, dir, apres);
        if (atterrissage === null || pieceEn(cases, atterrissage) !== null) break;
        prolongee = true;
        explorer(
          cases,
          camp,
          dame,
          depart,
          atterrissage,
          [...capturees, victimeDame],
          [...paliers, atterrissage],
          sortie,
        );
      }
      continue;
    }

    // Un pion prend dans les quatre directions — en avant comme en
    // arrière. Seul son déplacement simple est orienté.
    const victime = voisine(position, dir);
    const atterrissage = voisine(position, dir, 2);
    if (victime === null || atterrissage === null) continue;
    if (!estAdverse(cases, victime, camp)) continue;
    if (capturees.includes(victime)) continue;
    if (pieceEn(cases, atterrissage) !== null) continue;

    prolongee = true;
    explorer(
      cases,
      camp,
      dame,
      depart,
      atterrissage,
      [...capturees, victime],
      [...paliers, atterrissage],
      sortie,
    );
  }
```

- [ ] **Step 4: Lancer les tests du moteur pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/
```

Attendu : SUCCÈS. Les tests de Task 4 doivent rester verts — les pions n'ont pas changé de comportement.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/coups.ts frontend/src/lib/dames/rafles-dames.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): les rafles de la dame volante

La dame franchit exactement une pièce adverse et se pose sur n'importe
quelle case libre au-delà. L'exploration branche sur chaque atterrissage,
car c'est le point de pose qui décide des continuations — pas la pièce
prise.

Une pièce déjà capturée dans la rafle reste un bloqueur : la dame ne peut
ni la reprendre ni la franchir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rafle maximale, déduplication, et l'API du moteur

**Files:**
- Modify: `frontend/src/lib/dames/coups.ts`
- Create: `frontend/src/lib/dames/partie.ts`
- Test: `frontend/src/lib/dames/coups-legaux.test.ts`, `frontend/src/lib/dames/partie.test.ts`

**Interfaces:**
- Consumes: `coupsSimples`, `raflesBrutes` de `./coups`.
- Produces: `coupsLegaux(etat: EtatPlateau): Coup[]` (dans `coups.ts`) ; `appliquer(etat: EtatPlateau, coup: Coup): EtatPlateau` et `issue(etat: EtatPlateau): Issue` (dans `partie.ts`), avec `export type Issue = { fini: false } | { fini: true; vainqueur: Camp }`.

Trois règles se rejoignent ici :

- **La prise est obligatoire.** S'il existe une rafle, aucun déplacement simple n'est légal.
- **La rafle maximale.** Parmi les rafles, seules celles qui prennent le plus de **pièces** sont légales. Le décompte porte sur le nombre de pièces, pas sur leur valeur : aux dames internationales une dame ne compte pas plus qu'un pion — c'est la variante italienne qui la privilégie, et confondre les deux est un piège classique.
- **La déduplication.** Deux rafles de même départ, même arrivée et même **ensemble** de pièces prises sont le même coup, même si l'ordre des prises diffère. Les doublons viennent de deux sources : la permutation de l'ordre des prises dans une rafle qui boucle, et le choix de la case d'atterrissage d'une dame volante — cette seconde source en produit dès deux captures (dame en 1, pions en 7 et 23). Sans cette règle, l'interface proposerait deux destinations identiques et indiscernables, et le perft divergerait à la profondeur 8.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend/src/lib/dames/coups-legaux.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { coupsLegaux } from './coups';
import { positionDepart, plateauVide, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('la prise est obligatoire', () => {
  it('supprime tous les déplacements simples dès qu’une prise existe', () => {
    // Le pion blanc en 33 peut avancer en 29 ; il peut aussi prendre en 28.
    // La prise étant obligatoire, avancer n'est plus légal.
    const coups = coupsLegaux(etatAvec([[33, 'blanc'], [28, 'noir'], [50, 'blanc']], 'blanc'));
    expect(coups.every((c) => c.captures.length > 0)).toBe(true);
  });

  it('rend les déplacements simples quand aucune prise n’existe', () => {
    expect(coupsLegaux(positionDepart())).toHaveLength(9);
  });
});

describe('rafle maximale', () => {
  // Position à deux branches inégales depuis la case 33 :
  //   - vers le haut : 33 saute 28 (palier 22) puis 17, et finit en 11 → 2 prises ;
  //   - vers le bas  : 33 saute 39 et finit en 44, sans suite → 1 prise.
  // Seule la première est légale.
  const DEUX_BRANCHES: readonly [number, 'blanc' | 'noir', boolean?][] = [
    [33, 'blanc'],
    [28, 'noir'],
    [17, 'noir'],
    [39, 'noir'],
  ];

  it('ne garde que les rafles les plus longues', () => {
    const coups = coupsLegaux(etatAvec(DEUX_BRANCHES, 'blanc'));
    expect(coups).toHaveLength(1);
    expect(coups[0]).toMatchObject({ depart: 33, arrivee: 11 });
    expect(coups[0]?.captures).toHaveLength(2);
  });

  it('compte les pièces, pas leur valeur : une dame ne vaut pas plus qu’un pion', () => {
    // La même position, sauf que la prise unique est celle d'une DAME.
    // Deux pions l'emportent quand même : la règle internationale compte
    // les pièces. (La variante italienne dit l'inverse — s'en inspirer ici
    // serait un bug silencieux, d'où ce test.)
    const coups = coupsLegaux(
      etatAvec([[33, 'blanc'], [28, 'noir'], [17, 'noir'], [39, 'noir', true]], 'blanc'),
    );
    expect(coups).toHaveLength(1);
    expect(coups[0]?.captures).toHaveLength(2);
  });
});

describe('déduplication des rafles', () => {
  it('ne propose jamais deux coups de même départ, arrivée et prises', () => {
    // Une dame au centre, entourée de quatre pions à prendre : la
    // configuration qui produit des séquences ne différant que par l'ordre
    // des sauts.
    const coups = coupsLegaux(
      etatAvec(
        [
          [28, 'blanc', true],
          [17, 'noir'],
          [19, 'noir'],
          [39, 'noir'],
          [37, 'noir'],
        ],
        'blanc',
      ),
    );
    expect(coups.length).toBeGreaterThan(0);
    const cles = coups.map(
      (c) => `${c.depart}-${c.arrivee}-${[...c.captures].sort((a, b) => a - b).join(',')}`,
    );
    expect(new Set(cles).size).toBe(cles.length);
  });
});
```

**Vérification obligatoire de ce dernier test** — il porte sur un invariant
toujours vrai après filtrage, donc il passerait même sur une position qui
n'exerce pas la déduplication. Avant de le déclarer bon, prouver qu'il mord :

1. Commenter le filtre de déduplication dans `coupsLegaux` (rendre
   `uniques` égal à `maximales`).
2. Relancer ce test. **Il doit échouer.**
3. S'il passe, la position ne produit aucun doublon : compter les doublons
   à la main avec `raflesBrutes` sur cette position, et en essayer d'autres
   (ajouter un cinquième pion, ou décaler la dame) jusqu'à en trouver une
   qui en produit. Ne pas garder un test qui ne peut pas échouer.
4. Rétablir le filtre et vérifier que le test repasse.

Le vrai garde-fou de cette règle est `perft(8)`, où les générateurs sans
déduplication divergent — mais 6,5 millions de nœuds sont trop lents pour
la suite de tests. Ce test est le substitut bon marché, et il ne vaut que
s'il a été vu échouer.

Créer `frontend/src/lib/dames/partie.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { appliquer, issue } from './partie';
import { coupsLegaux } from './coups';
import { positionDepart, plateauVide, pieceEn, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('application d’un coup', () => {
  it('déplace la pièce et passe le trait', () => {
    const depart = positionDepart();
    const apres = appliquer(depart, { depart: 33, arrivee: 28, captures: [], paliers: [] });
    expect(pieceEn(apres.cases, 33)).toBeNull();
    expect(pieceEn(apres.cases, 28)).toEqual({ camp: 'blanc', dame: false });
    expect(apres.trait).toBe('noir');
  });

  it('retire toutes les pièces capturées', () => {
    const etat = etatAvec([[33, 'blanc'], [28, 'noir'], [17, 'noir']], 'blanc');
    const apres = appliquer(etat, { depart: 33, arrivee: 11, captures: [17, 28], paliers: [22] });
    expect(pieceEn(apres.cases, 28)).toBeNull();
    expect(pieceEn(apres.cases, 17)).toBeNull();
  });

  it('ne modifie jamais l’état reçu', () => {
    const depart = positionDepart();
    appliquer(depart, { depart: 33, arrivee: 28, captures: [], paliers: [] });
    expect(pieceEn(depart.cases, 33)).toEqual({ camp: 'blanc', dame: false });
  });
});

describe('promotion', () => {
  it('promeut un pion qui s’arrête sur la rangée du fond', () => {
    const etat = etatAvec([[7, 'blanc']], 'blanc');
    const apres = appliquer(etat, { depart: 7, arrivee: 1, captures: [], paliers: [] });
    expect(pieceEn(apres.cases, 1)).toEqual({ camp: 'blanc', dame: true });
  });

  it('ne promeut pas un pion qui n’y fait que passer', () => {
    // 13 saute 8, se pose en 2 — sur la rangée de promotion — puis repart
    // en arrière sauter 7 et finit en 11. Il a touché le fond sans s'y
    // arrêter : il reste un pion. C'est LE test qui sépare « promu en vol »
    // de « promu à l'arrivée », et le bug le plus courant du domaine.
    const etat = etatAvec([[13, 'blanc'], [8, 'noir'], [7, 'noir']], 'blanc');
    const rafle = coupsLegaux(etat).find((c) => c.captures.length === 2);
    expect(rafle).toBeDefined();
    if (rafle === undefined) return;
    expect(rafle.arrivee).toBe(11);
    const apres = appliquer(etat, rafle);
    expect(pieceEn(apres.cases, 11)).toEqual({ camp: 'blanc', dame: false });
  });

  it('laisse une dame dame', () => {
    const etat = etatAvec([[7, 'blanc', true]], 'blanc');
    const apres = appliquer(etat, { depart: 7, arrivee: 12, captures: [], paliers: [] });
    expect(pieceEn(apres.cases, 12)?.dame).toBe(true);
  });
});

describe('fin de partie', () => {
  it('ne déclare rien tant qu’un coup reste possible', () => {
    expect(issue(positionDepart())).toEqual({ fini: false });
  });

  it('fait perdre le camp qui n’a plus de pièces', () => {
    expect(issue(etatAvec([[28, 'noir']], 'blanc'))).toEqual({ fini: true, vainqueur: 'noir' });
  });

  it('fait perdre le camp bloqué, même s’il lui reste des pièces', () => {
    // La case 46 est dans le coin : sa seule voisine est 41, et le seul
    // atterrissage derrière 41 est 37. Deux pions noirs sur ces deux cases
    // suffisent donc à enfermer complètement le pion blanc — il ne peut ni
    // avancer (41 occupée) ni prendre (37 occupée).
    //
    // Un seul pion blanc sur le damier, délibérément : toute pièce blanche
    // supplémentaire rendrait au camp une mobilité, et le test ne
    // prouverait plus rien.
    const bloque = etatAvec([[46, 'blanc'], [41, 'noir'], [37, 'noir']], 'blanc');
    expect(issue(bloque)).toEqual({ fini: true, vainqueur: 'noir' });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/coups-legaux.test.ts src/lib/dames/partie.test.ts
```

Attendu : ÉCHEC — `coupsLegaux is not a function` et `Failed to resolve import "./partie"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à la fin de `frontend/src/lib/dames/coups.ts` :

```ts
/**
 * Les coups légaux du camp au trait — la seule fonction de génération que
 * l'interface doit connaître.
 *
 * Trois règles s'appliquent dans cet ordre : la prise est obligatoire, la
 * rafle maximale l'emporte, et les rafles qui ne diffèrent que par l'ordre
 * des prises sont le même coup.
 */
export function coupsLegaux(etat: EtatPlateau): Coup[] {
  const rafles = raflesBrutes(etat);
  if (rafles.length === 0) return coupsSimples(etat);

  // La règle compte le NOMBRE de pièces, jamais leur valeur : une dame ne
  // vaut pas plus qu'un pion. (La variante italienne dit l'inverse — s'en
  // inspirer ici serait un bug silencieux.)
  const maximum = Math.max(...rafles.map((r) => r.captures.length));
  const maximales = rafles.filter((r) => r.captures.length === maximum);

  // Deux rafles de même départ, même arrivée et même ensemble de prises
  // sont le MÊME coup, quel que soit l'ordre des sauts. Deux sources en
  // produisent : l'ordre des prises dans une rafle qui boucle, et le choix
  // de la case d'atterrissage d'une dame volante — celle-ci dès deux
  // captures (dame en 1, pions en 7 et 23). C'est exactement là que deux
  // générateurs de référence divergent au perft(8). Sans ce filtre, l'interface proposerait au
  // joueur deux destinations identiques et indiscernables.
  const vues = new Set<string>();
  const uniques: Coup[] = [];
  for (const rafle of maximales) {
    const cle = `${rafle.depart}-${rafle.arrivee}-${rafle.captures.join(',')}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    uniques.push(rafle);
  }
  return uniques;
}
```

Créer `frontend/src/lib/dames/partie.ts` :

```ts
// Le déroulement d'une partie : jouer un coup, savoir si c'est fini.
//
// C'est l'API que consomme l'interface. Elle ne connaît de `coups.ts` que
// `coupsLegaux`, et de ce fichier que ces deux fonctions.
import { coordonnees, rangeePromotion } from './plateau';
import { coupsLegaux } from './coups';
import { type Camp, type Case, type Coup, type EtatPlateau, adversaire, pieceEn } from './etat';

export type Issue = { readonly fini: false } | { readonly fini: true; readonly vainqueur: Camp };

/**
 * Joue `coup` et rend le nouvel état. L'état reçu n'est jamais modifié.
 *
 * C'est ici — et nulle part ailleurs — que la promotion est décidée, sur la
 * seule case d'arrivée. Un pion qui traverse la rangée du fond au milieu
 * d'une rafle et repart reste un pion : promouvoir en vol lui donnerait le
 * déplacement de la dame pour le reste de la séquence, et allongerait des
 * rafles qui n'existent pas.
 */
export function appliquer(etat: EtatPlateau, coup: Coup): EtatPlateau {
  const piece = pieceEn(etat.cases, coup.depart);
  if (piece === null) {
    throw new Error(`Aucune pièce sur la case ${coup.depart}`);
  }

  const cases: Case[] = [...etat.cases];
  cases[coup.depart - 1] = null;
  for (const capturee of coup.captures) cases[capturee - 1] = null;

  const { rangee } = coordonnees(coup.arrivee);
  const dame = piece.dame || rangee === rangeePromotion(piece.camp);
  cases[coup.arrivee - 1] = { camp: piece.camp, dame };

  return { cases, trait: adversaire(piece.camp) };
}

/**
 * Le camp au trait qui n'a aucun coup légal a perdu — qu'il n'ait plus de
 * pièces ou qu'elles soient toutes bloquées. Les deux cas sont une défaite
 * aux dames, et la même absence de coup les décrit.
 */
export function issue(etat: EtatPlateau): Issue {
  if (coupsLegaux(etat).length > 0) return { fini: false };
  return { fini: true, vainqueur: adversaire(etat.trait) };
}
```

- [ ] **Step 4: Lancer tous les tests du moteur pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/
```

Attendu : SUCCÈS sur l'ensemble.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/coups.ts frontend/src/lib/dames/partie.ts frontend/src/lib/dames/coups-legaux.test.ts frontend/src/lib/dames/partie.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): rafle maximale, déduplication, et l'API du moteur

`coupsLegaux` arbitre : la prise est obligatoire, la rafle la plus longue
l'emporte, et deux rafles qui ne diffèrent que par l'ordre des prises sont
le même coup. Le décompte porte sur le nombre de pièces — une dame ne vaut
pas plus qu'un pion, contrairement à la variante italienne.

`appliquer` est le seul endroit qui promeut, sur la case d'arrivée
uniquement.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Perft — la calibration du moteur

**Files:**
- Create: `frontend/src/lib/dames/perft.ts`
- Test: `frontend/src/lib/dames/perft.test.ts`

**Interfaces:**
- Consumes: `coupsLegaux`, `appliquer`, `positionDepart`.
- Produces: `perft(etat: EtatPlateau, profondeur: number): number`.

C'est le test qui décide de tout. Il compte les feuilles de l'arbre des coups légaux à une profondeur donnée. Un générateur qui dévie d'une seule unité a une règle fausse quelque part, et le nombre dit à quelle profondeur elle apparaît.

**Les valeurs viennent d'une source publiée, pas de la mémoire** : Ed Gilbert, auteur du moteur de référence *Kingsrow*, sur le forum de la fédération mondiale — <https://damforum.nl/viewtopic.php?t=2308>.

| Profondeur | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Nœuds | 9 | 81 | 658 | 4 265 | 27 117 | 167 140 | 1 049 442 |

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/perft.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { perft } from './perft';
import { positionDepart } from './etat';

// Valeurs de référence relevées sur le forum de la fédération mondiale
// (https://damforum.nl/viewtopic.php?t=2308), publiées par Ed Gilbert,
// auteur de Kingsrow. Ce ne sont PAS des valeurs de non-régression
// produites par ce moteur : elles lui sont extérieures, et c'est ce qui
// leur donne leur valeur. Ne jamais les « corriger » pour faire passer le
// test — un écart signale une règle fausse, pas une valeur fausse.
const REFERENCE: readonly [profondeur: number, noeuds: number][] = [
  [1, 9],
  [2, 81],
  [3, 658],
  [4, 4265],
  [5, 27117],
];

describe('perft depuis la position de départ', () => {
  for (const [profondeur, noeuds] of REFERENCE) {
    it(`compte ${noeuds} nœuds à la profondeur ${profondeur}`, () => {
      expect(perft(positionDepart(), profondeur)).toBe(noeuds);
    });
  }

  // Sorti de la boucle : celui-ci explore 167 140 feuilles et dépasse le
  // délai par défaut de Vitest.
  it('compte 167 140 nœuds à la profondeur 6', { timeout: 60_000 }, () => {
    expect(perft(positionDepart(), 6)).toBe(167140);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/perft.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./perft"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `frontend/src/lib/dames/perft.ts` :

```ts
// Perft — le compteur de nœuds qui valide le générateur de coups.
//
// Emprunté aux moteurs d'échecs : on compte les feuilles de l'arbre des
// coups légaux à une profondeur donnée, et on compare à des valeurs
// publiées. Une seule unité d'écart trahit une règle fausse, et la
// profondeur où l'écart apparaît indique laquelle : une erreur sur les
// déplacements simples se voit dès la profondeur 1, une erreur de rafle
// vers 4-5, un défaut de déduplication seulement à partir de 8.
//
// Ce module ne sert qu'aux tests. Il reste dans `src/` plutôt que dans un
// dossier de test parce qu'il fait partie du moteur : c'est son
// instrument de mesure.
import { coupsLegaux } from './coups';
import { appliquer } from './partie';
import type { EtatPlateau } from './etat';

export function perft(etat: EtatPlateau, profondeur: number): number {
  if (profondeur === 0) return 1;
  const coups = coupsLegaux(etat);
  // Raccourci : à la profondeur 1, les feuilles sont les coups eux-mêmes.
  // Économise autant d'appels à `appliquer` qu'il y a de coups.
  if (profondeur === 1) return coups.length;

  let total = 0;
  for (const coup of coups) {
    total += perft(appliquer(etat, coup), profondeur - 1);
  }
  return total;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/perft.test.ts
```

Attendu : SUCCÈS, 6 tests.

**En cas d'échec, ne pas modifier les valeurs de référence.** Lire la profondeur à laquelle l'écart apparaît et corriger la règle correspondante :

| Profondeur du premier écart | Règle à revoir |
|---|---|
| 1 | Déplacements simples des pions (Task 3) |
| 2–3 | Sens d'avance, ou les pions du camp noir |
| 4–5 | Rafles : bloqueurs, prise en arrière, ou promotion en vol (Tasks 4 et 6) |
| 6–7 | Rafles de dames, atterrissages multiples (Task 5) |

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/perft.ts frontend/src/lib/dames/perft.test.ts
git commit -m "$(cat <<'EOF'
test(dames): calibrer le moteur sur les valeurs de perft publiées

Profondeurs 1 à 6 confrontées aux nombres d'Ed Gilbert (Kingsrow), relevés
sur le forum de la fédération mondiale. Ces valeurs sont extérieures au
moteur : un écart signale une règle fausse, jamais une valeur à corriger.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Le modèle `BoardGame` et le schéma de l'état

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/20260908000000_board_games/migration.sql`
- Create: `frontend/src/lib/dames/etat-schema.ts`
- Test: `frontend/src/lib/dames/etat-schema.test.ts`

**Interfaces:**
- Consumes: `NB_CASES` de `./plateau`.
- Produces: `EtatPlateauSchema` (Zod) et `parseEtatPlateau(valeur: unknown): EtatPlateau | null`.

Le serveur ne valide que la **forme** de l'état : 50 cases, des camps connus, un trait valide. C'est une garde contre un état corrompu qui ferait planter la reprise — **pas** une vérification de légalité. La distinction est délibérée, et le commentaire du fichier doit le dire, pour qu'elle ne passe pas plus tard pour un oubli.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/etat-schema.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { parseEtatPlateau } from './etat-schema';
import { positionDepart } from './etat';

describe('validation de la forme de l’état', () => {
  it('accepte un état produit par le moteur', () => {
    const depart = positionDepart();
    expect(parseEtatPlateau(JSON.parse(JSON.stringify(depart)))).toEqual(depart);
  });

  it('refuse un plateau qui n’a pas 50 cases', () => {
    expect(parseEtatPlateau({ cases: [null, null], trait: 'blanc' })).toBeNull();
  });

  it('refuse un camp inconnu', () => {
    const cases = Array.from({ length: 50 }, () => null) as unknown[];
    cases[0] = { camp: 'vert', dame: false };
    expect(parseEtatPlateau({ cases, trait: 'blanc' })).toBeNull();
  });

  it('refuse un trait invalide', () => {
    const cases = Array.from({ length: 50 }, () => null);
    expect(parseEtatPlateau({ cases, trait: 'personne' })).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseEtatPlateau(null)).toBeNull();
    expect(parseEtatPlateau('blanc')).toBeNull();
    expect(parseEtatPlateau(42)).toBeNull();
  });

  it('accepte une position illégale mais bien formée', () => {
    // Délibéré : ce schéma valide la FORME, pas les règles. Un plateau sans
    // aucune pièce blanche est absurde au jeu et parfaitement valide ici —
    // le serveur n'arbitre pas les parties de dames.
    const cases = Array.from({ length: 50 }, () => null);
    expect(parseEtatPlateau({ cases, trait: 'blanc' })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/etat-schema.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./etat-schema"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `frontend/src/lib/dames/etat-schema.ts` :

```ts
// La forme d'un état de plateau, telle que le serveur l'accepte.
//
// Ce schéma valide la FORME et rien d'autre : 50 cases, des camps connus,
// un trait valide. Il ne vérifie PAS que la position est atteignable, ni
// que le coup qui y mène était légal — et c'est délibéré. Le moteur tourne
// dans le navigateur, sur un appareil que les deux joueurs partagent : il
// n'y a personne à tromper, chacun déplace déjà les pièces des deux camps.
// Le serveur ne conserve le plateau que pour la reprise.
//
// Ce que cette garde empêche, en revanche, c'est qu'un état corrompu soit
// stocké puis fasse planter l'écran de jeu au chargement suivant.
import { z } from 'zod';
import { NB_CASES } from './plateau';
import type { EtatPlateau } from './etat';

const CampSchema = z.enum(['blanc', 'noir']);

const CaseSchema = z
  .object({
    camp: CampSchema,
    dame: z.boolean(),
  })
  .strict()
  .nullable();

export const EtatPlateauSchema = z
  .object({
    cases: z.array(CaseSchema).length(NB_CASES),
    trait: CampSchema,
  })
  .strict();

/** `null` si la valeur n'a pas la forme d'un état — jamais une exception. */
export function parseEtatPlateau(valeur: unknown): EtatPlateau | null {
  const resultat = EtatPlateauSchema.safeParse(valeur);
  return resultat.success ? resultat.data : null;
}
```

- [ ] **Step 4: Ajouter le modèle Prisma**

Dans `frontend/prisma/schema.prisma`, ajouter la relation inverse sur `Couple`, sous `questionUsages` :

```prisma
  boardGames     BoardGame[]
```

Puis, à la fin du fichier, le modèle :

```prisma
// ───────────────────────────────────────────────────────────────────────
// Divertissements — jeux complémentaires au moteur de couple.
//
// Une seule table pour tous les jeux de plateau (`kind`), volontairement :
// les dames arrivent en premier, le ludo et le jeu de mots suivront, et
// aucun des trois n'a besoin de colonnes propres — leur état tient dans
// `state`.
//
// `state` est OPAQUE au serveur. Contrairement au moteur de couple, le
// moteur de dames tourne dans le navigateur : pas d'information cachée,
// pas de score réel, et un seul appareil partagé par les deux joueurs — il
// n'y a donc personne à tromper. Les routes valident la FORME de l'état
// (lib/dames/etat-schema.ts) pour qu'un état corrompu ne fasse pas planter
// la reprise, jamais la légalité des coups.
//
// Aucune écriture depuis ce modèle vers Couple.cumulativeCoupleScore ni
// vers GameResult : une partie de dames ne dit rien de la complicité d'un
// couple, et ne coûte ni la partie offerte ni de points.
// ───────────────────────────────────────────────────────────────────────
model BoardGame {
  id        String    @id @default(cuid())
  coupleId  String
  couple    Couple    @relation(fields: [coupleId], references: [id], onDelete: Cascade)
  kind      String // DAMES  (LUDO, MOTS à venir)
  status    String    @default("IN_PROGRESS") // IN_PROGRESS | COMPLETED | ABANDONED
  state     Json
  // Compteur monotone de coups joués. Sert de garde anti-écrasement sur
  // PUT /state : une sauvegarde partie plus tôt mais arrivée plus tard ne
  // doit jamais recouvrir un plateau plus récent.
  moveCount Int       @default(0)
  startedAt DateTime  @default(now())
  endedAt   DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([coupleId, kind, status])
}
```

Créer `frontend/prisma/migrations/20260908000000_board_games/migration.sql` :

```sql
-- Divertissements : une table pour tous les jeux de plateau.
CREATE TABLE "BoardGame" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "state" JSONB NOT NULL,
    "moveCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardGame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardGame_coupleId_kind_status_idx" ON "BoardGame"("coupleId", "kind", "status");

ALTER TABLE "BoardGame" ADD CONSTRAINT "BoardGame_coupleId_fkey"
    FOREIGN KEY ("coupleId") REFERENCES "Couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une seule partie en cours par couple et par jeu.
--
-- Index unique PARTIEL : un couple peut avoir dix parties de dames
-- terminées et une en cours, mais jamais deux en cours. Le DSL de Prisma
-- ne sait pas exprimer la clause WHERE — d'où le SQL brut, comme pour
-- Couple_creator_active_unique et GameSession_couple_in_progress_unique.
CREATE UNIQUE INDEX "BoardGame_couple_kind_in_progress_unique"
    ON "BoardGame"("coupleId", "kind") WHERE status = 'IN_PROGRESS';
```

- [ ] **Step 5: Appliquer la migration et régénérer le client**

Le serveur de développement verrouille `query_engine-windows.dll.node` : l'arrêter avant de générer, sinon `prisma generate` échoue en `EPERM`.

```bash
cd frontend
set -a; . ./.env.local; set +a
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

Attendu : `1 migration found` puis `Applied migration`, et `Generated Prisma Client`.

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/etat-schema.test.ts
pnpm typecheck
```

Attendu : SUCCÈS, 6 tests, et un typecheck propre (le client Prisma connaît `BoardGame`).

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/20260908000000_board_games frontend/src/lib/dames/etat-schema.ts frontend/src/lib/dames/etat-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(salon): la table BoardGame et la forme de l'état

Une table pour tous les jeux de plateau à venir, avec un index unique
partiel qui interdit deux parties en cours du même jeu pour un couple.

Le schéma Zod valide la FORME de l'état, pas la légalité des coups : le
moteur tourne dans le navigateur et le serveur ne conserve le plateau que
pour la reprise. La garde empêche qu'un état corrompu fasse planter le
chargement suivant.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `POST /api/salon` et `GET /api/salon/current`

**Files:**
- Create: `frontend/src/app/api/salon/route.ts`
- Create: `frontend/src/app/api/salon/current/route.ts`
- Test: `frontend/src/app/api/salon/route.test.ts`, `frontend/src/app/api/salon/current/route.test.ts`

**Interfaces:**
- Consumes: `findActivatedCoupleForUser` de `@/lib/server/couples/queries` ; `positionDepart` de `@/lib/dames/etat`.
- Produces: le contrat JSON `{ id: string; kind: string; status: string; state: unknown; moveCount: number }`, consommé par Task 12.

`POST` est **idempotent** : s'il existe déjà une partie `IN_PROGRESS` de ce jeu pour le couple, il la renvoie au lieu d'en créer une seconde. C'est aussi ce qui fait de lui le bouton « Reprendre ».

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/app/api/salon/route.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/salon', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const COUPLE = { id: 'couple-1', creatorId: 'user-1', partnerId: 'user-2' };

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue(COUPLE as never);
});

describe('POST /api/salon', () => {
  it('crée une partie de dames à la position de départ', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    prismaMock.boardGame.create.mockImplementation((async (args: {
      data: { state: { trait: string } };
    }) => ({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: args.data.state,
      moveCount: 0,
    })) as never);

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('bg-1');
    // Les blancs ouvrent, et le plateau est complet.
    expect(body.state.trait).toBe('blanc');
    expect(body.state.cases).toHaveLength(50);
  });

  it('renvoie la partie en cours au lieu d’en créer une seconde', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-existant',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: { cases: [], trait: 'noir' },
      moveCount: 12,
    } as never);

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe('bg-existant');
    expect(prismaMock.boardGame.create).not.toHaveBeenCalled();
  });

  it('refuse un jeu inconnu', async () => {
    const res = await POST(makeReq({ kind: 'ECHECS' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_KIND');
  });

  it('refuse un appelant sans couple actif', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('COUPLE_REQUIRED');
  });

  it('ne touche jamais au score du couple ni à la partie offerte', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    prismaMock.boardGame.create.mockResolvedValue({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: {},
      moveCount: 0,
    } as never);

    await POST(makeReq({ kind: 'DAMES' }));
    // Un divertissement est gratuit et n'alimente aucun score.
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});
```

Créer `frontend/src/app/api/salon/current/route.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(kind = 'DAMES'): NextRequest {
  return new NextRequest(`http://test/api/salon/current?kind=${kind}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue({
    id: 'couple-1',
    creatorId: 'user-1',
    partnerId: 'user-2',
  } as never);
});

describe('GET /api/salon/current', () => {
  it('renvoie la partie en cours', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: { cases: [], trait: 'blanc' },
      moveCount: 4,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).game.id).toBe('bg-1');
  });

  it('renvoie null quand il n’y a pas de partie en cours', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).game).toBeNull();
  });

  it('refuse un jeu inconnu', async () => {
    const res = await GET(makeReq('ECHECS'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm --filter frontend exec vitest run src/app/api/salon/
```

Attendu : ÉCHEC — `Failed to resolve import "./route"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `frontend/src/app/api/salon/route.ts` :

```ts
// POST /api/salon — commencer ou reprendre une partie.
//
// Idempotent par construction : s'il existe déjà une partie IN_PROGRESS de
// ce jeu pour le couple, on la renvoie. C'est aussi ce qui fait de cette
// route le bouton « Reprendre » — le client n'a pas à distinguer les deux
// cas, et l'index unique partiel BoardGame_couple_kind_in_progress_unique
// garantit qu'il n'y en a jamais deux.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { positionDepart } from '@/lib/dames/etat';

/** Les jeux qui existent. Le ludo et le jeu de mots viendront s'ajouter. */
const JEUX = ['DAMES'] as const;
type Jeu = (typeof JEUX)[number];

function estUnJeu(valeur: unknown): valeur is Jeu {
  return typeof valeur === 'string' && (JEUX as readonly string[]).includes(valeur);
}

/** L'état initial du jeu demandé. Un `switch`, pour que l'ajout d'un jeu
 *  échoue au typecheck tant qu'il n'a pas sa position de départ. */
function etatInitial(kind: Jeu): unknown {
  switch (kind) {
    case 'DAMES':
      return positionDepart();
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const body: unknown = await req.json().catch(() => null);
    const kind = (body as { kind?: unknown } | null)?.kind;
    if (!estUnJeu(kind)) {
      return NextResponse.json(
        { error: 'INVALID_KIND', message: 'Ce jeu n’existe pas.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    if (couple === null) {
      return NextResponse.json(
        { error: 'COUPLE_REQUIRED', message: 'Il faut un Espace Couple actif pour jouer.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const selection = { id: true, kind: true, status: true, state: true, moveCount: true };

    const existante = await prisma.boardGame.findFirst({
      where: { coupleId: couple.id, kind, status: 'IN_PROGRESS' },
      select: selection,
    });
    if (existante !== null) {
      return NextResponse.json(existante, {
        status: 200,
        headers: { 'x-request-id': ctx.requestId },
      });
    }

    const creee = await prisma.boardGame.create({
      data: {
        coupleId: couple.id,
        kind,
        state: etatInitial(kind) as never,
      },
      select: selection,
    });

    return NextResponse.json(creee, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

Créer `frontend/src/app/api/salon/current/route.ts` :

```ts
// GET /api/salon/current?kind=DAMES — la partie en cours, s'il y
// en a une. Rend `{ game: null }` plutôt qu'un 404 : « pas de partie en
// cours » est une réponse normale, pas une erreur.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const JEUX = ['DAMES'] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const kind = new URL(req.url).searchParams.get('kind');
    if (kind === null || !(JEUX as readonly string[]).includes(kind)) {
      return NextResponse.json(
        { error: 'INVALID_KIND', message: 'Ce jeu n’existe pas.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    if (couple === null) {
      return NextResponse.json(
        { error: 'COUPLE_REQUIRED', message: 'Il faut un Espace Couple actif pour jouer.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const game = await prisma.boardGame.findFirst({
      where: { coupleId: couple.id, kind, status: 'IN_PROGRESS' },
      select: { id: true, kind: true, status: true, state: true, moveCount: true },
    });

    return NextResponse.json({ game }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/app/api/salon/
```

Attendu : SUCCÈS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/salon
git commit -m "$(cat <<'EOF'
feat(salon): routes de création et de reprise

POST est idempotent — il renvoie la partie en cours plutôt que d'en créer
une seconde, ce qui en fait aussi le bouton « Reprendre ». GET /current
rend `{ game: null }` quand il n'y en a pas : c'est une réponse, pas une
erreur.

Un test vérifie qu'aucune des deux routes n'écrit vers le score du couple
ni vers la partie offerte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `PUT /state` (garde monotone) et `POST /end`

**Files:**
- Create: `frontend/src/app/api/salon/[id]/state/route.ts`
- Create: `frontend/src/app/api/salon/[id]/end/route.ts`
- Test: `frontend/src/app/api/salon/[id]/state/route.test.ts`, `frontend/src/app/api/salon/[id]/end/route.test.ts`

**Interfaces:**
- Consumes: `parseEtatPlateau` de `@/lib/dames/etat-schema` ; `findActivatedCoupleForUser`.
- Produces: `PUT` → `{ ok: true, moveCount }` ou `409 STALE_STATE` ; `POST /end` → `{ ok: true }`.

**La garde monotone est le cœur de cette tâche.** Le client sauvegarde en tâche de fond après chaque coup, sans attendre la réponse. Deux requêtes parties coup sur coup peuvent donc arriver dans le désordre, et une sauvegarde en retard écraserait un plateau plus récent. En exigeant `moveCount` strictement croissant, l'ordre d'arrivée cesse de compter.

Le `updateMany` avec `moveCount: { lt: nouveau }` dans le `where` fait de la lecture et de l'écriture une seule opération atomique : `count === 0` signifie que la requête était périmée. Un `findFirst` suivi d'un `update` laisserait une fenêtre entre les deux.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/app/api/salon/[id]/state/route.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { PUT } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { positionDepart } from '@/lib/dames/etat';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/salon/bg-1/state', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'bg-1' });

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue({
    id: 'couple-1',
    creatorId: 'user-1',
    partnerId: 'user-2',
  } as never);
  prismaMock.boardGame.findFirst.mockResolvedValue({
    id: 'bg-1',
    coupleId: 'couple-1',
    status: 'IN_PROGRESS',
  } as never);
});

describe('PUT /api/salon/[id]/state', () => {
  it('sauvegarde un plateau plus avancé', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moveCount: 5 });
  });

  it('refuse une sauvegarde en retard sans rien écraser', async () => {
    // La garde vit dans le `where` : count === 0 veut dire que la partie
    // enregistrée était déjà plus avancée. C'est le cas d'une requête
    // partie plus tôt et arrivée plus tard.
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 3 }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('STALE_STATE');
  });

  it('exige un moveCount strictement supérieur dans la requête elle-même', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    const where = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: 'bg-1', moveCount: { lt: 5 } });
  });

  it('refuse un état mal formé', async () => {
    const res = await PUT(makeReq({ state: { cases: [], trait: 'blanc' }, moveCount: 5 }), {
      params,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATE');
    expect(prismaMock.boardGame.updateMany).not.toHaveBeenCalled();
  });

  it('répond 404, pas 403, pour une partie qui n’est pas celle du couple', async () => {
    // Ne jamais révéler qu'une partie existe chez quelqu'un d'autre —
    // motif déjà établi par requireOrgRole dans ce dépôt.
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    expect(res.status).toBe(404);
  });
});
```

Créer `frontend/src/app/api/salon/[id]/end/route.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/salon/bg-1/end', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'bg-1' });

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue({
    id: 'couple-1',
    creatorId: 'user-1',
    partnerId: 'user-2',
  } as never);
  prismaMock.boardGame.findFirst.mockResolvedValue({
    id: 'bg-1',
    coupleId: 'couple-1',
    status: 'IN_PROGRESS',
  } as never);
});

describe('POST /api/salon/[id]/end', () => {
  it('termine une partie', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(res.status).toBe(200);
    const data = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ status: 'COMPLETED' });
  });

  it('accepte un abandon', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await POST(makeReq({ outcome: 'ABANDONED' }), { params });
    expect(res.status).toBe(200);
  });

  it('refuse une issue inconnue', async () => {
    const res = await POST(makeReq({ outcome: 'GAGNE' }), { params });
    expect(res.status).toBe(400);
  });

  it('reste sans effet sur une partie déjà terminée', async () => {
    // Le `where` filtre sur IN_PROGRESS : terminer deux fois est sans
    // conséquence, ce qui rend l'appel sûr à rejouer.
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(res.status).toBe(200);
  });

  it('n’écrit jamais vers le score du couple', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm --filter frontend exec vitest run "src/app/api/salon/[id]"
```

Attendu : ÉCHEC — `Failed to resolve import "./route"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `frontend/src/app/api/salon/[id]/state/route.ts` :

```ts
// PUT /api/salon/[id]/state — sauvegarder le plateau.
//
// Le moteur tourne dans le navigateur ; cette route ne fait que conserver
// l'état pour que la partie survive à un onglet fermé. Elle valide la
// FORME de ce qu'on lui donne (lib/dames/etat-schema.ts) mais jamais la
// légalité du coup — voir la spec, §« le moteur tourne dans le
// navigateur ».
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { parseEtatPlateau } from '@/lib/dames/etat-schema';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    const brut = body as { state?: unknown; moveCount?: unknown } | null;

    const etat = parseEtatPlateau(brut?.state);
    const moveCount = brut?.moveCount;
    if (etat === null || typeof moveCount !== 'number' || !Number.isInteger(moveCount) || moveCount < 0) {
      return NextResponse.json(
        { error: 'INVALID_STATE', message: 'Plateau illisible.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    if (couple === null) {
      return NextResponse.json(
        { error: 'COUPLE_REQUIRED', message: 'Il faut un Espace Couple actif pour jouer.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 404 et non 403 : une partie qui n'est pas celle de ce couple ne doit
    // pas révéler son existence. Motif déjà établi par requireOrgRole.
    const partie = await prisma.boardGame.findFirst({
      where: { id, coupleId: couple.id, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    if (partie === null) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Partie introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // LA garde de cette route. Le client sauvegarde en tâche de fond sans
    // attendre la réponse, donc deux requêtes peuvent arriver dans le
    // désordre. En exigeant un moveCount strictement croissant, une
    // sauvegarde en retard ne peut plus recouvrir un plateau plus récent.
    //
    // `updateMany` avec la condition dans le `where` fait de la lecture et
    // de l'écriture une seule opération atomique : un `findFirst` suivi
    // d'un `update` laisserait une fenêtre entre les deux.
    const ecrit = await prisma.boardGame.updateMany({
      where: { id, status: 'IN_PROGRESS', moveCount: { lt: moveCount } },
      data: { state: etat as never, moveCount },
    });

    if (ecrit.count === 0) {
      return NextResponse.json(
        { error: 'STALE_STATE', message: 'Une sauvegarde plus récente existe déjà.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, moveCount },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

Créer `frontend/src/app/api/salon/[id]/end/route.ts` :

```ts
// POST /api/salon/[id]/end — terminer ou abandonner.
//
// Sûre à rejouer : le `where` filtre sur IN_PROGRESS, donc un second appel
// ne fait rien et répond quand même 200. Le client peut donc réessayer
// sans avoir à distinguer les cas.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ISSUES = ['COMPLETED', 'ABANDONED'] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    const outcome = (body as { outcome?: unknown } | null)?.outcome;
    if (typeof outcome !== 'string' || !(ISSUES as readonly string[]).includes(outcome)) {
      return NextResponse.json(
        { error: 'INVALID_OUTCOME', message: 'Issue inconnue.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    if (couple === null) {
      return NextResponse.json(
        { error: 'COUPLE_REQUIRED', message: 'Il faut un Espace Couple actif pour jouer.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const partie = await prisma.boardGame.findFirst({
      where: { id, coupleId: couple.id },
      select: { id: true },
    });
    if (partie === null) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Partie introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.boardGame.updateMany({
      where: { id, status: 'IN_PROGRESS' },
      data: { status: outcome, endedAt: new Date() },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/app/api/salon/
```

Attendu : SUCCÈS, 18 tests au total sur les quatre routes.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/salon/[id]"
git commit -m "$(cat <<'EOF'
feat(salon): sauvegarde du plateau et fin de partie

PUT /state porte la garde qui rend la sauvegarde en tâche de fond sûre :
`moveCount` strictement croissant, appliqué dans le `where` d'un
updateMany, donc lecture et écriture atomiques. Une requête partie plus tôt
et arrivée plus tard repart en 409 sans rien écraser.

POST /end est sûr à rejouer : le `where` filtre sur IN_PROGRESS.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Le menu `/salon` et l'entrée de navigation

**Files:**
- Create: `frontend/src/app/salon/page.tsx`
- Modify: `frontend/src/components/app/AppShell.tsx`
- Test: `frontend/src/app/salon/menu.test.ts`

**Interfaces:**
- Consumes: `AppShell`, `AppSection` de `@/components/app/AppShell`.
- Produces: `AppSection` gagne la valeur `'salon'`.

Le canevas de design nomme cette rubrique **« Le Salon »** et montre l'URL en clair dans la barre d'adresse de la maquette web : `coeurfidele.com/salon`. C'est de là que viennent le nom, la route et la copie ci-dessous — rien n'est inventé ici.

La phrase d'accroche est reprise **mot pour mot** du canevas, parce qu'elle dit exactement ce que la spec appelle l'étanchéité, et mieux qu'un commentaire ne le ferait :

> Des parties plus légères, entre deux Cœur Fidèle. Elles ne comptent pas dans votre Score de Fidélité — c'est le seul endroit de l'app où il y a un gagnant.

Le canevas liste quatre jeux : **Ludo** (10 pts), **Jeu de dames** (10 pts), **Mots croisés** (10 pts) et **Awalé** (Gratuit). Un seul est jouable dans ce lot. Les trois autres sont annoncés **sans être des liens** : le dépôt a un test qui échoue sur tout lien interne mort (`lib/game/navigation-reachable.test.ts`), et une navigation qui ment sur ce qui existe est pire qu'une navigation courte.

**Les prix ne sont pas affichés.** Le canevas montre « 10 pts » sur trois jeux, mais l'économie de points n'existe pas en base et la décision retenue est : gratuit pour l'instant. Écrire un prix que rien ne prélève serait une promesse que le produit ne tient pas. La colonne du canevas est conservée à sa place et porte « Offert » — la mise en page est prête pour le jour où un prix la remplacera.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/app/salon/menu.test.ts` :

```ts
// Assertions au niveau de la source : le dépôt n'embarque ni jsdom ni
// Testing Library (voir la décision de test de `lib/game/`), donc on lit
// le fichier plutôt que de monter le composant.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const menu = readFileSync(path.join(ICI, 'page.tsx'), 'utf8');
const shell = readFileSync(
  path.join(ICI, '..', '..', 'components', 'app', 'AppShell.tsx'),
  'utf8',
);

describe('Le Salon', () => {
  it('mène au jeu de dames', () => {
    expect(menu).toContain('href="/salon/dames"');
  });

  it('annonce les trois autres jeux du canevas sans en faire des liens', () => {
    // Un lien vers une page inexistante est un 404 en attente. Les jeux à
    // venir sont donc annoncés, pas liés — et le test de navigation du
    // dépôt reste vert.
    for (const jeu of ['Ludo', 'Mots croisés', 'Awalé']) {
      expect(menu).toContain(jeu);
    }
    expect(menu).not.toContain('href="/salon/ludo"');
    expect(menu).not.toContain('href="/salon/mots"');
    expect(menu).not.toContain('href="/salon/awale"');
  });

  it('reprend la phrase du canevas sur l’étanchéité au Score de Fidélité', () => {
    // C'est la promesse produit que la spec formalise : une partie du
    // Salon ne touche jamais au score du couple. La copie et le code
    // doivent dire la même chose.
    expect(menu).toContain('ne comptent pas dans votre Score de Fidélité');
  });

  it('n’affiche aucun prix en points', () => {
    // L'économie de points n'existe pas encore. Afficher « 10 pts »
    // annoncerait un débit que rien n'effectue.
    expect(menu).not.toMatch(/\d+\s*pts/);
  });
});

describe('la barre latérale', () => {
  it('propose la rubrique Le Salon', () => {
    expect(shell).toContain("href: '/salon'");
    expect(shell).toContain('Le Salon');
  });

  it('déclare la section correspondante', () => {
    expect(shell).toMatch(/AppSection\s*=[^;]*'salon'/);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/app/salon/menu.test.ts
```

Attendu : ÉCHEC — `ENOENT: no such file or directory ... page.tsx`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `frontend/src/app/salon/page.tsx` :

```tsx
'use client';

// /salon — « Le Salon », la rubrique des jeux complémentaires.
//
// Nom, route et copie viennent du canevas de design, qui montre l'URL en
// clair dans sa maquette web (coeurfidele.com/salon).
//
// Quatre jeux y figurent, un seul est jouable dans ce lot. Les trois
// autres sont annoncés SANS être des liens : le dépôt a un test qui
// échoue sur tout lien interne mort (lib/game/navigation-reachable.test.ts),
// et une navigation qui ment sur ce qui existe est pire qu'une navigation
// courte.
//
// Le canevas affiche un prix en points sur trois des quatre jeux. Il n'est
// pas repris : l'économie de points n'existe pas en base, et un prix que
// rien ne prélève est une promesse que le produit ne tient pas. La colonne
// reste en place et porte « Offert », prête à recevoir un prix le jour où
// il sera réel.
//
// Trois éléments du canevas sont volontairement absents, faute de ce sur
// quoi ils reposent : le solde de points de la barre latérale, la carte
// « Tournoi du couple » (trois victoires d'affilée offrent une partie —
// il faudrait compter les victoires), et la bannière de présence
// « Malick vous attend au Ludo » (mode deux appareils, lot séparé).
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { AppShell } from '@/components/app/AppShell';

interface JeuDuSalon {
  readonly nom: string;
  readonly glyphe: string;
  readonly duree: string;
  readonly href: string | null;
}

const JEUX: readonly JeuDuSalon[] = [
  { nom: 'Jeu de dames', glyphe: '◉', duree: 'Deux joueurs · 15 min', href: '/salon/dames' },
  { nom: 'Ludo', glyphe: '⬤', duree: 'Deux joueurs · 10 min', href: null },
  { nom: 'Mots croisés', glyphe: 'A', duree: 'Deux joueurs · 20 min', href: null },
  { nom: 'Awalé', glyphe: '◍', duree: 'Deux joueurs · 12 min', href: null },
];

export default function SalonPage() {
  const user = useUser('/connexion');
  if (!user) return null;

  return (
    <AppShell active="salon">
      <div className="flex max-w-2xl flex-col gap-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Divertissement</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Le Salon
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-cream/70">
            Des parties plus légères, entre deux Cœur Fidèle. Elles ne comptent pas dans votre
            Score de Fidélité — c’est le seul endroit de l’app où il y a un gagnant.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {JEUX.map((jeu) => {
            const contenu = (
              <>
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream/10 text-lg"
                >
                  {jeu.glyphe}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-xl">{jeu.nom}</span>
                  <span className="mt-0.5 block text-sm text-cream/55">{jeu.duree}</span>
                </span>
              </>
            );

            if (jeu.href === null) {
              return (
                <div
                  key={jeu.nom}
                  className="flex items-center gap-4 rounded-2xl border border-cream/10 bg-plum-card/30 p-4 opacity-60"
                >
                  {contenu}
                  <span className="shrink-0 rounded-full border border-cream/24 px-2.5 py-0.5 text-[11px] font-semibold text-cream/60">
                    Bientôt
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={jeu.nom}
                href="/salon/dames"
                className="flex items-center gap-4 rounded-2xl border border-cream/14 bg-plum-card/50 p-4 transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {contenu}
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                  Offert
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
```

Dans `frontend/src/components/app/AppShell.tsx`, étendre le type et la table de navigation :

```ts
export type AppSection = 'accueil' | 'salon' | 'reglages';

const NAV: { id: AppSection; label: string; href: string }[] = [
  { id: 'accueil', label: 'Accueil', href: '/jeu' },
  { id: 'salon', label: 'Le Salon', href: '/salon' },
  { id: 'reglages', label: 'Réglages', href: '/settings' },
];
```

Et compléter le commentaire en tête du fichier, qui énumère les destinations omises du canevas. Remplacer la phrase « Add the entry with the route, not before. » par :

```
//     Add the entry with the route, not before. (Le Salon joined in
//     2026-09 with /salon — the design canvas names it and shows the URL
//     in its web mockup, so it sits in the nav like the others. The
//     canvas's other three destinations still have no page.)
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/app/salon/menu.test.ts src/lib/game/navigation-reachable.test.ts
```

Attendu : SUCCÈS. Le second test est celui qui compte : il vérifie que chaque route liée existe réellement sur le disque, et il passerait au rouge si le Ludo avait été lié.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/salon frontend/src/components/app/AppShell.tsx
git commit -m "$(cat <<'EOF'
feat(salon): la rubrique « Le Salon » et son entrée de navigation

Nom, route et copie repris du canevas de design, qui montre l'URL en clair
dans sa maquette web. La phrase d'accroche est citée mot pour mot parce
qu'elle formule exactement l'étanchéité que la spec impose : ces parties ne
comptent pas dans le Score de Fidélité.

Quatre jeux annoncés, un seul cliquable. Le test de navigation du dépôt
échoue sur tout lien interne mort, et une navigation qui ment sur ce qui
existe est pire qu'une navigation courte.

Les prix en points du canevas ne sont pas repris : l'économie n'existe pas
en base, et un prix que rien ne prélève est une promesse vide. La colonne
reste en place et porte « Offert ».

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Le composant `Damier`

**Files:**
- Create: `frontend/src/components/dames/Damier.tsx`
- Modify: `frontend/tailwind.config.ts`
- Test: `frontend/src/components/dames/Damier.test.ts`

**Interfaces:**
- Consumes: `EtatPlateau`, `Camp`, `pieceEn` de `@/lib/dames/etat` ; `coordonnees`, `NB_CASES` de `@/lib/dames/plateau`.
- Produces:

```tsx
export interface DamierProps {
  readonly etat: EtatPlateau;
  /** Cases sur lesquelles on peut cliquer maintenant. */
  readonly jouables: readonly number[];
  /** La pièce sélectionnée, s'il y en a une. */
  readonly selection: number | null;
  /** Destinations proposées pour la sélection courante. */
  readonly destinations: readonly number[];
  readonly onCase: (caseNum: number) => void;
  /** Nom affiché de chaque camp, pour l'accessibilité. */
  readonly noms: Readonly<Record<Camp, string>>;
}
export function Damier(props: DamierProps): JSX.Element;
```

Le composant **ne décide d'aucune règle** : il reçoit ce qui est jouable et le signale. Toute la logique reste dans `lib/dames/`, ce qui garde le moteur testable sans DOM et le rendu remplaçable sans toucher aux règles.

Les couleurs viennent du canevas de design, relevées dans son code : cases jouables `#3D2036`, cases inertes `#EFE3D6`, un camp en crème bordé de prune, l'autre en wine bordé de crème, et la dame distinguée par un anneau intérieur de la couleur adverse.

Les deux teintes du damier n'existent pas dans la palette du dépôt. Elles sont ajoutées **une fois** comme tokens Tailwind plutôt qu'écrites en dur dans le composant : le dépôt proscrit les valeurs hexadécimales dans le JSX, et deux couleurs nommées valent mieux que six occurrences d'un code hexadécimal.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/components/dames/Damier.test.ts` :

```ts
// Assertions au niveau de la source — le dépôt ne monte pas de composants
// (ni jsdom ni Testing Library). Ce qu'on vérifie ici est ce qui se casse
// silencieusement : l'accessibilité et la séparation moteur / rendu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'Damier.tsx'),
  'utf8',
);

describe('accessibilité du damier', () => {
  it('se présente comme une grille', () => {
    expect(source).toContain('role="grid"');
  });

  it('fait de chaque case jouable un vrai bouton', () => {
    // Un `<div onClick>` n'est ni focusable ni annoncé ni actionnable au
    // clavier. Le damier doit être jouable sans souris.
    expect(source).toContain('<button');
    expect(source).toContain('aria-label');
  });

  it('marque les cases claires comme décoratives', () => {
    // Les 50 cases claires ne sont jamais jouables : les annoncer
    // doublerait la longueur du damier pour un lecteur d’écran.
    expect(source).toContain('aria-hidden');
  });

  it('interpose des lignes entre la grille et ses cellules', () => {
    // Une grille ARIA sans `row` est invalide : les cellules doivent être
    // dans des lignes. `display: contents` les fait exister pour l'arbre
    // d'accessibilité sans casser la grille CSS.
    expect(source).toContain('role="row"');
    expect(source).toContain('className="contents"');
  });
});

describe('séparation entre le moteur et le rendu', () => {
  it('ne génère aucun coup lui-même', () => {
    // Le composant reçoit `jouables` et `destinations` ; s'il appelait le
    // générateur, la règle et le rendu commenceraient à diverger.
    expect(source).not.toContain('coupsLegaux');
    expect(source).not.toContain('raflesBrutes');
  });

  it('ne connaît pas la base de données', () => {
    expect(source).not.toContain('@/lib/api');
    expect(source).not.toContain('prisma');
  });
});

describe('palette', () => {
  it('utilise les deux teintes de damier du canevas', () => {
    // #EFE3D6 (clair) et #3D2036 (foncé) sont relevées dans le canevas de
    // design. Elles sont déclarées comme tokens plutôt qu'écrites en dur :
    // le dépôt interdit les valeurs hexadécimales dans les composants.
    expect(source).toContain('bg-damier-fonce');
    expect(source).toContain('bg-damier-clair');
  });

  it('oppose les deux camps en wine et en crème, comme le canevas', () => {
    expect(source).toContain('bg-wine');
    expect(source).toContain('bg-cream');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/components/dames/Damier.test.ts
```

Attendu : ÉCHEC — `ENOENT ... Damier.tsx`.

- [ ] **Step 3: Déclarer les deux teintes du damier**

Dans `frontend/tailwind.config.ts`, ajouter à `theme.extend.colors`, après `plum` :

```ts
        // Les deux teintes du damier, relevées dans le canevas de design.
        // Elles ne servent qu'au Salon et n'entrent pas dans la palette
        // générale du produit — d'où le préfixe.
        damier: {
          clair: '#EFE3D6',
          fonce: '#3D2036',
        },
```

- [ ] **Step 4: Écrire le composant**

Créer `frontend/src/components/dames/Damier.tsx` :

```tsx
'use client';

// Le damier, et rien d'autre.
//
// Ce composant ne connaît AUCUNE règle : il reçoit les cases jouables et
// les destinations proposées, il les affiche et il signale les clics. Tout
// l'arbitrage vit dans `lib/dames/`, ce qui garde le moteur testable sans
// DOM et ce rendu remplaçable sans toucher aux règles.
//
// Les couleurs sont celles du canevas de design, relevées dans son code :
// cases jouables #3D2036, cases inertes #EFE3D6, un camp crème bordé de
// prune, l'autre wine bordé de crème. Les deux teintes du damier sont
// déclarées comme tokens dans tailwind.config.ts — pas d'hexadécimal ici.
import { coordonnees, NB_CASES } from '@/lib/dames/plateau';
import { pieceEn, type Camp, type EtatPlateau } from '@/lib/dames/etat';

export interface DamierProps {
  readonly etat: EtatPlateau;
  readonly jouables: readonly number[];
  readonly selection: number | null;
  readonly destinations: readonly number[];
  readonly onCase: (caseNum: number) => void;
  readonly noms: Readonly<Record<Camp, string>>;
}

// Les deux camps du canevas : un pion crème bordé de prune, un pion wine
// bordé de crème. Le camp `blanc` du moteur est le camp crème — c'est la
// seule correspondance à retenir entre le vocabulaire des règles et celui
// de l'écran.
const PIECE: Record<Camp, string> = {
  blanc: 'bg-cream ring-2 ring-inset ring-plum-deep/40',
  noir: 'bg-wine ring-2 ring-inset ring-cream/55',
};

// Une dame porte un anneau intérieur de la couleur adverse — repris du
// canevas, où la pièce promue se distingue par son liseré.
const ANNEAU_DAME: Record<Camp, string> = {
  blanc: 'border-wine',
  noir: 'border-cream/85',
};

export function Damier({
  etat,
  jouables,
  selection,
  destinations,
  onCase,
  noms,
}: DamierProps) {
  // Le damier 10×10 : 50 cases sombres jouables, 50 claires décoratives.
  // Construit rangée par rangée, car une grille ARIA valide exige des
  // lignes entre la grille et ses cellules.
  const rangees: (number | null)[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
  for (let n = 1; n <= NB_CASES; n += 1) {
    const { rangee, colonne } = coordonnees(n);
    const ligne = rangees[rangee];
    if (ligne !== undefined) ligne[colonne] = n;
  }

  return (
    <div
      role="grid"
      aria-label="Damier"
      className="grid aspect-square w-full max-w-[min(92vw,32rem)] grid-cols-10 overflow-hidden rounded-2xl border border-cream/14"
    >
      {rangees.map((ligne, rangee) => (
        // `display: contents` — la ligne existe pour l'arbre
        // d'accessibilité (une grille sans `row` est invalide) mais ne doit
        // pas s'interposer dans la grille CSS, dont les 100 cellules sont
        // posées d'un seul tenant par `grid-cols-10`.
        <div key={rangee} role="row" className="contents">
          {ligne.map((caseNum, colonne) => {
        // Les cases claires ne sont jamais jouables. Les annoncer
        // doublerait la longueur du damier pour un lecteur d'écran.
        if (caseNum === null) {
          return (
            <div
              key={`${rangee}-${colonne}`}
              aria-hidden
              className="bg-damier-clair"
            />
          );
        }

        const piece = pieceEn(etat.cases, caseNum);
        const selectionnee = selection === caseNum;
        const destination = destinations.includes(caseNum);
        const cliquable = jouables.includes(caseNum) || destination;

        const description =
          piece === null
            ? `case ${caseNum}, vide`
            : `case ${caseNum}, ${piece.dame ? 'dame' : 'pion'} ${noms[piece.camp]}`;

        return (
          <button
            key={`${rangee}-${colonne}`}
            type="button"
            role="gridcell"
            aria-label={destination ? `${description} — destination possible` : description}
            aria-pressed={selectionnee}
            disabled={!cliquable}
            onClick={() => onCase(caseNum)}
            className={`relative flex items-center justify-center bg-damier-fonce transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${
              selectionnee ? 'ring-2 ring-inset ring-gold' : ''
            } ${cliquable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {piece !== null && (
              <span
                aria-hidden
                className={`flex h-[78%] w-[78%] items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,.45)] ${PIECE[piece.camp]}`}
              >
                {/* La dame porte un anneau ; son nom accessible la dit aussi. */}
                {piece.dame && (
                  <span
                    className={`h-[38%] w-[38%] rounded-full border-2 ${ANNEAU_DAME[piece.camp]}`}
                  />
                )}
              </span>
            )}
            {/* Une destination libre : un point, jamais une bordure — une
                bordure sur une case vide se lit comme une pièce. */}
            {destination && piece === null && (
              <span aria-hidden className="h-[26%] w-[26%] rounded-full bg-gold/70" />
            )}
          </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

(L'indentation ci-dessus est approximative — `pnpm format` la reprendra. Ce
qui compte est l'imbrication : `map` des rangées → `<div role="row">` →
`map` des colonnes → `<button role="gridcell">`.)

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm --filter frontend exec vitest run src/components/dames/Damier.test.ts
pnpm typecheck
```

Attendu : SUCCÈS, 8 tests, typecheck propre.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dames frontend/tailwind.config.ts
git commit -m "$(cat <<'EOF'
feat(dames): le composant Damier

Rendu et accessibilité uniquement : le composant reçoit les cases jouables
et les destinations, il ne génère aucun coup. Un test le vérifie en
interdisant `coupsLegaux` dans le fichier — moteur et rendu ne peuvent pas
diverger s'ils ne se touchent pas.

Chaque case jouable est un vrai bouton, les cases claires sont
décoratives. Les couleurs viennent du canevas de design ; ses deux teintes
de damier entrent comme tokens Tailwind plutôt qu'en hexadécimal dans le
JSX.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: La logique d'interaction

**Files:**
- Create: `frontend/src/lib/dames/interaction.ts`
- Test: `frontend/src/lib/dames/interaction.test.ts`

**Interfaces:**
- Consumes: `coupsLegaux` de `./coups` ; `Coup`, `EtatPlateau` de `./etat`.
- Produces:

```ts
export interface Interaction {
  readonly selection: number | null;
  /** Prises déjà effectuées dans la rafle en cours. */
  readonly parcours: readonly number[];
}
export const INTERACTION_VIDE: Interaction;
export function jouables(etat: EtatPlateau, interaction: Interaction): number[];
export function destinations(etat: EtatPlateau, interaction: Interaction): number[];
export type Reaction =
  | { readonly type: 'selection'; readonly interaction: Interaction }
  | { readonly type: 'coup'; readonly coup: Coup }
  | { readonly type: 'rafle'; readonly interaction: Interaction }
  | { readonly type: 'refus'; readonly message: string }
  | { readonly type: 'rien' };
export function toucher(etat: EtatPlateau, interaction: Interaction, caseNum: number): Reaction;
```

Cette tâche existe parce que la sélection est plus subtile qu'elle n'en a l'air, et parce qu'une fonction pure se teste alors qu'un `useState` dans une page ne se teste pas ici.

Deux comportements en particulier :

- **Dans une rafle**, après chaque saut, seules les continuations de la séquence en cours sont proposées. Le joueur ne peut pas changer de rafle en route.
- **Quand une prise est obligatoire ailleurs**, toucher une pièce qui n'a aucun coup légal renvoie un refus **expliqué**. Un plateau muet ressemble à un bug, et c'est la règle qui surprend le plus.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/lib/dames/interaction.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { toucher, jouables, destinations, INTERACTION_VIDE } from './interaction';
import { positionDepart, plateauVide, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('sélection', () => {
  it('ne propose que les pièces qui ont un coup', () => {
    // Position de départ : seules les cases 31-35 peuvent bouger.
    expect(jouables(positionDepart(), INTERACTION_VIDE).sort((a, b) => a - b)).toEqual([
      31, 32, 33, 34, 35,
    ]);
  });

  it('sélectionne une pièce et propose ses destinations', () => {
    const reaction = toucher(positionDepart(), INTERACTION_VIDE, 33);
    expect(reaction.type).toBe('selection');
    if (reaction.type !== 'selection') return;
    expect(destinations(positionDepart(), reaction.interaction).sort((a, b) => a - b)).toEqual([
      28, 29,
    ]);
  });

  it('désélectionne quand on retouche la même pièce', () => {
    const premier = toucher(positionDepart(), INTERACTION_VIDE, 33);
    if (premier.type !== 'selection') throw new Error('sélection attendue');
    const second = toucher(positionDepart(), premier.interaction, 33);
    expect(second).toEqual({ type: 'selection', interaction: INTERACTION_VIDE });
  });
});

describe('la prise obligatoire est expliquée, pas subie', () => {
  it('refuse avec un message une pièce sans coup alors qu’une prise existe', () => {
    // Le pion en 50 pourrait avancer, mais celui en 33 doit prendre.
    const etat = etatAvec([[33, 'blanc'], [28, 'noir'], [50, 'blanc']], 'blanc');
    const reaction = toucher(etat, INTERACTION_VIDE, 50);
    expect(reaction.type).toBe('refus');
    if (reaction.type !== 'refus') return;
    expect(reaction.message).toMatch(/prise est obligatoire/i);
  });

  it('ignore silencieusement une case vide ou adverse', () => {
    expect(toucher(positionDepart(), INTERACTION_VIDE, 25).type).toBe('rien');
    expect(toucher(positionDepart(), INTERACTION_VIDE, 1).type).toBe('rien');
  });
});

describe('jouer un coup', () => {
  it('rend le coup complet quand on touche une destination', () => {
    const selection = toucher(positionDepart(), INTERACTION_VIDE, 33);
    if (selection.type !== 'selection') throw new Error('sélection attendue');
    const reaction = toucher(positionDepart(), selection.interaction, 28);
    expect(reaction.type).toBe('coup');
    if (reaction.type !== 'coup') return;
    expect(reaction.coup).toMatchObject({ depart: 33, arrivee: 28, captures: [] });
  });
});

describe('rafles à plusieurs sauts', () => {
  const etat = etatAvec([[33, 'blanc'], [28, 'noir'], [17, 'noir']], 'blanc');

  it('n’offre que le premier palier au premier toucher', () => {
    const selection = toucher(etat, INTERACTION_VIDE, 33);
    if (selection.type !== 'selection') throw new Error('sélection attendue');
    expect(destinations(etat, selection.interaction)).toEqual([22]);
  });

  it('avance dans la rafle sans la jouer, puis la conclut', () => {
    const selection = toucher(etat, INTERACTION_VIDE, 33);
    if (selection.type !== 'selection') throw new Error('sélection attendue');

    // Premier saut : la rafle continue, aucun coup n'est encore joué.
    const palier = toucher(etat, selection.interaction, 22);
    expect(palier.type).toBe('rafle');
    if (palier.type !== 'rafle') return;

    // Après le premier saut, seule la continuation est proposée : le
    // joueur ne peut pas changer de rafle en route.
    expect(destinations(etat, palier.interaction)).toEqual([11]);

    const fin = toucher(etat, palier.interaction, 11);
    expect(fin.type).toBe('coup');
    if (fin.type !== 'coup') return;
    expect(fin.coup.captures).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/interaction.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./interaction"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `frontend/src/lib/dames/interaction.ts` :

```ts
// Ce qui se passe quand on touche une case.
//
// Une fonction pure plutôt qu'un `useState` dans la page : la sélection
// est plus subtile qu'elle n'en a l'air — surtout dans une rafle à
// plusieurs sauts — et une fonction pure se teste, un état de composant
// non (le dépôt ne monte pas de composants).
import { coupsLegaux } from './coups';
import { type Coup, type EtatPlateau, pieceEn } from './etat';

export interface Interaction {
  readonly selection: number | null;
  /**
   * Les cases d'atterrissage déjà franchies dans la rafle en cours. Vide
   * hors rafle. C'est ce qui permet de ne proposer, après chaque saut, que
   * les continuations de CETTE séquence.
   */
  readonly parcours: readonly number[];
}

export const INTERACTION_VIDE: Interaction = { selection: null, parcours: [] };

export type Reaction =
  | { readonly type: 'selection'; readonly interaction: Interaction }
  | { readonly type: 'coup'; readonly coup: Coup }
  | { readonly type: 'rafle'; readonly interaction: Interaction }
  | { readonly type: 'refus'; readonly message: string }
  | { readonly type: 'rien' };

/** Les coups encore compatibles avec la rafle en cours. */
function candidats(etat: EtatPlateau, interaction: Interaction): Coup[] {
  const tous = coupsLegaux(etat);
  if (interaction.selection === null) return tous;
  return tous.filter((coup) => {
    if (coup.depart !== interaction.selection) return false;
    // Le parcours déjà accompli doit être un préfixe des paliers du coup.
    // C'est ce filtre qui empêche de changer de rafle en cours de route.
    return interaction.parcours.every((palier, i) => coup.paliers[i] === palier);
  });
}

/** Les cases sur lesquelles le joueur peut cliquer maintenant. */
export function jouables(etat: EtatPlateau, interaction: Interaction): number[] {
  if (interaction.selection !== null) return [interaction.selection];
  return [...new Set(coupsLegaux(etat).map((coup) => coup.depart))];
}

/** Les destinations proposées pour la sélection courante. */
export function destinations(etat: EtatPlateau, interaction: Interaction): number[] {
  if (interaction.selection === null) return [];
  const franchis = interaction.parcours.length;
  return [
    ...new Set(
      candidats(etat, interaction).map((coup) =>
        // Dans une rafle en cours, la prochaine case cliquable est le
        // palier suivant — pas l'arrivée finale.
        franchis < coup.paliers.length ? (coup.paliers[franchis] ?? coup.arrivee) : coup.arrivee,
      ),
    ),
  ];
}

export function toucher(
  etat: EtatPlateau,
  interaction: Interaction,
  caseNum: number,
): Reaction {
  // Une destination proposée : on conclut le coup, ou on avance d'un
  // palier dans la rafle.
  if (interaction.selection !== null && destinations(etat, interaction).includes(caseNum)) {
    const franchis = interaction.parcours.length;

    // Les candidats sont calculés sur l'interaction AVANT ce toucher : un
    // coup qui s'achève ici n'a pas de palier à la position `franchis`, et
    // l'ajouter au parcours l'exclurait du filtre — le coup ne serait
    // jamais reconnu comme terminé, et la rafle tournerait en rond.
    const acheve = candidats(etat, interaction).find(
      (coup) => coup.arrivee === caseNum && coup.paliers.length === franchis,
    );
    if (acheve !== undefined) return { type: 'coup', coup: acheve };

    return {
      type: 'rafle',
      interaction: {
        selection: interaction.selection,
        parcours: [...interaction.parcours, caseNum],
      },
    };
  }

  // Retoucher la pièce sélectionnée annule — sauf en pleine rafle, où
  // revenir en arrière donnerait un plateau déjà à moitié joué.
  if (interaction.selection === caseNum && interaction.parcours.length === 0) {
    return { type: 'selection', interaction: INTERACTION_VIDE };
  }
  if (interaction.parcours.length > 0) return { type: 'rien' };

  const piece = pieceEn(etat.cases, caseNum);
  if (piece === null || piece.camp !== etat.trait) return { type: 'rien' };

  const legaux = coupsLegaux(etat);
  if (legaux.some((coup) => coup.depart === caseNum)) {
    return { type: 'selection', interaction: { selection: caseNum, parcours: [] } };
  }

  // La pièce appartient bien au joueur, mais elle n'a aucun coup. Si des
  // prises existent ailleurs, c'est la règle de la prise obligatoire qui
  // la bloque — et c'est la règle qui surprend le plus. Un plateau muet
  // ressemblerait à un bug.
  if (legaux.some((coup) => coup.captures.length > 0)) {
    return { type: 'refus', message: 'La prise est obligatoire : une autre pièce doit prendre.' };
  }
  return { type: 'rien' };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter frontend exec vitest run src/lib/dames/interaction.test.ts
```

Attendu : SUCCÈS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dames/interaction.ts frontend/src/lib/dames/interaction.test.ts
git commit -m "$(cat <<'EOF'
feat(dames): la logique de sélection et de rafle

Une fonction pure plutôt qu'un état de composant : la sélection est subtile
dans une rafle à plusieurs sauts, et seule une fonction pure se teste ici.

Deux comportements portent l'écran : après chaque saut, seules les
continuations de la rafle en cours sont proposées ; et toucher une pièce
bloquée par la prise obligatoire renvoie un refus expliqué, jamais un
silence.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: L'écran de jeu et la persistance

**Files:**
- Create: `frontend/src/lib/salon/api.ts`
- Create: `frontend/src/app/salon/dames/page.tsx`
- Test: `frontend/src/app/salon/dames/page.test.ts`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: l'écran jouable. `api.ts` expose `commencerPartie(kind)`, `sauvegarderEtat(id, state, moveCount)`, `terminerPartie(id, outcome)`.

Trois décisions du canevas de design gouvernent cet écran.

**Le fond est crème**, pas l'encre du reste de l'application — le canevas dessine tout l'écran des dames en clair. Le dépôt sait déjà faire ça : `FocusLayout` accepte `ground="cream"`, un fond introduit pour la manche Scénarios. On le réutilise plutôt que d'en inventer un quatrième.

**Le coup se valide, il ne se joue pas d'un doigt.** Le canevas montre deux boutons, « Valider le coup » et « Annuler ». Ce n'est pas un détail : avec la prise obligatoire et les rafles à plusieurs sauts, pouvoir voir la séquence entière avant de s'engager change tout. La logique d'interaction n'a pas à bouger pour autant — elle signale déjà qu'un coup est complet ; c'est l'écran qui le retient au lieu de l'appliquer.

**Pas d'AppShell ici.** Le canevas remplace la barre latérale par un simple retour « ← Salon », pour la même raison que les écrans de manche : pendant une partie, le plateau est la seule chose qui doit demander l'attention.

Deux chiffres du canevas sont repris parce qu'ils se calculent honnêtement depuis le plateau : le nombre de pièces restantes de chaque camp, et le nombre de prises de la rafle obligatoire en cours. Le « 7 — 5 » du canevas est un score de manches gagnées ; rien ne les compte, donc il est remplacé par ce qui est réel.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/app/salon/dames/page.test.ts` :

```ts
// Assertions au niveau de la source : le dépôt ne monte pas de composants.
// Ce qui est vérifié ici, ce sont les invariants qui se cassent en silence.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(ICI, 'page.tsx'), 'utf8');

describe('l’écran de jeu', () => {
  it('exige un compte connecté', () => {
    expect(page).toMatch(/useUser\s*\(/);
    expect(page).toContain('if (!user) return null;');
  });

  it('délègue toutes les règles au moteur', () => {
    // La page ne réimplémente rien : elle appelle `toucher` et
    // `appliquer`. Une règle recopiée ici finirait par diverger des 60
    // tests du moteur.
    expect(page).toContain('toucher');
    expect(page).toContain('appliquer');
  });

  it('se joue sur le fond crème du canevas', () => {
    expect(page).toContain('ground="cream"');
  });

  it('fait valider le coup avant de l’appliquer', () => {
    // Le canevas montre « Valider le coup » et « Annuler ». Avec la prise
    // obligatoire et les rafles, voir la séquence avant de s'engager est
    // la moitié de l'ergonomie.
    expect(page).toContain('Valider le coup');
    expect(page).toContain('Annuler');
  });

  it('annonce la prise obligatoire', () => {
    expect(page).toMatch(/prise est obligatoire/i);
  });

  it('offre la nulle par accord', () => {
    // Elle remplace la règle des 25 coups, non implémentée : c'est ce qui
    // permet de sortir d'une finale interminable. La spec la promet.
    expect(page).toContain('Match nul');
  });

  it('ramène au Salon', () => {
    expect(page).toContain('/salon');
  });

  it('ne bloque jamais le jeu sur un échec de sauvegarde', () => {
    // La sauvegarde est un confort (la reprise), pas une condition du
    // coup. Elle part sans être attendue et son échec est absorbé.
    expect(page).toMatch(/\.catch\(/);
  });

  it('incrémente le compteur de coups à chaque coup joué', () => {
    // C'est ce compteur qui rend la garde monotone du serveur efficace.
    expect(page).toMatch(/moveCount|compteur/);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter frontend exec vitest run src/app/salon/dames/page.test.ts
```

Attendu : ÉCHEC — `ENOENT ... page.tsx`.

- [ ] **Step 3: Écrire le client d'API**

Créer `frontend/src/lib/salon/api.ts` :

```ts
// Le client des quatre routes /api/salon.
//
// Rassemblé ici pour que l'écran de jeu ne contienne que du jeu, et pour
// que les formes de requête restent typées en un seul endroit.
import { api } from '@/lib/api';
import type { EtatPlateau } from '@/lib/dames/etat';

export interface PartieDuSalon {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly state: unknown;
  readonly moveCount: number;
}

/** Crée une partie, ou renvoie celle en cours : la route est idempotente. */
export function commencerPartie(kind: string): Promise<PartieDuSalon> {
  return api<PartieDuSalon>('/api/salon', { method: 'POST', body: { kind } });
}

export function sauvegarderEtat(
  id: string,
  state: EtatPlateau,
  moveCount: number,
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/salon/${id}/state`, {
    method: 'PUT',
    body: { state, moveCount },
  });
}

export function terminerPartie(
  id: string,
  outcome: 'COMPLETED' | 'ABANDONED',
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/salon/${id}/end`, {
    method: 'POST',
    body: { outcome },
  });
}
```

- [ ] **Step 4: Écrire l'écran de jeu**

Créer `frontend/src/app/salon/dames/page.tsx` :

```tsx
'use client';

// /salon/dames — l'écran de jeu.
//
// Le moteur tourne ici, dans le navigateur : le coup s'applique
// immédiatement dès qu'il est validé, sans attendre le réseau. La
// sauvegarde part ensuite, en tâche de fond, et son échec ne coûte que la
// reprise — jamais le coup.
//
// Cette page ne contient AUCUNE règle : elle appelle `toucher` pour savoir
// quoi faire d'un clic, et `appliquer` pour jouer. Une règle recopiée ici
// finirait par diverger de celle que testent les 60 tests du moteur.
//
// ── Trois choses viennent du canevas de design ────────────────────────
//  1. Le fond crème, sur tout l'écran. `FocusLayout ground="cream"` existe
//     déjà pour la manche Scénarios — on le réutilise plutôt que d'ajouter
//     un quatrième fond au produit.
//  2. « Valider le coup » / « Annuler ». Avec la prise obligatoire et les
//     rafles à plusieurs sauts, voir la séquence entière avant de s'y
//     engager est la moitié de l'ergonomie de ce jeu.
//  3. Pas de barre latérale, un simple retour « ← Salon » : pendant une
//     partie, le plateau est la seule chose qui doit demander l'attention.
//
// Le canevas affiche aussi un score de manches (« 7 — 5 ») et un prix en
// points. Ni l'un ni l'autre n'existe : rien ne compte les manches
// gagnées, et l'économie de points n'est pas construite. À la place, deux
// chiffres qui se calculent honnêtement depuis le plateau — les pièces
// restantes de chaque camp.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Damier } from '@/components/dames/Damier';
import { positionDepart, type Camp, type Coup, type EtatPlateau } from '@/lib/dames/etat';
import { parseEtatPlateau } from '@/lib/dames/etat-schema';
import { coupsLegaux } from '@/lib/dames/coups';
import { appliquer, issue } from '@/lib/dames/partie';
import {
  INTERACTION_VIDE,
  destinations,
  jouables,
  toucher,
  type Interaction,
} from '@/lib/dames/interaction';
import { commencerPartie, sauvegarderEtat, terminerPartie } from '@/lib/salon/api';

interface CoupleMeResponse {
  couple: { partnerName?: string | null } | null;
}

export default function DamesPage() {
  const user = useUser('/connexion');
  const router = useRouter();

  const [partieId, setPartieId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatPlateau>(positionDepart);
  const [compteur, setCompteur] = useState(0);
  const [interaction, setInteraction] = useState<Interaction>(INTERACTION_VIDE);
  // Le coup complet, en attente de validation. C'est lui qui distingue
  // « j'ai fini de désigner mon coup » de « je le joue ».
  const [enAttente, setEnAttente] = useState<Coup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nomPartenaire, setNomPartenaire] = useState<string | null>(null);
  // Nulle par accord — un état local, car aucune position ne la décrit.
  const [nulle, setNulle] = useState(false);

  // Le camp `blanc` ouvre, donc il revient à celui qui lance la partie.
  const noms: Record<Camp, string> = {
    blanc: user?.name ?? 'Vous',
    noir: nomPartenaire ?? 'Votre partenaire',
  };

  // Création ou reprise : la route POST est idempotente, un seul appel
  // couvre les deux cas.
  useEffect(() => {
    if (!user) return;
    let annule = false;
    commencerPartie('DAMES')
      .then((partie) => {
        if (annule) return;
        setPartieId(partie.id);
        // Un état stocké illisible ne doit pas bloquer le joueur : on
        // repart de la position de départ plutôt que d'afficher une erreur
        // qu'il ne peut pas résoudre.
        setEtat(parseEtatPlateau(partie.state) ?? positionDepart());
        setCompteur(partie.moveCount);
      })
      .catch(() => {
        if (!annule) setErreur('Impossible de charger la partie.');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [user]);

  // Le prénom du partenaire ne sert qu'à annoncer le trait. Son absence
  // coûte une étiquette, jamais la partie.
  useEffect(() => {
    if (!user) return;
    let annule = false;
    api<CoupleMeResponse>('/api/couples/me')
      .then((res) => {
        if (!annule) setNomPartenaire(res.couple?.partnerName ?? null);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [user]);

  const fin = issue(etat);
  const termine = nulle || fin.fini;

  // Le plus long coup légal du moment. Nul s'il n'y a aucune prise —
  // c'est ce qui décide d'annoncer, ou non, la prise obligatoire.
  const prisesObligatoires = useMemo(() => {
    if (termine) return 0;
    const longueurs = coupsLegaux(etat).map((coup) => coup.captures.length);
    return longueurs.length === 0 ? 0 : Math.max(...longueurs);
  }, [etat, termine]);

  const restantes = useMemo(() => {
    let blanc = 0;
    let noir = 0;
    for (const c of etat.cases) {
      if (c === null) continue;
      if (c.camp === 'blanc') blanc += 1;
      else noir += 1;
    }
    return { blanc, noir };
  }, [etat]);

  const onCase = useCallback(
    (caseNum: number) => {
      if (termine) return;
      const reaction = toucher(etat, interaction, caseNum);
      if (reaction.type === 'rien') return;
      if (reaction.type === 'refus') {
        setMessage(reaction.message);
        return;
      }
      setMessage(null);
      if (reaction.type === 'selection' || reaction.type === 'rafle') {
        setInteraction(reaction.interaction);
        setEnAttente(null);
        return;
      }
      // Le coup est complet — mais il n'est PAS joué : il attend
      // « Valider le coup ».
      setEnAttente(reaction.coup);
    },
    [etat, interaction, termine],
  );

  function valider() {
    if (enAttente === null || partieId === null) return;
    const suivant = appliquer(etat, enAttente);
    const prochain = compteur + 1;
    setEtat(suivant);
    setCompteur(prochain);
    setInteraction(INTERACTION_VIDE);
    setEnAttente(null);

    // La sauvegarde part sans être attendue : au pire on perd la reprise,
    // jamais le coup.
    sauvegarderEtat(partieId, suivant, prochain).catch(() => undefined);
    if (issue(suivant).fini) terminerPartie(partieId, 'COMPLETED').catch(() => undefined);
  }

  function annuler() {
    setInteraction(INTERACTION_VIDE);
    setEnAttente(null);
    setMessage(null);
  }

  async function abandonner() {
    if (partieId !== null) await terminerPartie(partieId, 'ABANDONED').catch(() => undefined);
    router.push('/salon');
  }

  // Nulle par accord. Un seul geste suffit : les deux joueurs sont côte à
  // côte devant le même écran et se sont déjà mis d'accord à voix haute —
  // demander une seconde confirmation ne prouverait rien.
  //
  // C'est aussi ce qui remplace la règle des 25 coups, non implémentée
  // (voir la spec) : les finales interminables se règlent ici.
  async function matchNul() {
    setNulle(true);
    setInteraction(INTERACTION_VIDE);
    setEnAttente(null);
    if (partieId !== null) await terminerPartie(partieId, 'COMPLETED').catch(() => undefined);
  }

  if (!user) return null;

  return (
    <FocusLayout ground="cream" align="top">
      <div className="flex w-full items-center justify-between text-sm">
        <Link href="/salon" className="text-plum-deep/70 underline-offset-4 hover:underline">
          ← Salon
        </Link>
        <span className="font-semibold text-wine">Jeu de dames</span>
      </div>

      {chargement ? (
        <p className="py-16 text-center text-sm text-plum-deep/60">Chargement…</p>
      ) : (
        <>
          {/*
            `aria-live` : le trait change sans que rien ne bouge à l'endroit
            où l'attention se porte.
          */}
          <div className="flex w-full items-baseline justify-between gap-4">
            <p aria-live="polite" className="font-serif text-[22px] leading-tight">
              {nulle
                ? 'Match nul, d’un commun accord'
                : fin.fini
                  ? `${noms[fin.vainqueur]} l’emporte`
                  : `À ${noms[etat.trait]} de jouer`}
            </p>
            <p className="shrink-0 text-sm tabular-nums text-plum-deep/60">
              {restantes.blanc} — {restantes.noir}
            </p>
          </div>

          <Damier
            etat={etat}
            jouables={termine ? [] : jouables(etat, interaction)}
            selection={interaction.selection}
            destinations={termine ? [] : destinations(etat, interaction)}
            onCase={onCase}
            noms={noms}
          />

          {/*
            La règle qui surprend le plus, annoncée en permanence tant
            qu'elle s'applique — plutôt qu'au moment où elle bloque un
            geste, où elle ressemble à un refus.
          */}
          {!termine && prisesObligatoires > 0 && (
            <p className="w-full text-sm text-wine">
              La prise est obligatoire —{' '}
              {prisesObligatoires === 1
                ? 'une pièce à prendre.'
                : `${prisesObligatoires} pièces à prendre.`}
            </p>
          )}

          {message !== null && (
            <p className="w-full text-sm text-wine" aria-live="polite">
              {message}
            </p>
          )}
          {erreur !== null && (
            <div className="w-full">
              <Alert tone="error">{erreur}</Alert>
            </div>
          )}

          <div className="mt-auto flex w-full flex-col gap-3 pt-4 sm:flex-row">
            {termine ? (
              <Button variant="inverse" onClick={() => router.push('/salon')}>
                Retour au Salon
              </Button>
            ) : (
              <>
                <Button variant="inverse" onClick={valider} disabled={enAttente === null}>
                  Valider le coup
                </Button>
                <Button variant="secondary-inverse" onClick={annuler}>
                  Annuler
                </Button>
              </>
            )}
          </div>

          {!termine && (
            <div className="flex w-full flex-wrap gap-4 text-xs text-plum-deep/55">
              <button type="button" onClick={matchNul} className="underline underline-offset-4">
                Match nul
              </button>
              <button type="button" onClick={abandonner} className="underline underline-offset-4">
                Abandonner la partie
              </button>
            </div>
          )}
        </>
      )}
    </FocusLayout>
  );
}
```

- [ ] **Step 5: Lancer la suite complète**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Attendu : tout au vert. Les tests existants du dépôt (dont `lib/game/navigation-reachable.test.ts`) doivent rester verts — les routes `/salon` et `/salon/dames` existent désormais toutes deux.

- [ ] **Step 6: Vérification manuelle dans le navigateur**

```bash
pnpm dev
```

Se connecter avec un compte de test appairé, puis vérifier, dans l'ordre :

1. « Le Salon » apparaît dans la barre latérale et mène à `/salon` ; Ludo, Mots croisés et Awalé ne sont pas cliquables.
2. `/salon/dames` s'ouvre sur fond crème, damier 10 × 10 complet, 20 pièces par camp.
3. Toucher une pièce montre ses destinations ; « Valider le coup » reste inactif tant qu'aucun coup n'est complet.
4. Désigner un coup, puis « Annuler » : le plateau revient à l'état initial du tour.
5. Créer une prise : la ligne « La prise est obligatoire » apparaît, et toucher une pièce bloquée affiche l'explication.
6. Enchaîner une rafle à deux sauts : après le premier, seule la continuation est proposée ; « Valider le coup » ne s'active qu'à la fin de la séquence.
7. Recharger la page en cours de partie : le plateau revient tel quel.
8. « Match nul » clôt la partie et affiche « Match nul, d'un commun accord ».
9. À **390 px de large** : le damier tient sans débordement horizontal.
10. Au clavier seul : `Tab` atteint les cases, `Entrée` désigne, `Valider le coup` est atteignable.
11. Dans l'onglet Réseau : un seul `PUT /state` par coup **validé**, et le jeu reste fluide même s'il échoue (couper le réseau pour vérifier).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/salon frontend/src/app/salon/dames
git commit -m "$(cat <<'EOF'
feat(dames): l'écran de jeu et la persistance en tâche de fond

Fond crème et validation du coup viennent du canevas de design. Avec la
prise obligatoire et les rafles à plusieurs sauts, pouvoir voir la séquence
entière avant de s'y engager est la moitié de l'ergonomie — la logique
d'interaction n'a pas bougé pour autant, c'est l'écran qui retient le coup
au lieu de l'appliquer.

Le coup validé s'applique immédiatement, sans attendre le réseau ; la
sauvegarde suit et son échec ne coûte que la reprise. La page ne contient
aucune règle — elle appelle `toucher` et `appliquer`, et un test interdit
qu'elle en réimplémente.

Le score de manches du canevas est remplacé par les pièces restantes de
chaque camp : rien ne compte les manches gagnées, et un chiffre inventé
vaut moins qu'un chiffre vrai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Vérification finale

Après la Task 14 :

- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test` — tout au vert, aucun test existant cassé.
- [ ] `pnpm build` passe.
- [ ] Le perft est vert aux profondeurs 1 à 6. **C'est le critère qui décide si le moteur est juste** ; s'il échoue, se reporter au tableau de diagnostic de la Task 7 plutôt que d'ajuster les valeurs.
- [ ] La partie de dames n'a écrit dans aucune des colonnes suivantes : `Couple.cumulativeCoupleScore`, `User.freeGameUsedAt`, `GameResult`, `GameSession`. À vérifier par lecture des quatre routes.
- [ ] Le damier tient à 390 px sans débordement horizontal, et se joue au clavier.
- [ ] Aucun prix en points n'est affiché nulle part — ni dans le Salon, ni sur l'écran de jeu. L'économie n'existe pas ; l'annoncer serait mentir.
- [ ] Aucune valeur hexadécimale de couleur dans le JSX : les deux teintes du damier passent par les tokens `damier.clair` / `damier.fonce`.
