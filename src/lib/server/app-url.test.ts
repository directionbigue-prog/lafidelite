// Tests de resoudreOrigine — la décision qui fabrique les liens d'invitation.
//
// Le cas qui donne son nom à ce fichier est « APP_URL locale en production » :
// c'est l'état réel du site le 02/10/2026, et il rendait l'appariement
// impossible sans qu'aucun journal ne le dise.
import { describe, it, expect } from 'vitest';
import {
  resoudreOrigine,
  origineDepuis,
  ORIGINE_DEV,
  callbackGoogleDepuis,
  urlPubliqueCredible,
} from './app-url';

describe('resoudreOrigine — APP_URL explicite', () => {
  it('respecte une APP_URL absolue', () => {
    expect(resoudreOrigine({ appUrl: 'https://www.coeurfidele.net' })).toBe(
      'https://www.coeurfidele.net',
    );
  });

  it('retire le slash final, pour que `${origine}/invite` ne double pas le slash', () => {
    expect(resoudreOrigine({ appUrl: 'https://exemple.test/' })).toBe('https://exemple.test');
  });

  it('ignore le chemin : seule l’origine compte', () => {
    expect(resoudreOrigine({ appUrl: 'https://exemple.test/sous/dossier' })).toBe(
      'https://exemple.test',
    );
  });

  it('accepte APP_URL locale HORS production', () => {
    expect(resoudreOrigine({ appUrl: 'http://localhost:3000', enProduction: false })).toBe(
      'http://localhost:3000',
    );
  });

  // Le défaut constaté en production.
  it('REFUSE APP_URL locale EN production et se rabat sur l’hôte de la requête', () => {
    expect(
      resoudreOrigine({
        appUrl: 'http://localhost:3000',
        enProduction: true,
        forwardedHost: 'www.coeurfidele.net',
        forwardedProto: 'https',
      }),
    ).toBe('https://www.coeurfidele.net');
  });

  it('refuse aussi 127.0.0.1 et [::1] en production', () => {
    for (const local of ['http://127.0.0.1:3000', 'http://[::1]:3000', 'http://0.0.0.0:3000']) {
      expect(
        resoudreOrigine({ appUrl: local, enProduction: true, host: 'exemple.test' }),
        local,
      ).toBe('https://exemple.test');
    }
  });

  it('ignore une APP_URL vide, blanche ou illisible', () => {
    for (const mauvaise of ['', '   ', 'pas-une-url', '//exemple.test', 'exemple.test']) {
      expect(resoudreOrigine({ appUrl: mauvaise, host: 'exemple.test' }), mauvaise).toBe(
        'https://exemple.test',
      );
    }
  });

  it('refuse un schéma non http(s) — javascript: ou data: ne doivent jamais passer', () => {
    for (const mauvaise of ['javascript:alert(1)', 'data:text/html,x', 'ftp://exemple.test']) {
      expect(resoudreOrigine({ appUrl: mauvaise, host: 'exemple.test' }), mauvaise).toBe(
        'https://exemple.test',
      );
    }
  });
});

describe('resoudreOrigine — l’hôte de la requête', () => {
  it('préfère x-forwarded-host à host, car c’est le proxy qui le pose', () => {
    expect(resoudreOrigine({ forwardedHost: 'public.test', host: 'interne.local' })).toBe(
      'https://public.test',
    );
  });

  it('ne garde que la première valeur d’une liste d’en-têtes', () => {
    expect(
      resoudreOrigine({
        forwardedHost: 'public.test, proxy-interne.local',
        forwardedProto: 'https, http',
      }),
    ).toBe('https://public.test');
  });

  it('déduit http pour un hôte local quand le proto est absent', () => {
    // Déduire https partout donnerait https://localhost:3000, qui ne répond pas.
    expect(resoudreOrigine({ host: 'localhost:3000' })).toBe('http://localhost:3000');
  });

  it('déduit https pour un hôte non local quand le proto est absent', () => {
    expect(resoudreOrigine({ host: 'exemple.test' })).toBe('https://exemple.test');
  });

  it('respecte x-forwarded-proto quand il est là', () => {
    expect(resoudreOrigine({ host: 'exemple.test', forwardedProto: 'http' })).toBe(
      'http://exemple.test',
    );
  });
});

