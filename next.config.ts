import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not middleware.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
//
// CSP is intentionally NOT included here. App Router pages need a per-request
// nonce (server-rendered) for inline scripts; ship CSP via middleware.ts when
// the first frontend page lands. For now, the API-only surface doesn't render
// HTML and doesn't need CSP.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Caméra et micro fermés à toute origine. Ils étaient ouverts à `self`
    // pour l'appel vidéo du couple, retiré du produit le 13/10/2026 : un droit
    // qu'aucun écran n'utilise est une surface d'attaque sans contrepartie.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const config: NextConfig = {
  reactStrictMode: true,
  // No `output` setting on purpose. `output: 'standalone'` used to live here to
  // feed a Docker runtime image; Docker support was removed on 2026-05-13 and
  // there has been no Dockerfile in the repo since. Vercel's own builder wants
  // the default output, so the flag was pure vestigial risk on the one target
  // this app actually deploys to. If you ever self-host in a container, put it
  // back together WITH the Dockerfile that justifies it.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel client requests through a Next.js route to bypass ad-blockers
  // that filter direct Sentry calls. Off by default — turn on if your
  // user base has heavy ad-blocker usage.
  // tunnelRoute: '/monitoring',
  //
  // Sentry v10 removed `hideSourceMaps` (silently ignored — next.config.ts is
  // outside tsconfig's `include`, so no type error said so) and deprecated
  // `disableLogger`. Their replacements: delete the browser source maps once
  // uploaded, and tree-shake the SDK's debug logging.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  webpack: { treeshake: { removeDebugLogging: true } },
});
