import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';
import { THEMES } from '@/lib/game/themes';
import { JEUX } from '@/lib/salon/jeux';
import { REGLES } from '@/lib/salon/regles';
import { pageDuChemin } from './pages';
import {
  EXEMPLES_DE_QUESTIONS,
  PAGES_DE_CONTENU,
  echantillonParManche,
  jeuxDuSalon,
  themesAvecCompte,
} from './contenus';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../../app');
const lire = (chemin: string) => readFileSync(resolve(APP, chemin), 'utf8');
const sansCommentaires = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^[ \t]*(\/\/|\*|\/\*).*$/gm, '');

describe('les pages de contenu', () => {
  it('sont déclarées indexables dans le registre', () => {
    for (const { chemin } of PAGES_DE_CONTENU) {
      expect(pageDuChemin(chemin)?.indexable, chemin).toBe(true);
    }
  });

  it("sont liées depuis le pied de l'accueil, pour être trouvées autrement que par le sitemap", () => {
    const pied = /<footer[\s\S]*<\/footer>/.exec(lire('page.tsx'))?.[0] ?? '';
    expect(pied).toMatch(/PAGES_DE_CONTENU\.map\(/);
    expect(pied).toMatch(/href=\{[a-z]+\.chemin\}/i);
  });

  it('finissent toutes par la même invitation à jouer', () => {
    for (const { chemin } of PAGES_DE_CONTENU) {
      expect(lire(`.${chemin}/page.tsx`), chemin).toMatch(/<SuiteDeLecture ici="/);
    }
  });
});

describe('les questions montrées en exemple', () => {
  const parSlug = new Map(QUESTIONS_SEED.map((q) => [q.slug, q]));

  it('existent dans la banque, dans la bonne manche, hors Mode Piment', () => {
    // Choisies par slug : une question renommée ou retirée fait rougir le CI
    // au lieu de disparaître de la page sans bruit.
    for (const [manche, slugs] of Object.entries(EXEMPLES_DE_QUESTIONS)) {
      expect(slugs.length, manche).toBe(4);
      for (const slug of slugs) {
        const q = parSlug.get(slug);
        expect(q, slug).toBeDefined();
        expect(q!.roundType, slug).toBe(manche);
        expect(q!.category, slug).not.toMatch(/Piment/);
      }
    }
  });

  it("ne livrent que l'énoncé — ni les choix, ni leur poids", () => {
    const echantillon = echantillonParManche();
    expect(echantillon.map((m) => m.type)).toEqual(['MIROIR', 'SCENARIO', 'FACEAFACE']);
    for (const manche of echantillon) {
      for (const [i, texte] of manche.questions.entries()) {
        expect(texte).toBe(parSlug.get(EXEMPLES_DE_QUESTIONS[manche.type][i]!)!.prompt);
      }
    }
    expect(JSON.stringify(echantillon)).not.toMatch(/"(options|weight|poids)"/);
    expect(sansCommentaires(lire('questions-pour-couple/page.tsx'))).not.toMatch(/\.options\b/);
  });

  it('comptent les questions de chaque thème dans la vraie banque', () => {
    const themes = themesAvecCompte();
    expect(themes.map((t) => t.nom)).toEqual(THEMES.map((t) => t.nom));
    for (const t of themes) {
      expect(t.questions, t.nom).toBe(QUESTIONS_SEED.filter((q) => q.category === t.nom).length);
      expect(t.questions, t.nom).toBeGreaterThan(0);
    }
  });
});

describe('les jeux du Salon', () => {
  it('sont tous présentés, avec le but que donne leur règle', () => {
    const jeux = jeuxDuSalon();
    expect(jeux.map((j) => j.kind)).toEqual([...JEUX]);
    for (const jeu of jeux) expect(jeu.but).toBe(REGLES[jeu.kind].but);
  });

  it("ne promettent pas un Salon gratuit : l'accès vient du registre des packs", () => {
    const page = sansCommentaires(lire('jeux-a-deux/page.tsx'));
    expect(page).toMatch(/salonAcces/);
    expect(page).not.toMatch(/gratuit/i);
  });
});

describe('le jeu à distance', () => {
  const page = () => sansCommentaires(lire('jeu-de-couple-a-distance/page.tsx'));

  it('ne promet ni le simultané ni la vidéo', () => {
    // Le moteur joue tour à tour (une seule `activePlayerRole`), et l'appel
    // vidéo a été retiré le 13/10/2026.
    for (const promesse of [/en même temps/i, /simultan/i, /au même moment/i, /vid[ée]o/i]) {
      expect(promesse.test(page()), promesse.source).toBe(false);
    }
  });

  it("ne promet deux téléphones que tant que l'écran d'attente sait attendre", () => {
    expect(page()).toMatch(/deux téléphones|chacun sur son téléphone/i);
    const passe = lire('jeu/[id]/passe/page.tsx');
    expect(passe).toContain('decisionAttente');
    expect(passe).toContain('useSuiviPartie');
  });
});
