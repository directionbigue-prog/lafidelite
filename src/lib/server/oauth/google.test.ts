// TEST-02 — companion unit test for `oauth/google.ts` (PROTECTED lib).
//
// Asserts:
//   1. tryCreateGoogleProvider() returns undefined when any GOOGLE_* env var
//      is missing (route-level OAuth handlers 404 silently in this state).
//   2. tryCreateGoogleProvider() returns a provider handle when all three
//      GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI are set.
//   3. decodeIdToken extracts email / email_verified / sub from a
//      well-formed JWT-shaped token.
//   4. decodeIdToken throws on malformed tokens (wrong segment count).
//
// NOTE: the email_verified !== true refusal lives in the OAuth callback route
// handler (not in this lib). This file confirms decodeIdToken returns the
// `email_verified` flag faithfully so the route can branch on it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tryCreateGoogleProvider, decodeIdToken } from './google';

const ORIG = {
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: process.env.GOOGLE_REDIRECT_URI,
};

beforeEach(() => {
  // Silence the logger.warn the lib emits in the inert path so test output
  // stays readable.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env.GOOGLE_CLIENT_ID = ORIG.id;
  process.env.GOOGLE_CLIENT_SECRET = ORIG.secret;
  process.env.GOOGLE_REDIRECT_URI = ORIG.redirect;
  vi.restoreAllMocks();
});

describe('tryCreateGoogleProvider (TEST-02)', () => {
  it('returns undefined when GOOGLE_CLIENT_ID is missing', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REDIRECT_URI = 'https://example.com/cb';
    expect(tryCreateGoogleProvider()).toBeUndefined();
  });

  it('returns undefined when GOOGLE_CLIENT_SECRET is missing', () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_REDIRECT_URI = 'https://example.com/cb';
    expect(tryCreateGoogleProvider()).toBeUndefined();
  });

  it('returns undefined when GOOGLE_REDIRECT_URI is missing', () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    delete process.env.GOOGLE_REDIRECT_URI;
    expect(tryCreateGoogleProvider()).toBeUndefined();
  });

  it('returns a handle with `client`, `scopes`, and `redirectUri` when all envs set', () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'https://app.example.com/api/auth/oauth/google/callback';

    const handle = tryCreateGoogleProvider();

    expect(handle).toBeDefined();
    expect(handle?.redirectUri).toBe('https://app.example.com/api/auth/oauth/google/callback');
    expect(handle?.scopes).toEqual(['openid', 'email', 'profile']);
    expect(handle?.client).toBeDefined();
  });
});

describe('decodeIdToken (TEST-02)', () => {
  function buildIdToken(payload: Record<string, unknown>): string {
    // Build a JWT-shaped string: header.payload.signature. The header + sig
    // are unverified bytes — arctic verifies the real signature against
    // Google's JWKS upstream of this call.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.dummysig`;
  }

  it('extracts email / email_verified / sub from a well-formed token', () => {
    const token = buildIdToken({
      sub: '1234567890',
      email: 'alice@example.com',
      email_verified: true,
      name: 'Alice',
    });

    const claims = decodeIdToken(token);

    expect(claims.sub).toBe('1234567890');
    expect(claims.email).toBe('alice@example.com');
    expect(claims.email_verified).toBe(true);
    expect(claims.name).toBe('Alice');
  });

  it('returns email_verified=false faithfully (so the callback can refuse)', () => {
    const token = buildIdToken({
      sub: 'unverified_sub',
      email: 'attacker@example.com',
      email_verified: false,
    });

    const claims = decodeIdToken(token);

    expect(claims.email_verified).toBe(false);
    // The callback route is responsible for the actual refusal — this lib
    // just decodes faithfully.
  });

  it('throws on malformed tokens (wrong segment count)', () => {
    expect(() => decodeIdToken('not.a-jwt')).toThrow(/Malformed ID token/);
    expect(() => decodeIdToken('only-one-segment')).toThrow(/Malformed ID token/);
    expect(() => decodeIdToken('a.b.c.d')).toThrow(/Malformed ID token/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Le repli d'URI de redirection, ajouté le 02/10/2026.
//
// Panne mesurée sur le site en ligne : `GOOGLE_REDIRECT_URI` valait
// `http://localhost:3000/api/auth/oauth/google/callback` en production, donc
// « Se connecter avec Google » renvoyait les utilisateurs vers leur propre
// machine. La variable ÉTAIT renseignée — une validation de présence n'avait
// donc rien à attraper, et le déploiement était vert.
//
// NODE_ENV n'est pas réassignable via Object.defineProperty sur process.env
// (« only accepts a configurable, writable, and enumerable data descriptor »).
// vi.stubEnv est l'outil prévu pour ça, et vi.unstubAllEnvs restaure tout.
// ───────────────────────────────────────────────────────────────────────
describe('tryCreateGoogleProvider — repli quand GOOGLE_REDIRECT_URI est invraisemblable', () => {
  const poserEnv = (v: string) => vi.stubEnv('NODE_ENV', v);

  afterEach(() => vi.unstubAllEnvs());

  const SECOURS = 'https://www.coeurfidele.net/api/auth/oauth/google/callback';

  function poserClefs() {
    process.env.GOOGLE_CLIENT_ID = 'id-de-test';
    process.env.GOOGLE_CLIENT_SECRET = 'secret-de-test';
  }

  it('remplace une URI localhost EN production par celle déduite de la requête', () => {
    poserClefs();
    poserEnv('production');
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/oauth/google/callback';
    expect(tryCreateGoogleProvider(SECOURS)?.redirectUri).toBe(SECOURS);
  });

  it('garde une URI localhost HORS production — le développement doit continuer à marcher', () => {
    poserClefs();
    poserEnv('development');
    const locale = 'http://localhost:3000/api/auth/oauth/google/callback';
    process.env.GOOGLE_REDIRECT_URI = locale;
    expect(tryCreateGoogleProvider(SECOURS)?.redirectUri).toBe(locale);
  });

  it('respecte une URI de production crédible : la configuration explicite gagne', () => {
    poserClefs();
    poserEnv('production');
    const configuree = 'https://autre-domaine.test/api/auth/oauth/google/callback';
    process.env.GOOGLE_REDIRECT_URI = configuree;
    expect(tryCreateGoogleProvider(SECOURS)?.redirectUri).toBe(configuree);
  });

  it('reste inerte quand GOOGLE_REDIRECT_URI est absente, MÊME avec un repli', () => {
    // Le repli corrige une URI invraisemblable ; il ne crée pas un fournisseur
    // là où il n'y en avait pas. Contrat de CLAUDE.md inchangé.
    poserClefs();
    poserEnv('production');
    delete process.env.GOOGLE_REDIRECT_URI;
    expect(tryCreateGoogleProvider(SECOURS)).toBeUndefined();
  });

  it('sans repli, retombe sur la valeur configurée telle quelle', () => {
    poserClefs();
    poserEnv('production');
    const locale = 'http://localhost:3000/api/auth/oauth/google/callback';
    process.env.GOOGLE_REDIRECT_URI = locale;
    expect(tryCreateGoogleProvider()?.redirectUri).toBe(locale);
  });
});
