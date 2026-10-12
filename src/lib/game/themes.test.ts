// Le garde-fou du thème : un thème proposé à l'écran doit pouvoir remplir
// une partie entière.
//
// Ce test existe parce que le défaut qu'il attrape est SILENCIEUX. Un
// thème sans assez de questions ne provoque ni erreur ni manche courte :
// `narrowToCategories` élargit au pool complet et la partie se joue
// normalement — sur un tout autre sujet que celui qu'on a choisi. Six des
// huit thèmes affichés sur la page d'accueil étaient dans cet état, et
// rien dans le dépôt ne le disait à part un paragraphe de documentation.
//
// Le seuil n'est pas « au moins une question » : c'est
// `QUESTIONS_PAR_MANCHE_MAX`, le plus grand tirage qu'une manche puisse
// faire (Longue soirée : 10/10/10). En dessous, le thème marcherait en
// Express et retomberait en silence sur le pool complet en Longue soirée
// — soit exactement le même mensonge, une fois sur trois.
import { describe, it, expect } from 'vitest';
import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';
import { validateQuestionSeeds } from '@/lib/server/game/question-seed-schema';
import { THEMES, NOMS_THEMES, TYPES_DE_MANCHE, QUESTIONS_PAR_MANCHE_MAX } from './themes';
import { filtrerThemesConnus, themeParNom, basculerTheme, corpsDeCreation } from './themes';
import { narrowToCategories } from '@/lib/server/game/question-selection';

function compter(theme: string, manche: string): number {
  return QUESTIONS_SEED.filter((q) => q.category === theme && q.roundType === manche).length;
}

describe('les huit thèmes', () => {
  it('correspond au nombre de cartes de la page d’accueil', () => {
    expect(THEMES).toHaveLength(8);
    expect(new Set(NOMS_THEMES).size).toBe(8);
  });

  it('calcule son seuil depuis les formats plutôt que de le recopier', () => {
    // Longue soirée = 30 questions sur trois manches.
    expect(QUESTIONS_PAR_MANCHE_MAX).toBe(10);
  });

  // Le cœur du test. Un cas par thème et par manche : quand il casse, le
  // nom du cas dit déjà quel thème et quelle manche sont à compléter.
  for (const theme of THEMES) {
    for (const manche of TYPES_DE_MANCHE) {
      it(`« ${theme.nom} » remplit une manche ${manche} au format le plus long`, () => {
        expect(compter(theme.nom, manche)).toBeGreaterThanOrEqual(QUESTIONS_PAR_MANCHE_MAX);
      });
    }
  }

  it('produit une banque valide au regard du schéma de seed', () => {
    expect(() => validateQuestionSeeds(QUESTIONS_SEED)).not.toThrow();
  });

  it('n’a aucun slug en double entre les huit fichiers de thème', () => {
    const slugs = QUESTIONS_SEED.map((q) => q.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('narrowToCategories, sur la banque réelle', () => {
  // La preuve que le test ci-dessus mesure la bonne chose : on rejoue la
  // décision du moteur avec la vraie banque. Avant ce lot, chacun de ces
  // cas renvoyait narrowed=false — la sélection était ignorée.
  for (const theme of THEMES) {
    for (const manche of TYPES_DE_MANCHE) {
      it(`honore « ${theme.nom} » en manche ${manche}, même en Longue soirée`, () => {
        const pool = QUESTIONS_SEED.filter((q) => q.roundType === manche).map((q) => ({
          id: q.slug,
          category: q.category,
        }));
        const { narrowed, pool: retenu } = narrowToCategories(
          pool,
          [theme.nom],
          QUESTIONS_PAR_MANCHE_MAX,
        );
        expect(narrowed).toBe(true);
        expect(retenu.every((q) => q.category === theme.nom)).toBe(true);
      });
    }
  }

  it('élargit encore quand le thème demandé n’existe pas', () => {
    const pool = QUESTIONS_SEED.filter((q) => q.roundType === 'MIROIR').map((q) => ({
      id: q.slug,
      category: q.category,
    }));
    const { narrowed } = narrowToCategories(pool, ['Thème inventé'], QUESTIONS_PAR_MANCHE_MAX);
    expect(narrowed).toBe(false);
  });
});

describe('filtrerThemesConnus', () => {
  it('laisse passer les thèmes du registre', () => {
    expect(filtrerThemesConnus(['Ex et passé', 'Argent & Transparence'])).toEqual([
      'Ex et passé',
      'Argent & Transparence',
    ]);
  });

  it('retire un nom inconnu plutôt que de le transmettre au tirage', () => {
    expect(filtrerThemesConnus(['Ex et passé', 'DROP TABLE'])).toEqual(['Ex et passé']);
  });

  it('déduplique', () => {
    expect(filtrerThemesConnus(['Ex et passé', 'Ex et passé'])).toEqual(['Ex et passé']);
  });

  it('rend un tableau vide quand rien n’est reconnu', () => {
    expect(filtrerThemesConnus(['a', 'b'])).toEqual([]);
  });
});

describe('basculerTheme', () => {
  it('coche un thème absent', () => {
    expect(basculerTheme([], 'Ex et passé')).toEqual(['Ex et passé']);
  });

  it('décoche un thème présent', () => {
    expect(basculerTheme(['Ex et passé'], 'Ex et passé')).toEqual([]);
  });

  it('conserve l’ordre du registre, quel que soit l’ordre des clics', () => {
    const a = basculerTheme(basculerTheme([], 'Mode Piment · 18+'), 'Confiance & Jalousie');
    const b = basculerTheme(basculerTheme([], 'Confiance & Jalousie'), 'Mode Piment · 18+');
    expect(a).toEqual(b);
    // Confiance & Jalousie est le premier du registre, Mode Piment le dernier.
    expect(a).toEqual(['Confiance & Jalousie', 'Mode Piment · 18+']);
  });
});

describe('corpsDeCreation', () => {
  it('omet `categories` quand rien n’est choisi — « aucun thème » = toute la banque', () => {
    expect(corpsDeCreation('STANDARD', [])).toEqual({ format: 'STANDARD' });
    expect('categories' in corpsDeCreation('STANDARD', [])).toBe(false);
  });

  it('transmet la sélection quand il y en a une', () => {
    expect(corpsDeCreation('EXPRESS', ['Ex et passé'])).toEqual({
      format: 'EXPRESS',
      categories: ['Ex et passé'],
    });
  });

  it('n’envoie jamais un nom que la banque ne connaît pas', () => {
    expect(corpsDeCreation('STANDARD', ['Ex et passé', 'Inventé'])).toEqual({
      format: 'STANDARD',
      categories: ['Ex et passé'],
    });
  });

  it('retombe sur « toute la banque » si tous les noms sont inconnus', () => {
    expect(corpsDeCreation('STANDARD', ['Inventé'])).toEqual({ format: 'STANDARD' });
  });
});

describe('themeParNom', () => {
  it('retrouve un thème du registre', () => {
    expect(themeParNom('Mode Piment · 18+')?.nom).toBe('Mode Piment · 18+');
    expect(themeParNom('Confiance & Jalousie')?.resume).toBeTruthy();
  });

  // Le palier n'est PAS un champ du thème : il se déduit de `packs.ts`, qui
  // est le seul endroit où l'on décide ce qu'un pack ouvre. Deux listes
  // auraient divergé le jour d'un changement de tarif.
  it('ne porte pas lui-même son palier d’accès', () => {
    expect(themeParNom('Ex et passé')).not.toHaveProperty('acces');
  });

  it('rend null sur un nom inconnu', () => {
    expect(themeParNom('Inconnu')).toBeNull();
  });
});
