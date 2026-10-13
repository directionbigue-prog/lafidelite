import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCategoryShowcase } from './categories';
import { buildLandingDesignData, TOTAL_QUESTIONS } from './design-data';
import { palierDuTheme, packDecouverte } from '@/lib/game/packs';
import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(ICI, '..', '..', 'app');
const landing = readFileSync(path.join(APP_DIR, 'page.tsx'), 'utf8');
const designData = readFileSync(path.join(ICI, 'design-data.ts'), 'utf8');

describe('buildCategoryShowcase', () => {
  it('counts each category within its own round', () => {
    const { rows } = buildCategoryShowcase([
      { roundType: 'MIROIR', category: 'Communication' },
      { roundType: 'MIROIR', category: 'Communication' },
      { roundType: 'SCENARIO', category: 'Confiance' },
    ]);

    expect(rows).toEqual([
      { name: 'Communication', roundType: 'MIROIR', roundTitle: 'Miroir', count: 2 },
      { name: 'Confiance', roundType: 'SCENARIO', roundTitle: 'Scénarios', count: 1 },
    ]);
  });

  it('keeps a category name that appears in two rounds as two separate rows', () => {
    // Merging them would misreport both counts — "Quotidien" in Face à face
    // and "Quotidien & habitudes" in Miroir are different question sets,
    // and nothing stops a future seed from reusing one name outright.
    const { rows, categoryCount } = buildCategoryShowcase([
      { roundType: 'MIROIR', category: 'Quotidien' },
      { roundType: 'FACEAFACE', category: 'Quotidien' },
    ]);

    expect(rows).toHaveLength(2);
    expect(categoryCount).toBe(2);
    expect(rows.map((r) => r.roundType)).toEqual(['MIROIR', 'FACEAFACE']);
  });

  it('orders by round play order, then by size, then by name', () => {
    const { rows } = buildCategoryShowcase([
      { roundType: 'FACEAFACE', category: 'Zeta' },
      { roundType: 'MIROIR', category: 'Beta' },
      { roundType: 'MIROIR', category: 'Alpha' },
      { roundType: 'MIROIR', category: 'Alpha' },
      { roundType: 'SCENARIO', category: 'Gamma' },
    ]);

    expect(rows.map((r) => `${r.roundType}/${r.name}`)).toEqual([
      'MIROIR/Alpha', // same round, bigger count first
      'MIROIR/Beta',
      'SCENARIO/Gamma',
      'FACEAFACE/Zeta',
    ]);
  });

  it('surfaces an unlabelled round instead of guessing a name for it', () => {
    const { rows } = buildCategoryShowcase([{ roundType: 'MYSTERE', category: 'X' }]);

    expect(rows[0]?.roundTitle).toBeNull();
  });

  it('sorts an unrecognised round last so the grid still reads in play order', () => {
    const { rows } = buildCategoryShowcase([
      { roundType: 'MYSTERE', category: 'X' },
      { roundType: 'MIROIR', category: 'Y' },
    ]);

    expect(rows.map((r) => r.roundType)).toEqual(['MIROIR', 'MYSTERE']);
  });

  it('totals every seeded question, not every category', () => {
    const { totalQuestions, categoryCount } = buildCategoryShowcase([
      { roundType: 'MIROIR', category: 'A' },
      { roundType: 'MIROIR', category: 'A' },
      { roundType: 'MIROIR', category: 'B' },
    ]);

    expect(totalQuestions).toBe(3);
    expect(categoryCount).toBe(2);
  });
});

