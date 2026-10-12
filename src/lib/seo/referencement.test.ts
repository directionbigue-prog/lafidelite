import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import {
  PAGES,
  PAGES_INDEXABLES,
  PREFIXES_INTERDITS,
  ORIGINE_CANONIQUE,
  metadataDePage,
  pageDuChemin,
  urlAbsolue,
  resoudreOrigineCanonique,
} from './pages';

// « Indexer toutes les pages » n'est pas une case à cocher : la moitié des
// écrans de ce produit sont derrière une session, et deux d'entre eux ne
// doivent surtout PAS être indexés. Ces tests tiennent les deux bouts — rien
// d'indexable n'est oublié, rien de privé ne fuit.

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../../app');

/** Tous les `page.tsx` du dépôt, ramenés à leur chemin d'URL. */
function cheminsDesPages(): string[] {
  const out: string[] = [];
  (function marcher(dir: string) {
    for (const nom of readdirSync(dir)) {
      const complet = resolve(dir, nom);
      if (statSync(complet).isDirectory()) marcher(complet);
      else if (nom === 'page.tsx') {
        const rel = relative(APP, dirname(complet)).split(sep).join('/');
        out.push(rel === '' ? '/' : `/${rel}`);
      }
    }
  })(APP);
  return out.sort();
}

describe('le registre couvre toutes les pages du dépôt', () => {
  // L'ASSERTION QUI FAIT TOUT LE TRAVAIL. Un sitemap écrit à la main se
  // désynchronise au premier écran ajouté, et rien ne le signale : un sitemap
  // incomplet ne produit aucune erreur, juste des pages absentes des
  // résultats. Ici, ajouter une page sans la déclarer casse le CI.
  it('chaque page.tsx a une entrée, et réciproquement', () => {
    const surDisque = cheminsDesPages();
    const declarees = PAGES.map((p) => p.chemin).sort();
    expect(declarees).toEqual(surDisque);
  });

  it('aucun doublon dans le registre', () => {
    const vus = PAGES.map((p) => p.chemin);
    expect(new Set(vus).size).toBe(vus.length);
  });

  it('toute page non indexable dit pourquoi', () => {
    // Sans raison écrite, « non indexable » devient un réglage que personne
    // n'ose rouvrir parce que personne ne sait pourquoi il est là.
    for (const page of PAGES.filter((p) => !p.indexable)) {
      expect(page.raison, page.chemin).toBeTruthy();
      expect(page.raison!.length, page.chemin).toBeGreaterThan(20);
    }
  });
});

describe('rien de privé ne part dans le sitemap', () => {
  it('le sitemap ne contient que des pages publiques', () => {
    for (const page of PAGES_INDEXABLES) {
      expect(page.indexable, page.chemin).toBe(true);
      expect(page.dynamique ?? false, page.chemin).toBe(false);
    }
  });

  // Le cas qui compte vraiment : `/invite/[code]` porte un code
  // d'appariement valable sept jours. Indexer une seule de ces URL
  // permettrait à n'importe qui de rejoindre l'Espace Couple d'un autre.
  it('l’URL d’invitation est interdite, et pour la bonne raison', () => {
    const invite = pageDuChemin('/invite/[code]');
    expect(invite, '/invite/[code] doit rester déclarée').toBeDefined();
    expect(invite!.indexable).toBe(false);
    expect(invite!.dynamique).toBe(true);
    expect(invite!.raison?.toLowerCase()).toContain('code');
    expect(PAGES_INDEXABLES.map((p) => p.chemin)).not.toContain('/invite/[code]');
  });

  it('aucune page paramétrée n’est indexable', () => {
    // Une URL à paramètre n'existe que pour un destinataire ; l'énumérer
    // reviendrait à publier ce qu'elle protège.
    for (const page of PAGES.filter((p) => p.chemin.includes('['))) {
      expect(page.indexable, page.chemin).toBe(false);
      expect(page.dynamique, page.chemin).toBe(true);
    }
  });

  it('aucun écran derrière la session n’est indexable', () => {
    const prives = ['/admin', '/settings', '/jeu', '/salon', '/couple/creer', '/verify-email'];
    for (const chemin of prives) {
      expect(pageDuChemin(chemin)?.indexable, chemin).toBe(false);
    }
  });
});

