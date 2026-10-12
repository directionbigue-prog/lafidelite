import { describe, it, expect } from 'vitest';
import {
  ROLES,
  libelleRole,
  rangRole,
  estRoleConnu,
  peutChangerLesRoles,
  confirmationChangementRole,
  construireRequeteUtilisateurs,
  messageErreurAdmin,
  formaterDate,
  libelleVerification,
} from './console';

describe('les rôles', () => {
  it('va du moins au plus puissant', () => {
    expect(ROLES).toEqual(['USER', 'ADMIN', 'SUPERADMIN']);
    expect(rangRole('USER')).toBeLessThan(rangRole('ADMIN'));
    expect(rangRole('ADMIN')).toBeLessThan(rangRole('SUPERADMIN'));
  });

  it('rend -1 pour un rôle inconnu plutôt que de le classer', () => {
    // Un rôle inconnu qui se classerait à 0 passerait pour un USER, donc pour
    // quelqu'un de légitime mais sans droits. Mieux vaut qu'il ne se classe pas.
    expect(rangRole('ROOT')).toBe(-1);
    expect(estRoleConnu('ROOT')).toBe(false);
    expect(estRoleConnu('SUPERADMIN')).toBe(true);
  });

  it('affiche le rôle en français, et rend l’inconnu tel quel', () => {
    expect(libelleRole('SUPERADMIN')).toBe('Super-administrateur');
    expect(libelleRole('USER')).toBe('Utilisateur');
    expect(libelleRole('ROOT')).toBe('ROOT');
  });
});

describe('qui peut changer les rôles', () => {
  it('seul le super-administrateur', () => {
    expect(peutChangerLesRoles('SUPERADMIN')).toBe(true);
    expect(peutChangerLesRoles('ADMIN')).toBe(false);
    expect(peutChangerLesRoles('USER')).toBe(false);
    expect(peutChangerLesRoles('')).toBe(false);
  });
});

describe('la confirmation avant un changement de rôle', () => {
  const base = { idActeur: 'a', idCible: 'b', roleActuel: 'USER', nouveauRole: 'USER' };

  it('ne demande rien quand le rôle ne change pas', () => {
    expect(confirmationChangementRole(base).requise).toBe(false);
  });

  it('ne demande rien pour une rétrogradation ordinaire d’un tiers', () => {
    expect(
      confirmationChangementRole({ ...base, roleActuel: 'ADMIN', nouveauRole: 'USER' }).requise,
    ).toBe(false);
  });

  // Le cas qui justifie la fonction : le serveur n'interdit PAS de se
  // rétrograder soi-même tant qu'un autre super-administrateur existe, et c'est
  // pourtant l'action qui ferme la console à celui qui la fait.
  it('prévient quand on retire SON PROPRE statut de super-administrateur', () => {
    const c = confirmationChangementRole({
      idActeur: 'moi',
      idCible: 'moi',
      roleActuel: 'SUPERADMIN',
      nouveauRole: 'ADMIN',
    });
    expect(c.requise).toBe(true);
    expect(c.message).toContain('VOTRE');
    expect(c.message).toContain('db:make-superadmin');
  });

  it('ne prévient pas quand on rétrograde UN AUTRE super-administrateur', () => {
    // Celui-là, le serveur le refusera s'il est le dernier. Pas besoin
    // d'inventer une garde côté client pour une règle que le serveur tient.
    const c = confirmationChangementRole({
      idActeur: 'moi',
      idCible: 'quelqu-un-dautre',
      roleActuel: 'SUPERADMIN',
      nouveauRole: 'USER',
    });
    expect(c.requise).toBe(false);
  });

  it('prévient avant toute promotion en super-administrateur', () => {
    const c = confirmationChangementRole({ ...base, nouveauRole: 'SUPERADMIN' });
    expect(c.requise).toBe(true);
    expect(c.message).toContain('y compris le vôtre');
  });
});

describe('la requête vers /admin/users', () => {
  it('sans filtre, ne met aucun paramètre', () => {
    expect(construireRequeteUtilisateurs()).toBe('/admin/users');
    expect(construireRequeteUtilisateurs({})).toBe('/admin/users');
  });

  // Le piège : la route passe `role` tel quel au `where` de Prisma. `?role=`
  // filtrerait sur la chaîne vide et rendrait zéro ligne, ce qui ressemble à
  // « aucun utilisateur » et pas à une erreur.
  it('OMET un filtre vide au lieu de l’envoyer vide', () => {
    expect(construireRequeteUtilisateurs({ q: '', role: '', cursor: null })).toBe('/admin/users');
    expect(construireRequeteUtilisateurs({ q: '   ' })).toBe('/admin/users');
  });

  it('refuse un rôle inconnu plutôt que de le transmettre', () => {
    expect(construireRequeteUtilisateurs({ role: 'ROOT' })).toBe('/admin/users');
  });

  it('encode la recherche', () => {
    expect(construireRequeteUtilisateurs({ q: 'a@b.fr' })).toBe('/admin/users?q=a%40b.fr');
  });

  it('tronque une recherche trop longue au plafond de la route (200)', () => {
    const url = construireRequeteUtilisateurs({ q: 'x'.repeat(500) });
    expect(new URLSearchParams(url.split('?')[1]).get('q')).toHaveLength(200);
  });

  it('transmet le curseur et la limite', () => {
    const url = construireRequeteUtilisateurs({ cursor: 'abc', limite: 25 });
    const p = new URLSearchParams(url.split('?')[1]);
    expect(p.get('cursor')).toBe('abc');
    expect(p.get('limit')).toBe('25');
  });

  it('ignore une limite qui n’est pas un nombre fini', () => {
    expect(construireRequeteUtilisateurs({ limite: Number.NaN })).toBe('/admin/users');
    expect(construireRequeteUtilisateurs({ limite: Number.POSITIVE_INFINITY })).toBe(
      '/admin/users',
    );
  });
});

describe('les messages d’erreur', () => {
  it('traduit le refus du dernier super-administrateur', () => {
    const m = messageErreurAdmin('LAST_SUPERADMIN');
    expect(m).toContain('dernier super-administrateur');
    // Le message du serveur est anglais et destiné aux journaux.
    expect(m).not.toContain('Refuse to demote');
  });

  it('a un repli pour un code inconnu et pour l’absence de code', () => {
    expect(messageErreurAdmin('BRUIT')).toBe('L’action a échoué. Réessayez.');
    expect(messageErreurAdmin(undefined)).toBe('L’action a échoué. Réessayez.');
    expect(messageErreurAdmin(null)).toBe('L’action a échoué. Réessayez.');
  });

  it('couvre les codes que ces routes rendent vraiment', () => {
    for (const code of ['USER_NOT_FOUND', 'VALIDATION_FAILED', 'FORBIDDEN', 'UNAUTHORIZED']) {
      expect(messageErreurAdmin(code), code).not.toBe('L’action a échoué. Réessayez.');
    }
  });
});

describe('les dates', () => {
  it('formate en jour/mois/année', () => {
    expect(formaterDate('2026-10-02T12:23:24.000Z')).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  it('rend un tiret pour vide, nul ou illisible — jamais « Invalid Date »', () => {
    expect(formaterDate(null)).toBe('—');
    expect(formaterDate(undefined)).toBe('—');
    expect(formaterDate('pas une date')).toBe('—');
  });

  it('dit clairement qu’un compte n’a jamais été vérifié', () => {
    expect(libelleVerification(null)).toBe('Jamais vérifié');
    expect(libelleVerification('2026-10-02T00:00:00.000Z')).toContain('Vérifié le');
  });
});
