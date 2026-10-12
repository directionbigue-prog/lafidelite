import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';
import { etatDesLimiteurs, libelleSeau, estSeauDeVerrou } from './console';

// LE DÉFAUT QUE CE FICHIER GARDE, constaté TROIS fois dans ce dépôt.
//
//   02/10/2026 — la console est livrée sans aucun lien depuis le produit.
//                `grep -rn "/admin" src/components/` ne rend rien.
//   03/10/2026 — neuf des douze routes n'ont aucun écran : commandes,
//                retraits, journal, outbox, file d'e-mails, limiteurs.
//   03/10/2026 — trois restent muettes après le lot précédent, dont
//                `users/[id]/status`, la seule action capable de fermer un
//                compte. Et la liste des comptes lisait `status` dans sa
//                réponse sans jamais l'afficher.
//
// À chaque fois le symptôme est le même : la route répond correctement, ses
// tests passent, et personne ne peut l'atteindre. Un back-office qu'on ne
// consulte qu'avec `curl` n'est pas un back-office, et rien ne le signale.
//
// Ce test ferme la boucle : il PART des routes et exige un appel dans l'UI.

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../..');
const ROUTES_ADMIN = resolve(SRC, 'app/api/admin');
const PAGE = resolve(SRC, 'app/admin/page.tsx');
const COMPOSANTS = resolve(SRC, 'components/admin');
// `console.ts` compte comme surface : ce dépôt y met délibérément les
// constructeurs de requête (`construireRequeteUtilisateurs` y fabrique
// `/admin/users`), pour que la pagination et les filtres soient testables sans
// monter de composant. L'exclure ferait passer la liste des comptes pour
// orpheline — mesuré en écrivant ce test.
const DECISIONS = resolve(here, 'console.ts');

/**
 * Les routes qu'on accepte sciemment de ne pas câbler, avec la raison.
 *
 * Une exemption vide n'en est pas une : celle-ci est gardée par son propre
 * test plus bas, qui vérifie que la raison est toujours vraie.
 */
const EXEMPTEES: Record<string, string> = {
  'users/[id]':
    "GET détail : son USER_SELECT est identique à celui de la liste, donc un panneau de détail n'afficherait rien que la ligne ne montre déjà.",
};

async function cheminsDesRoutes(): Promise<string[]> {
  const fichiers = await fg('**/route.ts', { cwd: ROUTES_ADMIN, onlyFiles: true });
  return fichiers.map((f) => f.replace(/\/route\.ts$/, '')).sort();
}

/**
 * Retire les commentaires — sans quoi ce test est creux.
 *
 * MESURÉ EN L'ÉCRIVANT : la première version scrutait la source brute, et le
 * commentaire de `console.ts` qui explique « GET /api/admin/rate-limits était
 * la dernière des douze routes sans écran » suffisait à la satisfaire. J'ai
 * débranché l'appel réel et le test est resté vert. Une prose qui cite un
 * chemin n'est pas un écran qui l'appelle.
 */