describe('chaque segment privé porte un noindex, pas seulement un Disallow', () => {
  // Un `Disallow` dit « ne va pas voir » ; il ne dit pas « n'inscris pas au
  // catalogue ». Une URL partagée ailleurs peut être indexée sans jamais
  // avoir été visitée — d'où le `noindex` dans le layout de chaque segment.
  const segmentsPrives = [
    ...new Set(
      PAGES.filter((p) => !p.indexable).map((p) => p.chemin.split('/').filter(Boolean)[0] ?? ''),
    ),
  ].filter(Boolean);

  it('il y a bien des segments privés, sinon ce test ne prouve rien', () => {
    expect(segmentsPrives.length).toBeGreaterThan(5);
  });

  for (const segment of segmentsPrives) {
    it(`/${segment} a un layout qui refuse l’indexation`, () => {
      const chemin = resolve(APP, segment, 'layout.tsx');
      expect(existsSync(chemin), `src/app/${segment}/layout.tsx manquant`).toBe(true);
      const src = readFileSync(chemin, 'utf8');
      expect(src).toContain('index: false');
      expect(src).toContain('follow: false');
    });
  }
});

describe('robots.txt', () => {
  it('refuse chaque segment privé', () => {
    for (const page of PAGES.filter((p) => !p.indexable)) {
      const tete = `/${page.chemin.split('/').filter(Boolean)[0]}`;
      expect(PREFIXES_INTERDITS, page.chemin).toContain(tete);
    }
  });

  it('ne refuse AUCUN chemin public', () => {
    // Le défaut symétrique, et le plus coûteux : un `Disallow` trop large
    // dépublie le produit entier sans que rien n'échoue.
    for (const page of PAGES_INDEXABLES) {
      for (const interdit of PREFIXES_INTERDITS) {
        if (page.chemin === '/') continue;
        expect(
          page.chemin === interdit || page.chemin.startsWith(interdit + '/'),
          `${page.chemin} est public mais tomberait sous ${interdit}`,
        ).toBe(false);
      }
    }
  });

  it('refuse aussi /api, qui n’est pas une page mais coûte du budget de crawl', () => {
    expect(PREFIXES_INTERDITS).toContain('/api');
  });

  it('ne refuse pas la racine', () => {
    expect(PREFIXES_INTERDITS).not.toContain('/');
  });
});

describe('l’origine canonique refuse ce qui ne peut pas être public', () => {
  // MESURÉ EN PRODUCTION LE 03/10/2026. `APP_URL` valait encore
  // `http://localhost:3000`, et la première version du module la prenait telle
  // quelle : le sitemap servi sur le domaine listait cinq URL localhost, chaque
  // page portait une canonique vers localhost, et l'`og:image` était
  // inatteignable. Rien n'échouait — le sitemap était valide, juste inutile.
  it('ignore un APP_URL resté sur localhost en production', () => {
    const resolu = resoudreOrigineCanonique({ APP_URL: 'http://localhost:3000' }, true);
    expect(resolu).not.toContain('localhost');
    expect(resolu).toBe('https://www.coeurfidele.net');
  });

  it('ignore aussi 127.0.0.1 et un NEXT_PUBLIC_APP_URL local', () => {
    for (const valeur of ['http://127.0.0.1:3000', 'http://localhost', 'http://[::1]:3000']) {
      expect(resoudreOrigineCanonique({ NEXT_PUBLIC_APP_URL: valeur }, true), valeur).toBe(
        'https://www.coeurfidele.net',
      );
    }
  });

  it('accepte une origine publique correctement réglée', () => {
    expect(resoudreOrigineCanonique({ APP_URL: 'https://coeurfidele.net' }, true)).toBe(
      'https://coeurfidele.net',
    );
  });

  it('retire la barre finale, qui dédoublerait chaque URL du sitemap', () => {
    expect(resoudreOrigineCanonique({ APP_URL: 'https://coeurfidele.net/' }, true)).toBe(
      'https://coeurfidele.net',
    );
  });

  it('se rabat sur l’hôte de production fourni par Vercel, sans schéma', () => {
    expect(
      resoudreOrigineCanonique({ VERCEL_PROJECT_PRODUCTION_URL: 'coeurfidele.vercel.app' }, true),
    ).toBe('https://coeurfidele.vercel.app');
  });

  // Le changement d'hébergement du 03/10/2026. `VERCEL_PROJECT_PRODUCTION_URL`
  // n'existe pas chez Netlify : sans cette branche, un build dont `APP_URL`
  // était absente retombait sur le domaine écrit en dur — correct par chance
  // aujourd'hui, faux le jour où le domaine change.
  it('se rabat sur l’URL que Netlify annonce, schéma compris', () => {
    expect(resoudreOrigineCanonique({ URL: 'https://coeurfidele.netlify.app' }, true)).toBe(
      'https://coeurfidele.netlify.app',
    );
  });

  it('laisse APP_URL l’emporter sur ce que l’hébergeur annonce', () => {
    expect(
      resoudreOrigineCanonique(
        { APP_URL: 'https://www.coeurfidele.net', URL: 'https://coeurfidele.netlify.app' },
        true,
      ),
    ).toBe('https://www.coeurfidele.net');
  });

  it('refuse une URL d’hébergeur locale et garde le domaine de repli', () => {
    expect(resoudreOrigineCanonique({ URL: 'http://localhost:8888' }, true)).toBe(
      'https://www.coeurfidele.net',
    );
  });

  it('laisse localhost passer HORS production, sinon le dev n’a plus d’URL', () => {
    expect(resoudreOrigineCanonique({ APP_URL: 'http://localhost:3000' }, false)).toBe(
      'http://localhost:3000',
    );
  });

  it('ne rend jamais une chaîne vide, même sans aucune variable', () => {
    expect(resoudreOrigineCanonique({}, true)).toBe('https://www.coeurfidele.net');
    expect(resoudreOrigineCanonique({ APP_URL: '   ' }, true)).toBe('https://www.coeurfidele.net');
    expect(resoudreOrigineCanonique({ APP_URL: 'pas-une-url' }, true)).toBe(
      'https://www.coeurfidele.net',
    );
  });
});

