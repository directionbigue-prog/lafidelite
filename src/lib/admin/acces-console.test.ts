import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { peutVoirLaConsole, ROLES } from './console';

// La console d'administration a été livrée le 02/10/2026 avec ses douze routes
// et son écran — et AUCUN lien depuis le produit. `grep -rn "/admin"` sur
// `src/components/` ne renvoyait rien : la navigation de `AppShell` portait
// trois entrées (Accueil, Le Salon, Réglages) et pas une quatrième. Le seul
// moyen d'entrer était de taper l'URL, ce que le propriétaire du produit a
// signalé en disant qu'il ne voyait pas son compte super-administrateur.
//
// Ces tests gardent les deux moitiés : le lien EXISTE pour qui a le rôle, et
// il ne protège RIEN.

const here = dirname(fileURLToPath(import.meta.url));
const SHELL = resolve(here, '../../components/app/AppShell.tsx');
const PAGE_ADMIN = resolve(here, '../../app/admin/page.tsx');
const ROUTE_ME = resolve(here, '../../app/api/auth/me/route.ts');

const shell = readFileSync(SHELL, 'utf8');
const pageAdmin = readFileSync(PAGE_ADMIN, 'utf8');
const routeMe = readFileSync(ROUTE_ME, 'utf8');

describe('qui voit le lien vers la console', () => {
  it('l’ouvre à ADMIN et SUPERADMIN', () => {
    expect(peutVoirLaConsole('ADMIN')).toBe(true);
    expect(peutVoirLaConsole('SUPERADMIN')).toBe(true);
  });

  it('le refuse à un simple utilisateur', () => {
    expect(peutVoirLaConsole('USER')).toBe(false);
  });

  // Le rôle arrive de `/api/auth/me` : il est absent le temps de la requête,
  // et peut manquer d'une réponse mise en cache. L'inconnu ne doit jamais se
  // lire comme un privilège.
  it('ne l’ouvre sur rien d’inconnu, d’absent ou de vide', () => {
    for (const valeur of [null, undefined, '', 'user', 'superadmin', 'OWNER', 'ROOT']) {
      expect(peutVoirLaConsole(valeur as string | null | undefined), String(valeur)).toBe(false);
    }
  });

  it('couvre bien tous les rôles connus, sans en oublier un', () => {
    const ouverts = ROLES.filter((r) => peutVoirLaConsole(r));
    expect(ouverts).toEqual(['ADMIN', 'SUPERADMIN']);
  });
});

describe('la navigation propose réellement une porte', () => {
  it('AppShell déclare une entrée vers /admin', () => {
    // Le défaut exact : la console existait et rien n'y menait.
    expect(shell).toContain("href: '/admin'");
    expect(shell).toContain('Administration');
  });

  it('cette entrée est conditionnée par le rôle, pas montrée à tous', () => {
    expect(shell).toContain('peutVoirLaConsole');
    // Et elle est hors de NAV, sinon elle s'afficherait pour tout le monde.
    const bloc = /const NAV: [^=]+= \[([\s\S]*?)\n\];/.exec(shell)?.[1];
    expect(bloc, 'NAV introuvable dans AppShell').toBeTruthy();
    expect(bloc).not.toContain('/admin');
  });

  it('la page d’administration s’allume dans sa propre section', () => {
    // Elle se marquait « reglages », donc la navigation désignait Réglages
    // comme page courante pendant qu'on était sur la console.
    expect(pageAdmin).toContain('active="administration"');
  });
});

describe('masquer le lien ne protège rien', () => {
  // L'invariant de CLAUDE.md : « it protects nothing… the real gate is
  // requireSuperadmin inside the route. Never move a check out of a route and
  // into this page. » Le lien conditionnel est de l'ergonomie — éviter
  // d'offrir une action qui reviendrait en 403.
  it('la console interroge toujours le serveur pour connaître ses droits', () => {
    expect(pageAdmin).toContain("api<Moi>('/admin/me')");
    // Et elle traite le 403 comme une réponse normale, pas comme une panne.
    expect(pageAdmin).toContain('setRefuse(true)');
  });

  it('le module de décision ne garde rien par lui-même', () => {
    const src = readFileSync(resolve(here, 'console.ts'), 'utf8');
    // Un module de décision d'interface qui importerait Prisma ou un garde
    // serveur signalerait qu'un contrôle a migré dans l'écran.
    expect(src).not.toMatch(/from '@\/lib\/server/);
    expect(src).not.toContain('prisma');
  });
});

describe('/api/auth/me expose le rôle du demandeur, et seulement le sien', () => {
  it('le lit en base et le renvoie', () => {
    expect(routeMe).toContain('role: true');
    expect(routeMe).toContain("role: dbUser?.role ?? 'USER'");
  });

  it('retombe sur USER quand la ligne ne porte pas de rôle', () => {
    // Les tests de cette route stubbent `findUnique` avec une charge minimale.
    // Un `??` manquant ferait passer `undefined`, et une interface qui lit
    // `undefined` comme « pas USER » afficherait la porte à tout le monde.
    expect(routeMe).toContain("?? 'USER'");
  });

  it('ne lit le rôle que de l’appelant', () => {
    // La requête est cadrée sur `auth.user.sub` : aucun moyen de demander le
    // rôle de quelqu'un d'autre par cette route.
    expect(routeMe).toContain('where: { id: auth.user.sub }');
  });
});
