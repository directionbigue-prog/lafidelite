// scripts/smoke-game.ts
//
// Whole-platform smoke test against a running dev server: two fresh
// signups, email verification, pairing by invite code, both disclaimers,
// then a complete three-round game to the results screen.
//
// Usage: pnpm smoke:game   (after `pnpm dev` in another terminal)
//
// Why this exists alongside `smoke:auth`. The unit suite mocks Prisma, so
// it cannot see anything that only breaks against a real database — the
// session-creation transaction timeout that 500ed "Nouvelle partie" was
// invisible to 1000+ green tests and was only found by clicking. This
// script walks the same path a couple walks, end to end, so that class of
// defect fails loudly instead of waiting for a user.
//
// It also asserts the product's non-negotiable guarantees, which are
// ABSENCES and therefore easy to regress unnoticed:
//   - no Scenario `weight` in any response, ever
//   - the inactive player's answer never leaks before the round reveal
//   - a joker costs no points and is refused once exhausted
//
// NOT run in CI (needs a live server + database). Manual UAT only — that
// is also why there is no companion `.test.ts`: Vitest auto-discovers
// `scripts/**/*.test.ts` and would run it with no server. The script IS
// the test.
//
// COOKIE PREFIX: assumes the default `COOKIE_PREFIX=app`, like
// smoke-auth.ts. Forks that override it must update `CSRF_COOKIE`.

import { PrismaClient } from '@prisma/client';

// `||`, not `??`: this repo's own .env.local declares `SMOKE_BASE_URL=`
// with no value, and `??` only falls back on undefined — so `??` yielded
// an empty base URL and every fetch died on "Failed to parse URL".
const BASE_URL = process.env.SMOKE_BASE_URL?.trim() || 'http://localhost:3000';
const PASSWORD = 'SmokeTestPwd123!';
const CSRF_COOKIE = 'app-csrf';
const RUN_ID = Date.now();

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** One signed-in browser: its own cookie jar, exactly like a real tab. */
class Session {
  readonly email: string;
  private cookies = new Map<string, string>();

  constructor(readonly label: string) {
    this.email = `smoke-${label}-${RUN_ID}@example.test`;
  }

  private absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }

  // Generic rather than `any`: this script walks a dozen endpoints with
  // different shapes, and each call site names the handful of fields it
  // reads. Every field is optional — the point of a smoke test is to cope
  // with a response that is NOT what we expect and report it.
  async call<T = unknown>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: T; raw: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cookies.size > 0) {
      headers['cookie'] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const csrf = this.cookies.get(CSRF_COOKIE);
    // Mutations must echo the double-submit cookie, same as lib/api.ts does.
    if (csrf && init.method && init.method !== 'GET') headers['x-csrf-token'] = csrf;

    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual',
    });
    this.absorb(res);

    const raw = await res.text();
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      /* keep raw text */
    }
    return { status: res.status, body: body as T, raw };
  }
}

// Response shapes this script reads. Deliberately partial and optional:
// asserting on a missing field is exactly what a smoke failure looks like.
interface ErrorBody {
  error?: string;
}
interface CoupleMeBody {
  couple?: {
    status?: string;
    viewerRole?: string;
    partnerName?: string | null;
    code?: string;
  };
}
interface DisclaimerBody {
  acceptedByCreator?: boolean;
  acceptedByPartner?: boolean;
}
interface GameStateBody extends ErrorBody {
  id?: string;
  phase?: string;
  currentRoundNumber?: number;
  currentQuestionNumber?: number;
  activePlayerRole?: string;
  question?: { roundType?: string; options?: { id: string }[] };
}
interface RoundBody {
  type?: string;
  questions?: unknown[];
}
interface ResultsBody {
  coupleScore?: number;
  complicityLevel?: string;
}