describe('resoudreOrigine — sans requête (cron, outbox)', () => {
  it('utilise l’URL annoncée par l’hébergeur, sans schéma (forme Vercel)', () => {
    expect(resoudreOrigine({ urlProductionHote: 'coeurfidele.net' })).toBe(
      'https://coeurfidele.net',
    );
  });

  // Ce n'est plus une tolérance mais le cas courant : `URL`, que Netlify pose,
  // porte le schéma. Sans cette branche on produirait « https://https://… ».
  it('accepte la forme Netlify, avec le schéma, sans le doubler', () => {
    expect(resoudreOrigine({ urlProductionHote: 'https://coeurfidele.net' })).toBe(
      'https://coeurfidele.net',
    );
  });

  it('passe derrière l’hôte de la requête quand les deux sont là', () => {
    // L'utilisateur doit recevoir un lien sur le domaine qu'il utilise.
    expect(
      resoudreOrigine({
        urlProductionHote: 'coeurfidele.net',
        forwardedHost: 'www.coeurfidele.net',
      }),
    ).toBe('https://www.coeurfidele.net');
  });

  it('retombe sur le développement quand il n’y a rien du tout', () => {
    expect(resoudreOrigine({})).toBe(ORIGINE_DEV);
    expect(resoudreOrigine()).toBe(ORIGINE_DEV);
  });
});

describe('origineDepuis — la forme que les routes appellent', () => {
  it('lit les en-têtes d’une vraie instance Headers', () => {
    const h = new Headers({
      'x-forwarded-host': 'www.coeurfidele.net',
      'x-forwarded-proto': 'https',
    });
    // APP_URL du processus de test vaut ce que vitest.setup.ts a posé ; on
    // vérifie seulement qu'une origine absolue et plausible sort.
    expect(origineDepuis(h)).toMatch(/^https?:\/\/[^/]+$/);
  });

  it('ne termine jamais par un slash, quelle que soit l’entrée', () => {
    const h = new Headers({ host: 'exemple.test' });
    expect(origineDepuis(h).endsWith('/')).toBe(false);
  });
});

describe('callbackGoogleDepuis — l’invariant le plus subtil', () => {
  // Google compare l'URI de l'échange du code à celle de l'autorisation. Si
  // `start` et `callback` n'envoient pas EXACTEMENT la même chaîne, l'échange
  // échoue — après que l'utilisateur a donné son consentement, donc au pire
  // moment possible. Les deux routes appellent cette fonction avec les en-têtes
  // de leur propre requête ; comme elles arrivent sur le même hôte, elles
  // doivent produire la même valeur.
  it('produit la même chaîne pour deux requêtes sur le même hôte', () => {
    const depuisStart = new Headers({
      'x-forwarded-host': 'www.coeurfidele.net',
      'x-forwarded-proto': 'https',
    });
    const depuisCallback = new Headers({
      'x-forwarded-host': 'www.coeurfidele.net',
      'x-forwarded-proto': 'https',
      // Le callback porte en plus les paramètres de Google ; ils ne doivent
      // rien changer à l'URI déduite.
      referer: 'https://accounts.google.com/',
    });
    expect(callbackGoogleDepuis(depuisStart)).toBe(callbackGoogleDepuis(depuisCallback));
  });

  it('ne produit jamais de double slash avant le chemin', () => {
    const h = new Headers({ 'x-forwarded-host': 'exemple.test' });
    expect(callbackGoogleDepuis(h)).toBe('https://exemple.test/api/auth/oauth/google/callback');
  });
});

describe('urlPubliqueCredible — rendue verbatim', () => {
  it('ne normalise pas : une URI OAuth doit correspondre au caractère près', () => {
    // `new URL('https://x.test').toString()` ajoute un slash final. Si on
    // renvoyait la forme normalisée, la chaîne enregistrée chez Google et
    // celle envoyée différeraient d'un caractère — redirect_uri_mismatch.
    expect(urlPubliqueCredible('https://x.test', false)).toBe('https://x.test');
    expect(urlPubliqueCredible('https://x.test/api/cb', true)).toBe('https://x.test/api/cb');
  });

  it('refuse localhost en production et l’accepte ailleurs', () => {
    const locale = 'http://localhost:3000/api/auth/oauth/google/callback';
    expect(urlPubliqueCredible(locale, true)).toBeNull();
    expect(urlPubliqueCredible(locale, false)).toBe(locale);
  });
});
