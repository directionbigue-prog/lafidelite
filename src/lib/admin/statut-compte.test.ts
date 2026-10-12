import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  actionStatut,
  confirmationChangementStatut,
  verifierRaison,
  corpsChangementStatut,
  statutApres,
  messageSuccesStatut,
  messageErreurAdmin,
  RAISON_MAX,
} from './console';

// CE QUE CES TESTS GARDENT. `PATCH /api/admin/users/[id]/status` était livrée,
// gardée, auditée, testée — et joignable seulement par `curl` : la console
// n'offrait aucun moyen de suspendre un compte. Elle lisait même `status` dans
// la réponse de la liste sans jamais l'afficher, donc un compte suspendu était
// indiscernable d'un compte actif dans l'écran qui l'avait suspendu.
//
// Les capacités ne sont PAS recopiées ici : elles sont lues dans la source de
// `/api/admin/me`, parce que cette liste est contractuelle (8 entrées pour
// ADMIN, 11 pour SUPERADMIN, vérifié par `me/route.test.ts`) et qu'une
// capacité inventée rendrait l'action invisible pour tout le monde sans que
// rien n'échoue.

const here = dirname(fileURLToPath(import.meta.url));
const ME = resolve(here, '../../app/api/admin/me/route.ts');
const STATUS = resolve(here, '../../app/api/admin/users/[id]/status/route.ts');
const SCRIPT_SUPERADMIN = resolve(here, '../../../scripts/make-superadmin.ts');

const CAPACITES_ADMIN = [
  'users:read',
  'users:status:suspend',
  'orders:read',
  'withdrawals:read',
  'audit-log:read',
  'outbox:read',
  'email-queue:read',
  'rate-limits:read',
];
const CAPACITES_SUPERADMIN = [
  ...CAPACITES_ADMIN,
  'users:role',
  'users:status:restore',
  'withdrawals:cancel',
];

