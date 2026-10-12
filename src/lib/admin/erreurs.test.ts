import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { messageErreurAdmin, demandeReconnexion } from './console';

// LE DÉFAUT QUE CES TESTS GARDENT, mesuré le 03/10/2026 en production : la
// console affichait « L’action a échoué. Réessayez. » et rien d'autre, sur un
// écran vide.
//
// La cause : `middleware/index.ts` n'émet pas de codes stables pour
// l'authentification. Il met de la PROSE ANGLAISE dans le champ `error` —
// « Missing token », « Invalid or expired token », « Session expired »,
// « Account not found ». La table de traduction de la console mappait
// `UNAUTHORIZED`, que le serveur n'envoie JAMAIS. Tout 401 retombait donc sur
// la phrase générique, et le conseil qu'elle donnait — réessayer — était faux :
// une session morte ne se répare qu'en se reconnectant.
//
// On traduit côté client plutôt que de corriger le serveur : `middleware/
// index.ts` est protégé par CLAUDE.md et ses chaînes sont consommées par
// toutes les routes.

const here = dirname(fileURLToPath(import.meta.url));
const GARDES = resolve(here, '../server/middleware/index.ts');

describe('les codes que les gardes envoient vraiment sont traduits', () => {
  // Extraits de la source plutôt que recopiés : une liste de garde qui se
  // contente de redire ce qu'elle garde ne garde plus rien, et c'est
  // précisément la divergence serveur/client qui a produit le défaut.
  const source = readFileSync(GARDES, 'utf8');
  const codesEmis = [...source.matchAll(/error:\s*'([^']+)'/g)].map((m) => m[1]);

  it('la source en déclare bien, sinon ce test ne prouve rien', () => {
    expect(codesEmis.length).toBeGreaterThan(4);
  });

  it('chacun produit un message qui n’est pas le générique', () => {
    const generique = 'L’action a échoué. Réessayez.';
    for (const code of codesEmis) {
      expect(messageErreurAdmin(code), `« ${code} » n'est pas traduit`).not.toBe(generique);
    }
  });

  it('les quatre messages de session mènent tous à « reconnectez-vous »', () => {
    for (const code of [
      'Missing token',
      'Invalid or expired token',
      'Session expired',
      'Account not found',
    ]) {
      expect(messageErreurAdmin(code).toLowerCase(), code).toContain('reconnectez-vous');
      expect(demandeReconnexion(code), code).toBe(true);
    }
  });
});

describe('le statut sert de second recours', () => {
  // Un code inconnu ne doit pas effacer l'information dont on dispose.
  it('traduit les statuts courants même sans code', () => {
    expect(messageErreurAdmin(null, 401).toLowerCase()).toContain('session');
    expect(messageErreurAdmin(null, 403).toLowerCase()).toContain('rôle');
    expect(messageErreurAdmin(null, 429).toLowerCase()).toContain('patientez');
    expect(messageErreurAdmin(null, 503).toLowerCase()).toContain('indisponible');
  });

  it('nomme le statut quand il ne le connaît pas', () => {
    // « erreur 418 » se diagnostique ; « réessayez » ne se diagnostique pas.
    expect(messageErreurAdmin('CODE_INCONNU', 418)).toContain('418');
    expect(messageErreurAdmin(null, 418)).toContain('418');
  });

  it('ne retombe sur le générique que sans code ET sans statut', () => {
    expect(messageErreurAdmin(null)).toBe('L’action a échoué. Réessayez.');
    expect(messageErreurAdmin(undefined, undefined)).toBe('L’action a échoué. Réessayez.');
  });

  it('le code connu l’emporte sur le statut', () => {
    // LAST_SUPERADMIN arrive avec un 4xx ; c'est le code qui explique.
    expect(messageErreurAdmin('LAST_SUPERADMIN', 400)).toContain('dernier super-administrateur');
  });
});

describe('quand proposer de se reconnecter', () => {
  it('oui sur 401, quel que soit le code', () => {
    expect(demandeReconnexion('CODE_INCONNU', 401)).toBe(true);
  });

  it('non sur un refus de rôle : se reconnecter n’y changerait rien', () => {
    expect(demandeReconnexion('ADMIN_REQUIRED', 403)).toBe(false);
    expect(demandeReconnexion('LAST_SUPERADMIN', 400)).toBe(false);
    expect(demandeReconnexion(null, 500)).toBe(false);
  });
});

describe('les messages restent en français et sans jargon', () => {
  const ECHANTILLON = [
    'Missing token',
    'Session expired',
    'ADMIN_REQUIRED',
    'TOO_MANY_REQUESTS',
    'RATE_LIMIT_BACKEND_UNAVAILABLE',
    'LAST_SUPERADMIN',
  ];

  it('ne laisse fuir aucun code brut vers l’écran', () => {
    for (const code of ECHANTILLON) {
      const message = messageErreurAdmin(code, 500);
      expect(message, code).not.toContain(code);
      expect(message, code).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    }
  });

  it('chaque message se termine par une phrase complète', () => {
    for (const code of ECHANTILLON) {
      expect(messageErreurAdmin(code), code).toMatch(/[.!]$/);
    }
  });
});