describe('the landing page tells the truth about the question bank', () => {
  // The regression this guards: the grid was a hand-written table claiming
  // 440 questions across eight categories, six of which had no question at
  // all. Nothing tied it to the content, so it could not help but drift.
  it('reports exactly what the shipped seed contains', () => {
    const { totalQuestions, categoryCount } = buildCategoryShowcase();

    expect(totalQuestions).toBe(QUESTIONS_SEED.length);
    expect(categoryCount).toBeGreaterThan(0);
  });

  it('every advertised category has at least one real question', () => {
    const { rows } = buildCategoryShowcase();

    expect(rows.filter((r) => r.count < 1)).toEqual([]);
  });

  // HISTORIQUE, parce que ce fichier a changé d'avis deux fois et qu'un
  // lecteur pressé pourrait « restaurer » la mauvaise version.
  //
  // 2026-09-16 — la page a cessé d'être dérivée de la banque pour reproduire
  // le canevas Claude Design à l'identique, chiffres de maquette compris. Les
  // deux assertions qui exigeaient une grille dérivée ont été retirées.
  //
  // 2026-09-20 — les chiffres sont revenus au vrai, un par un, à mesure
  // qu'ils cessaient d'être décoratifs : d'abord les PRIX et les PALIERS
  // (une caisse ne négocie pas), puis les COMPTEURS de questions. Ce qui
  // reste du canevas est la MISE EN FORME, plus aucune donnée chiffrée.
  //
  // `buildCategoryShowcase` n'a toujours pas d'appelant : la grille est
  // construite par `buildLandingDesignData`, qui compte la banque autrement.
  // Elle reste testée et juste — la supprimer est une décision à prendre,
  // pas un nettoyage à faire au passage.
  it('renders the transcribed canvas grid, not the derived one', () => {
    expect(landing).toContain('buildLandingDesignData');
    expect(landing).not.toContain('buildCategoryShowcase(');
  });

  // Le chiffre de maquette a disparu : la page compte la banque. Ce cas
  // garde la porte fermée — un « 440 » réécrit à la main redeviendrait faux
  // dès la question suivante ajoutée au seed.
  it('counts the real bank instead of the canvas figure', () => {
    expect(landing).not.toContain('440 questions');
    expect(landing).toContain('{TOTAL_QUESTIONS} questions, huit territoires');
    expect(TOTAL_QUESTIONS).toBe(QUESTIONS_SEED.length);
  });

  it('still admits in writing what remains mockup on this page', () => {
    // L'auth par SMS, les CTA d'achat, les liens en « # » : la page les
    // annonce encore. Tant que l'écart existe, il doit être écrit dans le
    // fichier plutôt que découvert à l'usage.
    expect(landing).toContain('ne pas lire le reste de cette page');
  });

  it('shows each theme the number of questions it actually holds', () => {
    const parTheme = new Map<string, number>();
    for (const q of QUESTIONS_SEED) {
      parTheme.set(q.category, (parTheme.get(q.category) ?? 0) + 1);
    }
    for (const carte of buildLandingDesignData().categories) {
      expect(carte.count, carte.name).toBe(parTheme.get(carte.name));
      // Aucune carte ne doit annoncer un thème vide : le lot des thèmes
      // garantit dix questions par manche, donc trente au minimum.
      expect(carte.count, carte.name).toBeGreaterThanOrEqual(30);
    }
  });

  // La frontière client. `design-data` importe la banque de questions, donc
  // tout composant CLIENT qui l'atteint expédie au navigateur les poids des
  // options SCENARIO — et un joueur qui les lit connaît la « bonne » réponse
  // avant même de répondre.
  //
  // Ce cas ne surveillait que `SignupCard`, alors le seul morceau client de
  // l'accueil, et exigeait d'elle un `'use client'`. Elle a cessé d'être
  // cliente en devenant un simple formulaire GET, et cette assertion se
  // serait mise à échouer alors que le risque, lui, avait DIMINUÉ. Elle
  // visait donc un fichier, pas le danger. On énumère maintenant TOUS les
  // composants client du dépôt : la garantie ne dépend plus de la façon
  // dont une page est découpée aujourd'hui.
  it('keeps the question bank out of every client bundle', () => {
    const SRC = path.join(ICI, '..', '..');
    const fichiers: string[] = [];
    (function marche(dossier: string) {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const p = path.join(dossier, e.name);
        if (e.isDirectory()) marche(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) fichiers.push(p);
      }
    })(SRC);

    const clients = fichiers.filter((f) =>
      /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8').slice(0, 400)),
    );
    // Garde-fou du garde-fou : si le dépôt n'a plus de composant client, le
    // cas ci-dessous passerait en ne prouvant plus rien du tout.
    expect(clients.length).toBeGreaterThan(10);

    const fautifs = clients.filter((f) =>
      /landing\/design-data|seed-data\/questions/.test(readFileSync(f, 'utf8')),
    );
    expect(fautifs.map((f) => path.relative(SRC, f))).toEqual([]);

    // Et la banque est bien là où on la croit. Sans cette ligne, l'assertion
    // précédente passerait aussi le jour où `design-data` cesserait de
    // l'importer — c'est-à-dire le jour où elle ne prouverait plus rien.
    expect(designData).toContain('seed-data/questions');
  });

  // Les PRIX ont quitté la maquette : ils viennent de `packs.ts`. Ce cas
  // sépare les deux régimes, parce qu'ils ne se valent pas — un compteur de
  // questions exagéré déçoit, un prix faux est une promesse que la caisse ne
  // tiendra pas. Le canevas affichait un abonnement à 25 000 F là où
  // l'Intégral en coûte 9 900 par mois.
  it('takes its prices from the pack registry, never from the canvas', () => {
    // La forme a changé le 02/10/2026, la propriété gardée non. C'était
    // `PRICE_GRID`, quatre champs nommés dont chacun devait être un appel à
    // `prixDuPack`. La grille a disparu avec l'Annuel retiré de la vente : les
    // cartes sont maintenant construites par un `.map()` sur PACKS_VISIBLES,
    // ce qui règle aussi les NOMS et les PÉRIODES, pas seulement les prix.
    //
    // On exige donc du bloc constructeur qu'il lise le registre et qu'il ne
    // contienne aucun montant. Les commentaires sont retirés d'abord : ils
    // citent « 118 800 » et « 4 900 » pour expliquer la régression, et un test
    // qui échoue sur sa propre documentation ne garde rien.
    const brut =
      /const PRICING_CARDS: readonly PricingCard\[\] = PACKS_VISIBLES\.map\(([\s\S]*?)\n\}\);/.exec(
        designData,
      )?.[1];
    expect(brut, 'PRICING_CARDS introuvable dans design-data.ts').toBeTruthy();
    const bloc = (brut ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(bloc, 'le prix doit venir du registre').toContain('enFrancs(pack.prix)');
    expect(bloc, 'le nom doit venir du registre').toContain('pack.nom');
    expect(bloc, 'la période doit venir du registre').toContain('pack.periode');
    // Un prix du produit fait au moins trois chiffres (2 000, 4 900, 9 900) ;
    // le bloc n'en contient aucun, seulement la comparaison `prix === 0`.
    expect(bloc, 'aucun montant ne doit être écrit à la main').not.toMatch(/\d{3,}/);
  });

  // Et les huit cartes portent le nom du palier qui les ouvre, calculé par
  // la MÊME fonction que le sélecteur de `/jeu/nouvelle`. Une carte
  // d'accueil et une carte de jeu ne peuvent donc plus se contredire.
  it('labels each theme with the tier that actually opens it', () => {
    const grille = buildLandingDesignData().categories;
    expect(grille).toHaveLength(8);
    for (const carte of grille) {
      expect(carte.access, carte.name).toBe(palierDuTheme(carte.name)?.nom);
    }
    // Un seul thème gratuit, et c'est celui de l'essai.
    const gratuits = grille.filter((c) => c.access === packDecouverte().nom);
    expect(gratuits.map((c) => c.name)).toEqual(['Confiance & Jalousie']);
  });

  // Le jeu sur deux téléphones — d'abord une promesse fausse, maintenant vraie,
  // et ce test suit les deux temps.
  //
  // Jusqu'au 13/10/2026 la page promettait « chacun son téléphone » alors que
  // le moteur ne savait jouer que sur UN appareil. Ce test interdisait donc la
  // formule. Depuis, le mode à distance existe (`lib/distance/distance.ts`) : le
  // téléphone qui attend affiche « X répond… » et suit la partie. Deux
  // téléphones sont donc une promesse TENABLE — mais seulement tant que ce
  // mode est câblé. Le premier test l'exige : la page peut promettre deux
  // téléphones parce que l'écran d'attente sait attendre.
  //
  // Ce qui reste faux, c'est le SIMULTANÉ. Le moteur joue tour à tour : une
  // seule `activePlayerRole` à la fois. « Répondez en même temps » serait la
  // même promesse infaisable qu'avant, sous un autre mot.
  //
  // On retire les lignes de COMMENTAIRE avant de chercher : l'en-tête de
  // `page.tsx` raconte cette histoire et cite forcément les formules.
  const cibles = (): Record<string, string> => ({
    'app/page.tsx': landing,
    'lib/landing/design-data.ts': designData,
    'app/layout.tsx': readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8'),
  });
  const sansCommentaires = (source: string) => source.replace(/^[ \t]*(\/\/|\*|\/\*).*$/gm, '');

  it('promises two phones only while the remote mode is actually wired', () => {
    const promet = Object.values(cibles()).some((s) =>
      /chacun (son|sur son) téléphone|deux téléphones/i.test(sansCommentaires(s)),
    );
    if (!promet) return;
    const passe = readFileSync(path.join(APP_DIR, 'jeu', '[id]', 'passe', 'page.tsx'), 'utf8');
    expect(passe, "l'écran d'attente à distance n'est plus câblé").toContain('decisionAttente');
    expect(passe).toContain('useSuiviPartie');
  });

  it('never promises simultaneous play — the engine plays turn by turn', () => {
    const promesses = [/en même temps/i, /simultan/i, /au même moment/i];
    for (const [nom, source] of Object.entries(cibles())) {
      const rendu = sansCommentaires(source);
      for (const promesse of promesses) {
        expect(promesse.test(rendu), `${nom} promet « ${promesse.source} »`).toBe(false);
      }
    }
  });
});