describe('les capacités employées existent vraiment dans le contrat', () => {
  const source = readFileSync(ME, 'utf8');

  it('users:status:suspend et users:status:restore sont bien annoncées', () => {
    expect(source).toContain("'users:status:suspend'");
    expect(source).toContain("'users:status:restore'");
  });

  it('restore n’est accordée qu’au SUPERADMIN', () => {
    // La liste ADMIN se termine avant la liste SUPERADMIN dans la source ; si
    // `restore` apparaissait deux fois, un ADMIN se verrait offrir une action
    // qui reviendrait en 403.
    const occurrences = source.split("'users:status:restore'").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('actionStatut — quelle action proposer, et sinon pourquoi', () => {
  it('propose Suspendre sur un compte actif, à un ADMIN', () => {
    const a = actionStatut({
      can: CAPACITES_ADMIN,
      roleActeur: 'ADMIN',
      cible: { role: 'USER', status: 'ACTIVE' },
    });
    expect(a).toEqual({ sens: 'suspendre', label: 'Suspendre', offerte: true, empeche: '' });
  });

  it('propose Rétablir sur un compte suspendu, à un SUPERADMIN', () => {
    const a = actionStatut({
      can: CAPACITES_SUPERADMIN,
      roleActeur: 'SUPERADMIN',
      cible: { role: 'USER', status: 'SUSPENDED' },
    });
    expect(a.sens).toBe('retablir');
    expect(a.offerte).toBe(true);
  });

  it('refuse Rétablir à un ADMIN, et dit pourquoi', () => {
    const a = actionStatut({
      can: CAPACITES_ADMIN,
      roleActeur: 'ADMIN',
      cible: { role: 'USER', status: 'SUSPENDED' },
    });
    expect(a.sens).toBe('retablir');
    expect(a.offerte).toBe(false);
    expect(a.empeche).toContain('super-administrateur');
  });

  // CR-01 : sans cette règle un ADMIN fermerait d'un seul PATCH tous les
  // comptes au-dessus de lui, en contournant la garde du dernier
  // super-administrateur, qui ne regarde que le rôle.
  it('refuse à un ADMIN de suspendre un SUPERADMIN', () => {
    const a = actionStatut({
      can: CAPACITES_ADMIN,
      roleActeur: 'ADMIN',
      cible: { role: 'SUPERADMIN', status: 'ACTIVE' },
    });
    expect(a.offerte).toBe(false);
    expect(a.empeche).toContain('super-administrateur');
  });

  it('l’autorise entre super-administrateurs', () => {
    const a = actionStatut({
      can: CAPACITES_SUPERADMIN,
      roleActeur: 'SUPERADMIN',
      cible: { role: 'SUPERADMIN', status: 'ACTIVE' },
    });
    expect(a.offerte).toBe(true);
  });

  it('n’offre rien sans capacité, et ne se fie pas au rôle seul', () => {
    // Le rôle dit SUPERADMIN mais la réponse du serveur n'accorde rien : c'est
    // la réponse du serveur qui gagne, jamais une déduction côté navigateur.
    const a = actionStatut({
      can: [],
      roleActeur: 'SUPERADMIN',
      cible: { role: 'USER', status: 'ACTIVE' },
    });
    expect(a.offerte).toBe(false);
    expect(a.empeche.length).toBeGreaterThan(0);
  });

  it('traite une liste de capacités absente comme vide', () => {
    expect(
      actionStatut({
        can: undefined,
        roleActeur: 'ADMIN',
        cible: { role: 'USER', status: 'ACTIVE' },
      }).offerte,
    ).toBe(false);
  });

  it('dit toujours quelque chose quand elle n’offre rien', () => {
    // Un bouton absent sans explication se lit comme une panne.
    for (const cas of [
      { can: [], roleActeur: 'ADMIN', cible: { role: 'USER', status: 'ACTIVE' } },
      { can: CAPACITES_ADMIN, roleActeur: 'ADMIN', cible: { role: 'USER', status: 'SUSPENDED' } },
      {
        can: CAPACITES_ADMIN,
        roleActeur: 'ADMIN',
        cible: { role: 'SUPERADMIN', status: 'ACTIVE' },
      },
    ]) {
      const a = actionStatut(cas);
      expect(a.offerte).toBe(false);
      expect(a.empeche, JSON.stringify(cas)).toMatch(/[.!]$/);
    }
  });
});

describe('confirmationChangementStatut', () => {
  const cible = { id: 'autre', email: 'partenaire@exemple.net' };

  it('demande toujours confirmation, dans les deux sens', () => {
    for (const sens of ['suspendre', 'retablir'] as const) {
      const c = confirmationChangementStatut({ sens, idActeur: 'moi', cible });
      expect(c.requise, sens).toBe(true);
      expect(c.message, sens).toContain(cible.email);
    }
  });

  // LE CAS QUI COMPTE. Se suspendre soi-même coupe la connexion ET le
  // rafraîchissement, et `make-superadmin` n'écrit que `role` : il n'existe
  // aucune commande pour revenir. Plus grave que l'auto-rétrogradation.
  it('avertit beaucoup plus fort quand on se suspend soi-même', () => {
    const soi = confirmationChangementStatut({
      sens: 'suspendre',
      idActeur: 'moi',
      cible: { id: 'moi', email: 'moi@exemple.net' },
    });
    const autre = confirmationChangementStatut({ sens: 'suspendre', idActeur: 'moi', cible });

    expect(soi.message.toLowerCase()).toContain('votre propre compte');
    expect(soi.message).toContain('base de données');
    expect(soi.message).toContain('db:make-superadmin');
    // L'avertissement doit être sensiblement plus explicite que l'ordinaire,
    // sinon il se lit comme le même message et personne ne s'arrête.
    expect(soi.message.length).toBeGreaterThan(autre.message.length * 1.5);
  });

  it('n’emploie pas l’avertissement grave pour un rétablissement de soi-même', () => {
    // Se rétablir soi-même est impossible en pratique (on est déconnecté),
    // mais le message ne doit pas pour autant parler de perte d'accès.
    const c = confirmationChangementStatut({
      sens: 'retablir',
      idActeur: 'moi',
      cible: { id: 'moi', email: 'moi@exemple.net' },
    });
    expect(c.message).not.toContain('base de données');
  });
});

describe('verifierRaison — avant l’envoi, pas après', () => {
  it('accepte l’absence de raison : le champ est optionnel côté route', () => {
    for (const vide of [undefined, null, '', '   ']) {
      expect(verifierRaison(vide)).toEqual({ ok: true });
    }
  });

  it('nettoie les espaces de bord', () => {
    expect(verifierRaison('  fraude confirmée  ')).toEqual({
      ok: true,
      raison: 'fraude confirmée',
    });
  });

  it('refuse au-delà de la borne du serveur, en donnant les deux nombres', () => {
    const r = verifierRaison('x'.repeat(RAISON_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.probleme).toContain(String(RAISON_MAX + 1));
      expect(r.probleme).toContain(String(RAISON_MAX));
    }
  });

  it('accepte exactement la borne', () => {
    expect(verifierRaison('x'.repeat(RAISON_MAX)).ok).toBe(true);
  });

  it('la borne est celle que la route déclare', () => {
    // Recopier 500 à la main, c'est accepter qu'il dérive. On le lit.
    const source = readFileSync(STATUS, 'utf8');
    const m = source.match(/reason:\s*z\.string\(\)\.min\(1\)\.max\((\d+)\)/);
    expect(m, 'la forme Zod du champ reason a changé').not.toBeNull();
    expect(Number(m![1])).toBe(RAISON_MAX);
  });
});

describe('corpsChangementStatut', () => {
  it('traduit le sens en statut', () => {
    expect(corpsChangementStatut('suspendre')).toEqual({ status: 'SUSPENDED' });
    expect(corpsChangementStatut('retablir')).toEqual({ status: 'ACTIVE' });
  });

  it('omet reason plutôt que d’envoyer une chaîne vide, que min(1) refuserait', () => {
    expect(corpsChangementStatut('suspendre', undefined)).not.toHaveProperty('reason');
    expect(corpsChangementStatut('suspendre', 'fraude')).toEqual({
      status: 'SUSPENDED',
      reason: 'fraude',
    });
  });

  it('statutApres est cohérent avec le corps envoyé', () => {
    expect(statutApres('suspendre')).toBe(corpsChangementStatut('suspendre').status);
    expect(statutApres('retablir')).toBe(corpsChangementStatut('retablir').status);
  });
});

describe('les codes que la route renvoie sont traduits', () => {
  const source = readFileSync(STATUS, 'utf8');
  const codesEmis = [...source.matchAll(/error:\s*'([^']+)'/g)].map((m) => m[1]!);

  it('la route en déclare bien, sinon ce test ne prouve rien', () => {
    expect(codesEmis.length).toBeGreaterThanOrEqual(3);
  });

  it('aucun ne retombe sur le message générique', () => {
    const generique = 'L’action a échoué. Réessayez.';
    for (const code of codesEmis) {
      expect(messageErreurAdmin(code), `« ${code} » n'est pas traduit`).not.toBe(generique);
    }
  });

  it('aucun message ne laisse fuir le code brut', () => {
    for (const code of codesEmis) {
      expect(messageErreurAdmin(code, 403), code).not.toContain(code);
    }
  });
});

describe('messageSuccesStatut dit ce qui a changé pour la personne', () => {
  it('nomme la conséquence, pas l’opération', () => {
    expect(messageSuccesStatut('suspendre', 'a@b.net')).toContain('ne peut plus se connecter');
    expect(messageSuccesStatut('retablir', 'a@b.net')).toContain('peut se reconnecter');
  });
});

describe('le fait qui justifie l’avertissement grave', () => {
  // Si ce test devient faux, l'avertissement devient un mensonge : il annonce
  // qu'aucune commande ne lève une suspension. Le jour où le script apprend à
  // écrire `status`, c'est le message qu'il faut corriger, pas ce test.
  it('make-superadmin n’écrit que le rôle, jamais le statut', () => {
    const source = readFileSync(SCRIPT_SUPERADMIN, 'utf8');
    const sansCommentaires = source
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n');
    expect(sansCommentaires).toMatch(/data:\s*\{\s*role:\s*'SUPERADMIN'\s*\}/);
    expect(sansCommentaires).not.toMatch(/status:\s*'ACTIVE'/);
  });
});
