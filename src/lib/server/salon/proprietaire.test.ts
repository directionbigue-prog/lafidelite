import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { partiesDe, proprietaireAEcrire, type ProprietaireSalon } from './proprietaire';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const COUPLE: ProprietaireSalon = {
  genre: 'couple',
  coupleId: 'couple-1',
  creatorId: 'user-1',
  partnerId: 'user-2',
};
const SOLO: ProprietaireSalon = { genre: 'solo', userId: 'user-1' };

describe('partiesDe', () => {
  it('borne un couple à son coupleId', () => {
    expect(partiesDe(COUPLE)).toEqual({ coupleId: 'couple-1' });
  });

  it('borne un compte seul à son userId ET aux parties sans couple', () => {
    expect(partiesDe(SOLO)).toEqual({ userId: 'user-1', coupleId: null });
  });
});

describe('proprietaireAEcrire', () => {
  it('n’écrit jamais les deux colonnes à la fois', () => {
    expect(proprietaireAEcrire(COUPLE)).toEqual({ coupleId: 'couple-1' });
    expect(proprietaireAEcrire(SOLO)).toEqual({ userId: 'user-1' });
  });
});

describe('les routes du Salon résolvent toutes le propriétaire par ce module', () => {
  const API_SALON = path.join(RACINE, 'src', 'app', 'api', 'salon');

  function routes(dir: string): string[] {
    return readdirSync(dir).flatMap((entree) => {
      const complet = path.join(dir, entree);
      if (statSync(complet).isDirectory()) return routes(complet);
      return entree === 'route.ts' ? [complet] : [];
    });
  }

  const fichiers = routes(API_SALON);

  it('trouve les quatre routes', () => {
    expect(fichiers).toHaveLength(4);
  });

  for (const fichier of fichiers) {
    const nom = path.relative(API_SALON, fichier);
    it(nom, () => {
      const source = readFileSync(fichier, 'utf8');
      // Une route qui filtrerait encore sur le seul couple laisserait un
      // compte sans partenaire créer une partie qu'il ne pourrait ni
      // sauvegarder ni terminer.
      expect(source).toContain('proprietaireDuSalon(prisma, auth.user.sub)');
      expect(source).not.toContain('findActivatedCoupleForUser');
      expect(source).not.toMatch(/coupleId:\s*couple\.id/);
      expect(source).not.toContain("'COUPLE_REQUIRED'");
    });
  }
});

describe('la migration pose les deux garanties en SQL brut', () => {
  const sql = readFileSync(
    path.join(RACINE, 'prisma', 'migrations', '20261013200000_salon_solo', 'migration.sql'),
    'utf8',
  );

  it('un seul propriétaire par partie', () => {
    expect(sql).toMatch(
      /CONSTRAINT "BoardGame_un_seul_proprietaire"\s+CHECK \(\("coupleId" IS NULL\) <> \("userId" IS NULL\)\)/,
    );
  });

  it('une seule partie en cours par compte seul et par jeu', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "BoardGame_user_kind_in_progress_unique"\s+ON "BoardGame"\("userId", "kind"\) WHERE status = 'IN_PROGRESS'/,
    );
  });
});
