import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Une statistique dont la collecte n'est pas branchée est un écran vide qui
// ressemble à une panne. `enregistrerConnexion` peut exister, être testée, et
// n'être appelée de nulle part : rien dans la suite ne s'en apercevrait, et la
// console afficherait « Aucune connexion encore » indéfiniment.
//
// Ces assertions vérifient donc le CÂBLAGE, à la source — il n'y a ni jsdom ni
// base dans cette suite, et les tests des routes mockent justement la couche
// où l'appel se trouve.

const here = dirname(fileURLToPath(import.meta.url));
const API = resolve(here, '../../../app/api');

function source(chemin: string): string {
  return readFileSync(resolve(API, chemin), 'utf8');
}

/** Retire les commentaires : ils citent l'appel pour l'expliquer. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Les chemins qui ouvrent une session et que ce lot branche.
const ROUTES_BRANCHEES: readonly [chemin: string, methode: string][] = [
  ['auth/login/route.ts', 'MOT_DE_PASSE'],
  // L'inscription n'émet aucun cookie : la première session d'un compte naît
  // à la vérification du code, pas au login. Ne pas la compter ferait manquer
  // exactement les nouveaux venus.
  ['auth/verify-email/route.ts', 'VERIFICATION'],
];

describe('la collecte est branchée là où une session naît', () => {
  for (const [chemin, methode] of ROUTES_BRANCHEES) {
    it(`${chemin} enregistre la connexion (${methode})`, () => {
      const src = sansCommentaires(source(chemin));
      expect(src).toContain('enregistrerConnexion');
      expect(src).toContain(`methode: '${methode}'`);
      // Les en-têtes de LA requête, pas une valeur reconstruite : c'est d'eux
      // que viennent l'appareil et le pays.
      expect(src).toContain('headers: req.headers');
    });
  }

  it('passe l’identifiant du compte, sinon la vue « comptes » reste vide', () => {
    for (const [chemin] of ROUTES_BRANCHEES) {
      const src = sansCommentaires(source(chemin));
      expect(src, chemin).toMatch(/userId:\s*user\.id/);
    }
  });

  it('appelle après l’émission des cookies, pas avant', () => {
    // Avant, la connexion ne serait pas encore acquise : on compterait des
    // sessions qui n'ont jamais existé si une étape suivante échouait.
    for (const [chemin] of ROUTES_BRANCHEES) {
      const src = sansCommentaires(source(chemin));
      const cookies = src.indexOf('setAuthCookies');
      const capture = src.indexOf('enregistrerConnexion(');
      expect(cookies, chemin).toBeGreaterThan(-1);
      expect(capture, chemin).toBeGreaterThan(cookies);
    }
  });
});

describe('le chemin Google n’est PAS encore compté, et c’est consigné', () => {
  // CE TEST DOCUMENTE UN TROU PLUTÔT QUE DE LE CACHER.
  //
  // `src/app/api/auth/oauth/google/callback/route.ts` est dans la liste des
  // fichiers protégés de CLAUDE.md : « state/PKCE cookie scoping,
  // account-linking, ID-token decode are all interdependent ». Y ajouter une
  // ligne demande un accord explicite, qui n'a pas été demandé pour une
  // statistique. Les connexions Google manquent donc à la console.
  //
  // L'assertion est inversée exprès : le jour où la ligne sera ajoutée, ce
  // test rougira, et celui qui l'ajoutera viendra le supprimer en même temps
  // que cette explication. Un trou qu'un test surveille se referme ; un trou
  // écrit dans un commentaire se perd.
  const callback = 'auth/oauth/google/callback/route.ts';

  it('la route existe toujours là où on la croit', () => {
    expect(() => source(callback)).not.toThrow();
  });

  it('n’appelle pas encore enregistrerConnexion — à retirer quand ce sera fait', () => {
    expect(sansCommentaires(source(callback))).not.toContain('enregistrerConnexion');
  });

  it('la méthode GOOGLE est néanmoins déclarée, prête à être utilisée', async () => {
    const { METHODES } = await import('./connexions');
    expect(METHODES).toContain('GOOGLE');
  });
});

describe('la rétention est branchée sur un cron qui tourne', () => {
  it('le cron quotidien purge bien les connexions', () => {
    const cron = sansCommentaires(source('cron/webhook-log-purge/route.ts'));
    expect(cron).toContain('connexionEvent.deleteMany');
    expect(cron).toContain('CONNEXION_RETENTION_DAYS');
  });

  it('et ce cron répond à GET, le seul verbe que Vercel envoie', () => {
    // Sans cela la purge n'est jamais invoquée, et rien ne le signale : c'est
    // exactement la panne mesurée le 02/10/2026 sur les six crons.
    const cron = sansCommentaires(source('cron/webhook-log-purge/route.ts'));
    expect(cron).toContain('export const GET = POST;');
  });
});