function sansCommentaires(src: string): string {
  // L'ORDRE COMPTE, et la première version l'avait à l'envers. En retirant les
  // blocs d'abord, le `/*` contenu dans le commentaire de ligne
  // « // sous /api/admin/*, toutes gardées par requireAdmin » ouvrait un bloc
  // qui courait jusqu'au premier `*/` treize mille caractères plus loin : tout
  // le haut du fichier disparaissait, dont l'appel à `/admin/me`. On retire
  // donc les commentaires de LIGNE d'abord, ce qui emporte ces faux `/*`.
  const sansLignes = src
    .split('\n')
    .map((l) => (l.trimStart().startsWith('//') ? '' : l.replace(/\s\/\/.*$/, '')))
    .join('\n');
  return sansLignes.replace(/\/\*[\s\S]*?\*\//g, '');
}

function sourceDeLInterface(): string {
  const fichiers = fg.sync('**/*.tsx', { cwd: COMPOSANTS, onlyFiles: true, absolute: true });
  return [PAGE, DECISIONS, ...fichiers]
    .map((f) => sansCommentaires(readFileSync(f, 'utf8')))
    .join('\n');
}

/**
 * Un segment dynamique est écrit `[id]` dans l'arborescence et `${x.id}` dans
 * l'appel. On construit donc un motif plutôt que de comparer des chaînes.
 */
function motifDAppel(cheminRoute: string): RegExp {
  const echappe = cheminRoute
    .split('/')
    .map((s) => (/^\[.+\]$/.test(s) ? '\\$\\{[^}]+\\}' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`/admin/${echappe}(?![a-z0-9\\-/])`);
}

describe('chaque route d’administration a un écran', () => {
  it('il y a bien des routes à vérifier, sinon ce test ne prouve rien', async () => {
    expect((await cheminsDesRoutes()).length).toBeGreaterThanOrEqual(13);
  });

  it('chacune est appelée depuis la console, ou exemptée avec une raison', async () => {
    const ui = sourceDeLInterface();
    const orphelines: string[] = [];

    for (const chemin of await cheminsDesRoutes()) {
      // `me` n'est pas une surface : c'est la question « qui suis-je ».
      if (chemin === 'me') {
        expect(ui).toContain("'/admin/me'");
        continue;
      }
      if (EXEMPTEES[chemin]) continue;
      if (!motifDAppel(chemin).test(ui)) orphelines.push(chemin);
    }

    expect(
      orphelines,
      `ces routes répondent correctement et ne sont atteignables de nulle part : ${orphelines.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque exemption porte une raison substantielle', () => {
    for (const [chemin, raison] of Object.entries(EXEMPTEES)) {
      expect(raison.length, chemin).toBeGreaterThan(40);
    }
  });

  // L'exemption de `users/[id]` tient à UN fait vérifiable. Le jour où le
  // détail renvoie plus que la liste, elle devient fausse et il faut un écran.
  it('l’exemption du détail reste vraie : les deux SELECT sont identiques', () => {
    const extraire = (fichier: string) => {
      const src = readFileSync(resolve(ROUTES_ADMIN, fichier), 'utf8');
      const bloc = src.match(/const USER_SELECT = \{([\s\S]*?)\}\s*as const/);
      expect(bloc, `USER_SELECT introuvable dans ${fichier}`).not.toBeNull();
      return bloc![1]!
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('//'))
        .sort()
        .join('|');
    };

    const liste = extraire('users/route.ts');
    const detail = extraire('users/[id]/route.ts');
    expect(liste.length).toBeGreaterThan(20);
    expect(
      detail,
      "le détail ne renvoie plus la même chose que la liste : il lui faut désormais un écran, et l'exemption doit sauter",
    ).toBe(liste);
  });
});

describe('l’onglet Comptes montre et manœuvre le statut', () => {
  const page = readFileSync(PAGE, 'utf8');

  // Le statut était dans l'interface TypeScript, dans le SELECT de la route et
  // dans la réponse — et nulle part à l'écran.
  it('affiche le statut de chaque compte', () => {
    expect(page).toContain('libelleStatut(u.status)');
    expect(page).toContain('tonDuStatut(u.status)');
  });

  it('appelle la route de statut en PATCH', () => {
    expect(page).toMatch(/\/admin\/users\/\$\{[^}]+\}\/status/);
    expect(page).toContain("method: 'PATCH'");
  });

  it('passe par les décisions testées, et n’en réécrit aucune', () => {
    for (const nom of [
      'actionStatut',
      'confirmationChangementStatut',
      'verifierRaison',
      'corpsChangementStatut',
      'statutApres',
      'messageSuccesStatut',
    ]) {
      expect(page, `${nom} n'est pas employé`).toContain(nom);
    }
  });

  it('demande confirmation avant d’envoyer', () => {
    // Extrait du corps de `changerStatut` seulement : une occurrence de
    // `window.confirm` ailleurs dans le fichier ne prouverait rien.
    const debut = page.indexOf('async function changerStatut');
    expect(debut).toBeGreaterThan(-1);
    const corps = page.slice(debut, page.indexOf('\n  }', debut));
    expect(corps).toContain('window.confirm');
    expect(corps).toContain('confirmation.message');
    // Et la confirmation précède l'appel réseau.
    expect(corps.indexOf('window.confirm')).toBeLessThan(corps.indexOf('/status'));
  });
});

describe('etatDesLimiteurs distingue trois absences qui se ressemblent', () => {
  // Sans cette distinction, un Redis non configuré s'afficherait comme
  // « aucune tentative » — c'est-à-dire comme une bonne nouvelle.
  it('Redis absent n’est pas « aucune tentative »', () => {
    const r = etatDesLimiteurs({ buckets: [], note: 'redis not configured' });
    expect(r.utilisable).toBe(false);
    expect(r.message).toContain('Redis');
    expect(r.message).not.toContain('Aucune tentative');
  });

  it('des seaux tous vides se disent comme tels', () => {
    const r = etatDesLimiteurs({ buckets: [{ totalKeys: 0 }, { totalKeys: 0 }] });
    expect(r.utilisable).toBe(false);
    expect(r.message).toContain('Aucune tentative');
  });

  it('aucun seau du tout est un troisième cas', () => {
    expect(etatDesLimiteurs({ buckets: [] }).message).toContain('Aucun seau');
  });

  it('un seul seau non vide suffit à afficher', () => {
    expect(etatDesLimiteurs({ buckets: [{ totalKeys: 0 }, { totalKeys: 3 }] }).utilisable).toBe(
      true,
    );
  });
});

describe('les sept seaux portent un libellé', () => {
  // Lus dans la source de la route : un seau renommé laisserait ici un libellé
  // orphelin et afficherait un identifiant technique, sans que rien n'échoue.
  const source = readFileSync(resolve(ROUTES_ADMIN, 'rate-limits/route.ts'), 'utf8');
  const seaux = [...source.matchAll(/bucket:\s*'([^']+)'/g)].map((m) => m[1]!);

  it('la route en déclare bien sept', () => {
    expect(seaux).toHaveLength(7);
  });

  it('chacun est traduit, aucun ne reste son identifiant', () => {
    for (const seau of seaux) {
      expect(libelleSeau(seau), `« ${seau} » n'est pas traduit`).not.toBe(seau);
    }
  });

  it('le seau de verrou est reconnu : c’est le seul qui demande une action', () => {
    expect(seaux.filter((s) => estSeauDeVerrou(s))).toEqual(['lockout']);
  });
});