describe('les URL absolues', () => {
  it('partent d’une origine en https, sans barre finale', () => {
    expect(ORIGINE_CANONIQUE).toMatch(/^https?:\/\//);
    expect(ORIGINE_CANONIQUE).not.toMatch(/\/$/);
  });

  it('construit des URL absolues valides', () => {
    expect(urlAbsolue('/')).toBe(`${ORIGINE_CANONIQUE}/`);
    expect(urlAbsolue('/tarifs')).toBe(`${ORIGINE_CANONIQUE}/tarifs`);
    for (const page of PAGES_INDEXABLES) {
      expect(() => new URL(urlAbsolue(page.chemin)), page.chemin).not.toThrow();
    }
  });
});

describe('les métadonnées dérivent du registre', () => {
  it('chaque page indexable a un titre et une description', () => {
    for (const page of PAGES_INDEXABLES) {
      expect(page.titre, page.chemin).toBeTruthy();
      expect(page.description, page.chemin).toBeTruthy();
      // Une description utile pour un extrait de recherche fait entre 70 et
      // 200 signes ; en deçà elle n'informe pas, au-delà elle est tronquée.
      expect(page.description!.length, page.chemin).toBeGreaterThan(70);
      expect(page.description!.length, page.chemin).toBeLessThan(230);
    }
  });

  it('pose une canonique sur chaque page publique', () => {
    for (const page of PAGES_INDEXABLES) {
      expect(metadataDePage(page.chemin).alternates.canonical, page.chemin).toBe(page.chemin);
    }
  });

  it('refuse bruyamment un chemin inconnu', () => {
    // Silencieux, cela servirait une canonique vide en production.
    expect(() => metadataDePage('/inexistant')).toThrow(/n'est pas déclaré/);
  });
});

describe('les fichiers que Next sert par convention existent', () => {
  const attendus = [
    'icon.svg',
    'apple-icon.png',
    'opengraph-image.png',
    'opengraph-image.alt.txt',
    'twitter-image.png',
    'sitemap.ts',
    'robots.ts',
    'manifest.ts',
  ];

  for (const nom of attendus) {
    it(`src/app/${nom}`, () => {
      expect(existsSync(resolve(APP, nom)), `${nom} manquant`).toBe(true);
    });
  }

  it('le layout racine pose metadataBase, sans quoi Open Graph est relatif', () => {
    // Le défaut précis : sans `metadataBase`, Next rend les URL d'image en
    // relatif et aucun réseau social ne sait où les chercher — la carte de
    // partage apparaît nue, et rien n'échoue.
    const layout = readFileSync(resolve(APP, 'layout.tsx'), 'utf8');
    expect(layout).toContain('metadataBase');
    expect(layout).toContain('ORIGINE_CANONIQUE');
  });
});