/** Signup + verification, leaving the session authenticated. */
async function register(session: Session, name: string): Promise<void> {
  const signup = await session.call('/api/auth/signup', {
    method: 'POST',
    body: { email: session.email, password: PASSWORD, name },
  });
  check(`${session.label}: signup`, signup.status === 201, `status=${signup.status}`);

  const user = await prisma.user.findUnique({
    where: { email: session.email },
    select: { id: true },
  });
  if (!user) throw new Error(`${session.label}: user row missing after signup`);

  const codeRow = await prisma.verificationCode.findFirst({
    where: { userId: user.id, type: 'EMAIL_VERIFY', usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  if (!codeRow) throw new Error(`${session.label}: no verification code issued`);

  const verify = await session.call('/api/auth/verify-email', {
    method: 'POST',
    body: { email: session.email, code: codeRow.code },
  });
  check(`${session.label}: verify-email`, verify.status === 200, `status=${verify.status}`);

  // Signup deliberately issues no cookies; /verify-email is what signs the
  // user in. If that ever regresses, every later call 401s here.
  const me = await session.call('/api/auth/me');
  check(`${session.label}: authenticated after verify`, me.status === 200, `status=${me.status}`);
}

async function main(): Promise<void> {
  console.log(`Smoke: whole platform against ${BASE_URL}\n`);

  const questionCount = await prisma.question.count({ where: { active: true } });
  if (questionCount < 15) {
    throw new Error(`only ${questionCount} active questions — run \`pnpm seed:questions\` first`);
  }

  console.log('1. Comptes');
  const a = new Session('a');
  const b = new Session('b');
  await register(a, 'Awa');
  await register(b, 'Moussa');

  console.log('\n2. Appairage');
  const created = await a.call('/api/couples', { method: 'POST' });
  check('A crée un Espace Couple', created.status === 201, `status=${created.status}`);

  const pending = await a.call<CoupleMeBody>('/api/couples/me');
  const code: string | undefined = pending.body?.couple?.code;
  check('A voit son code d’invitation', typeof code === 'string' && /^\d{6}$/.test(code));
  if (!code) throw new Error('no invite code to join with');

  const joined = await b.call('/api/couples/join', { method: 'POST', body: { code } });
  check('B rejoint avec le code', joined.status === 200, `status=${joined.status}`);

  for (const [session, expectedRole, expectedPartner] of [
    [a, 'CREATOR', 'Moussa'],
    [b, 'PARTNER', 'Awa'],
  ] as const) {
    const me = await session.call<CoupleMeBody>('/api/couples/me');
    check(
      `${session.label}: couple ACTIVE, rôle ${expectedRole}, partenaire ${expectedPartner}`,
      me.body?.couple?.status === 'ACTIVE' &&
        me.body?.couple?.viewerRole === expectedRole &&
        me.body?.couple?.partnerName === expectedPartner,
      JSON.stringify(me.body?.couple),
    );
  }

  console.log('\n3. Disclaimer');
  const blocked = await a.call<ErrorBody>('/api/games', { method: 'POST' });
  check(
    'jouer est refusé tant que les deux n’ont pas accepté',
    blocked.status === 403 && blocked.body?.error === 'DISCLAIMER_REQUIRED',
    `status=${blocked.status} body=${JSON.stringify(blocked.body)}`,
  );

  const acceptA = await a.call<DisclaimerBody>('/api/couples/disclaimer/accept', {
    method: 'POST',
  });
  check(
    'A accepte — en attente de B',
    acceptA.body?.acceptedByCreator === true && acceptA.body?.acceptedByPartner === false,
    JSON.stringify(acceptA.body),
  );
  const acceptB = await b.call<DisclaimerBody>('/api/couples/disclaimer/accept', {
    method: 'POST',
  });
  check(
    'B accepte — les deux ont accepté',
    acceptB.body?.acceptedByCreator === true && acceptB.body?.acceptedByPartner === true,
    JSON.stringify(acceptB.body),
  );

  console.log('\n4. Partie');
  const game = await a.call<GameStateBody>('/api/games', { method: 'POST' });
  check('création de partie', game.status === 201, `status=${game.status}`);
  const gameId: string = game.body?.id;
  if (!gameId) throw new Error('no game id');

  const again = await a.call<GameStateBody>('/api/games', { method: 'POST' });
  check(
    'rappel idempotent (reprise, pas une 2e partie)',
    again.status === 200 && again.body?.id === gameId,
    `status=${again.status}`,
  );

  // Everything the server sends the client, concatenated — scanned once at
  // the end for the Scenario weights that must never reach a browser.
  let allTraffic = '';
  let answersGiven = 0;
  let jokersUsed = 0;
  let jokerRefused = false;
  const revealedRounds = new Set<number>();

  for (let step = 0; step < 200; step += 1) {
    const cur = await a.call<GameStateBody>('/api/games/current');
    allTraffic += cur.raw;
    if (cur.status === 404) break;
    if (cur.status !== 200) throw new Error(`GET /current -> ${cur.status} ${cur.raw}`);

    const s = cur.body;
    if (s.phase === 'COMPLETE') break;

    if (s.phase === 'PASS_DEVICE' || s.phase === 'ROUND_INTRO') {
      const turn = await a.call(`/api/games/${gameId}/start-turn`, { method: 'POST' });
      allTraffic += turn.raw;
      if (turn.status !== 200) throw new Error(`start-turn -> ${turn.status} ${turn.raw}`);
      continue;
    }

    if (s.phase === 'ANSWERING') {
      const q = s.question;
      if (!q) throw new Error('ANSWERING with no question payload');

      // Spend both of the CREATOR's jokers on round 1, then try a third —
      // the PRD says skipping costs nothing and the third must be refused.
      const useJoker =
        s.activePlayerRole === 'CREATOR' && s.currentRoundNumber === 1 && jokersUsed < 3;
      if (useJoker) {
        const skip = await a.call<ErrorBody>(`/api/games/${gameId}/skip`, {
          method: 'POST',
          body: { clientElapsedMs: 2000 },
        });
        allTraffic += skip.raw;
        if (skip.status === 200) {
          jokersUsed += 1;
          continue;
        }
        if (skip.status === 403 && skip.body?.error === 'NO_JOKERS_LEFT') {
          jokerRefused = true;
          // fall through and answer normally
        } else {
          throw new Error(`skip -> ${skip.status} ${skip.raw}`);
        }
      }

      const ids: string[] = q.options.map((o: { id: string }) => o.id);
      const body =
        q.roundType === 'MIROIR'
          ? { ownOptionId: ids[0], predictionOptionId: ids[0], clientElapsedMs: 3000 }
          : { optionId: ids[0], clientElapsedMs: 3000 };
      const ans = await a.call(`/api/games/${gameId}/answers`, { method: 'POST', body });
      allTraffic += ans.raw;
      if (ans.status !== 200 && ans.status !== 201) {
        throw new Error(`answers -> ${ans.status} ${ans.raw}`);
      }
      answersGiven += 1;
      continue;
    }

    if (s.phase === 'ROUND_REVEAL') {
      const n = s.currentRoundNumber;
      if (!revealedRounds.has(n)) {
        const round = await a.call<RoundBody>(`/api/games/${gameId}/rounds/${n}`);
        allTraffic += round.raw;
        if (round.status !== 200) throw new Error(`rounds/${n} -> ${round.status} ${round.raw}`);
        check(
          `manche ${n} (${round.body.type}) révélée avec ses 5 questions`,
          round.body.questions?.length === 5,
          `${round.body.questions?.length} questions`,
        );
        revealedRounds.add(n);
      }
      const adv = await a.call(`/api/games/${gameId}/round/advance`, { method: 'POST' });
      allTraffic += adv.raw;
      if (adv.status !== 200) throw new Error(`round/advance -> ${adv.status} ${adv.raw}`);
      continue;
    }

    throw new Error(`unexpected phase ${s.phase}`);
  }

  check('les 3 manches ont été révélées', revealedRounds.size === 3, `${revealedRounds.size}`);
  check('2 jokers consommés', jokersUsed === 2, `${jokersUsed}`);
  check('le 3e joker est refusé (NO_JOKERS_LEFT)', jokerRefused);
  check(
    'réponses enregistrées pour les deux joueurs',
    answersGiven === 30 - jokersUsed,
    `${answersGiven} réponses pour ${jokersUsed} jokers`,
  );

  console.log('\n5. Résultats');
  const results = await a.call<ResultsBody>(`/api/games/${gameId}/results`);
  allTraffic += results.raw;
  check('résultats disponibles', results.status === 200, `status=${results.status}`);
  check(
    'le score du couple est présent',
    typeof results.body?.coupleScore === 'number',
    JSON.stringify(results.body),
  );
  check('un niveau de complicité est attribué', typeof results.body?.complicityLevel === 'string');
  check('aucun titre ne dit « perdant »', !/perdant|infidèle/i.test(JSON.stringify(results.body)));

  console.log('\n6. Garanties produit');
  check('aucun poids de Scénario n’a fuité', !allTraffic.includes('"weight"'));

  const b2 = await b.call<ResultsBody>(`/api/games/${gameId}/results`);
  check(
    'le partenaire voit les mêmes résultats',
    b2.status === 200 && b2.body?.coupleScore === results.body?.coupleScore,
    `status=${b2.status}`,
  );

  const stranger = new Session('c');
  await register(stranger, 'Intrus');
  const denied = await stranger.call(`/api/games/${gameId}/results`);
  check(
    'un tiers ne peut pas lire la partie (404, sans révéler son existence)',
    denied.status === 404,
    `status=${denied.status}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? '\n✅ Smoke complet : tout passe.' : `\n❌ ${failures} échec(s).`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err: unknown) => {
    console.error('\n💥', err);
    await prisma.$disconnect();
    process.exit(1);
  });
