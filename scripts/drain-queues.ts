// scripts/drain-queues.ts
//
// Vide les deux files à la main, en développement.
//
// Pourquoi ce script existe. Les side-effects du produit (emails de
// vérification, notifications) ne partent jamais depuis la requête qui les
// déclenche : l'inscription écrit un `OutboxEvent` DANS la transaction, et
// deux crons Vercel font le reste — `outbox-drain` transfère l'événement
// vers la file d'emails, `email-queue-drain` l'envoie via Resend. C'est ce
// qui rend l'envoi idempotent et insensible à un échec de Resend.
//
// Mais `vercel.json` n'est lu que par Vercel. En local, PERSONNE n'appelle
// ces routes : les événements s'empilent en PENDING et aucun email ne part.
// Vingt-sept s'étaient ainsi accumulés sur cette machine avant qu'on s'en
// aperçoive — l'inscription répondait 201, la file grossissait en silence.
//
// L'ordre des deux appels compte : sans `outbox-drain` d'abord, il n'y a
// rien à envoyer et `email-queue-drain` répond `processed: 0`.
//
// Usage : pnpm drain   (avec `pnpm dev` dans un autre terminal)
import { pathToFileURL } from 'node:url';

const BASE = process.env.DRAIN_BASE_URL?.trim() || 'http://localhost:3000';

// Les deux routes, dans l'ordre où elles doivent tourner.
const ROUTES = ['/api/cron/outbox-drain', '/api/cron/email-queue-drain'] as const;

interface DrainResult {
  route: string;
  status: number;
  processed: number | null;
  error: string | null;
}

export async function drain(
  baseUrl = BASE,
  secret = process.env.CRON_SECRET ?? '',
): Promise<number> {
  if (!secret) {
    console.error('CRON_SECRET manquant. Les routes de cron le verifient et repondront 401.');
    return 1;
  }

  const results: DrainResult[] = [];

  for (const route of ROUTES) {
    try {
      const res = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      });
      const body: unknown = await res.json().catch(() => null);
      const processed =
        body &&
        typeof body === 'object' &&
        'processed' in body &&
        typeof body.processed === 'number'
          ? body.processed
          : null;
      const error =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : null;
      results.push({ route, status: res.status, processed, error });
    } catch (err) {
      results.push({
        route,
        status: 0,
        processed: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let failed = false;
  for (const r of results) {
    const label = r.route.replace('/api/cron/', '').padEnd(18);
    if (r.status === 200) {
      console.log(`  ${label} ${r.processed ?? 0} traite(s)`);
    } else {
      failed = true;
      const why =
        r.status === 0
          ? `injoignable (${r.error})`
          : `HTTP ${r.status}${r.error ? ' ' + r.error : ''}`;
      console.error(`  ${label} ECHEC — ${why}`);
    }
  }

  if (failed) {
    console.error(`\nServeur attendu sur ${baseUrl}. Lancez \`pnpm dev\` dans un autre terminal.`);
    return 1;
  }

  const total = results.reduce((n, r) => n + (r.processed ?? 0), 0);
  console.log(total === 0 ? '\nRien à envoyer.' : `\n${total} element(s) traite(s).`);
  return 0;
}

// Garde d'entrée CLI. pathToFileURL, et non un gabarit `file://` écrit à la
// main : sous Windows les deux formes ne sont jamais égales et main() ne
// serait jamais appelé — le defaut qui rendait smoke-auth silencieux.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  drain()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
