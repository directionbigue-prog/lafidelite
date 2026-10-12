// Dev seed for the pass-and-play game engine: creates a ready-to-play test
// couple so `/jeu` can be exercised without walking the whole signup +
// pairing + disclaimer flow by hand every time.
//
// Usage:
//   pnpm seed:game-couple                     create/refresh the test couple
//   pnpm seed:game-couple --reset             ... and wipe its game history first
//   pnpm seed:game-couple --email=<adresse>   pair YOUR OWN account instead
//
// `--email=` exists because the fixture couple is made of two throwaway
// accounts, and a real account's entitlements (lib/game/packs.ts) do not
// follow you into it — logging in as couple-a@example.com to test a pack
// you bought on your own address shows you the free tier and nothing else.
// With the flag, the named account becomes the CREATOR and gets a partner
// of its OWN (derived from its address), so the couple resolves to whatever
// pack that account holds. Its own partner, not the fixture one: a person
// belongs to at most one PENDING/ACTIVE couple, and sharing couple-b would
// put them in two.
//
// The flag NEVER writes `passwordHash`. The plain upsert below sets it to
// the published test password, which is correct for a fixture and would be
// a silent account takeover for a real address — your own password would
// stop working and the one that did work would be printed in this file.
// The account must therefore already exist; the script refuses rather than
// creating one.
//
// What it guarantees, because /api/games rejects anything less:
//   - two users with `emailVerifiedAt` set (an unverified user cannot log in)
//   - a Couple in status ACTIVE with BOTH creator and partner set
//     (findActivatedCoupleForUser deliberately refuses a PENDING couple)
//   - both disclaimer timestamps set (else POST /api/games → DISCLAIMER_REQUIRED)
//
// Pass-and-play means ONE authenticated device: log in as the creator and
// play both sides. The partner account exists because the couple must be
// ACTIVE, not because you need to log in as them — though you can, to see
// the same game from the other side's labels (`viewerRole`).
//
// `--reset` deletes the couple's GameSessions (cascading to rounds,
// answers and results), clears QuestionUsage so the anti-repetition pool
// starts fresh, and zeroes cumulativeCoupleScore so the Niveau de
// Complicité is back to "Découverte". Without it the script is a plain
// idempotent upsert and leaves an in-progress game alone — re-running it
// mid-game is safe.
//
// Refuses to run with NODE_ENV=production: these are published credentials.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

// Published in this file on purpose — that is what makes it a test account.
// Anything using these credentials is a local dev database by definition.
const PASSWORD = 'TestCouple123!';

const CREATOR = { email: 'couple-a@example.com', name: 'Awa' } as const;
const PARTNER = { email: 'couple-b@example.com', name: 'Moussa' } as const;

// The pairing flow's own codes are random 6-digit strings with a 7-day TTL
// (lib/server/couples/invite-code.ts). This one is fixed and already
// consumed — the couple is created ACTIVE, so the code is never redeemed.
// A literal keeps the script idempotent: a regenerated code on every run
// would collide with the row's own unique constraint on re-upsert.
const INVITE_CODE = '000042';

interface SeedDeps {
  prisma?: PrismaClient;
}

/**
 * Un code d'invitation à six chiffres, stable pour un identifiant donné.
 *
 * Stable et non aléatoire pour que le script reste idempotent : un code
 * régénéré à chaque exécution entrerait en collision avec sa propre ligne
 * sur le `create` de la fois suivante. Le code n'est jamais échangé — le
 * couple naît ACTIVE — donc seule son unicité compte, pas son imprévisibilité.
 */
function codeInvitationDerive(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 1_000_000;
  return String(h).padStart(6, '0');
}

/** `--email=a@b.c` → `a@b.c`, ou `null` si l'option est absente. */
export function lireOptionEmail(args: readonly string[]): string | null {
  const brut = args.find((a) => a.startsWith('--email='));
  if (brut === undefined) return null;
  const valeur = brut.slice('--email='.length).trim().toLowerCase();
  return valeur === '' ? null : valeur;
}

/**
 * Prend un compte EXISTANT comme créateur du couple.
 *
 * Deux choses volontairement absentes de cet `update` :
 *
 *   · `passwordHash` — voir l'en-tête du fichier. Écraser le mot de passe
 *     d'une vraie adresse par celui, publié, du jeu de test est une prise
 *     de contrôle silencieuse, pas une commodité de développement.
 *   · `name` — le compte a le sien.
 *
 * `emailVerifiedAt` est en revanche posé s'il manque : sans lui la
 * connexion est refusée, et le couple serait inatteignable. C'est
 * exactement ce que la saisie du code de vérification aurait produit.
 */
async function adopterCompteExistant(
  prisma: PrismaClient,
  email: string,
  now: Date,
): Promise<{ id: string; email: string; venaitDEtreVerifie: boolean }> {
  const compte = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerifiedAt: true, status: true },
  });

  if (!compte) {
    console.error(`Aucun compte pour ${email}.`);
    console.error("Inscrivez-vous d'abord sur /inscription, puis relancez cette commande.");
    process.exit(1);
  }

  const aVerifier = compte.emailVerifiedAt === null;
  const aReactiver = compte.status !== 'ACTIVE';

  if (aVerifier || aReactiver) {
    await prisma.user.update({
      where: { id: compte.id },
      data: {
        ...(aVerifier ? { emailVerifiedAt: now } : {}),
        ...(aReactiver ? { status: 'ACTIVE' } : {}),
      },
    });
  }

  return { id: compte.id, email: compte.email, venaitDEtreVerifie: aVerifier };
}

export async function main(args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed a test couple in production.');
    process.exit(1);
  }

  const reset = args.includes('--reset');
  const emailChoisi = lireOptionEmail(args);
  const prisma = deps.prisma ?? new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const now = new Date();

    const adopte = emailChoisi ? await adopterCompteExistant(prisma, emailChoisi, now) : null;

    const creator =
      adopte ??
      (await prisma.user.upsert({
        where: { email: CREATOR.email },
        update: { passwordHash, name: CREATOR.name, emailVerifiedAt: now, status: 'ACTIVE' },
        create: {
          email: CREATOR.email,
          name: CREATOR.name,
          passwordHash,
          emailVerifiedAt: now,
        },
        select: { id: true, email: true },
      }));

    // Un compte adopté reçoit son PROPRE partenaire, dérivé de son adresse.
    // Réutiliser `couple-b@example.com` le mettrait dans deux couples à la
    // fois : la règle « au plus un couple PENDING/ACTIVE par personne » n'est
    // gardée en base que du côté créateur (Couple_creator_active_unique), donc
    // rien n'aurait empêché l'incohérence, et `findActiveCoupleForUser`
    // aurait rendu l'un ou l'autre selon l'ordre des lignes.
    const partenaire = adopte
      ? {
          email: `partenaire-de-${adopte.email.replace(/@.*$/, '').replace(/[^a-z0-9]+/gi, '-')}@example.com`,
          name: 'Partenaire',
        }
      : PARTNER;

    const partner = await prisma.user.upsert({
      where: { email: partenaire.email },
      update: { passwordHash, name: partenaire.name, emailVerifiedAt: now, status: 'ACTIVE' },
      create: {
        email: partenaire.email,
        name: partenaire.name,
        passwordHash,
        emailVerifiedAt: now,
      },
      select: { id: true, email: true },
    });

    // Reuse whatever couple these two are already in rather than creating a
    // second one: a user may belong to at most one PENDING/ACTIVE couple,
    // and a partial unique index enforces one active couple per creator.
    const existing = await prisma.couple.findFirst({
      where: {
        status: { in: ['PENDING', 'ACTIVE'] },
        OR: [{ creatorId: creator.id }, { partnerId: creator.id }],
      },
      select: { id: true },
    });

    const couple = existing
      ? await prisma.couple.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            creatorId: creator.id,
            partnerId: partner.id,
            pairedAt: now,
            dissolvedAt: null,
            disclaimerAcceptedByCreatorAt: now,
            disclaimerAcceptedByPartnerAt: now,
          },
          select: { id: true },
        })
      : await prisma.couple.create({
          data: {
            status: 'ACTIVE',
            creatorId: creator.id,
            partnerId: partner.id,
            // `inviteCode` est unique en base. Le littéral du jeu de test ne
            // peut donc servir qu'une fois : un couple adopté prend un code
            // dérivé de son identifiant, déjà consommé lui aussi puisque le
            // couple naît ACTIVE.
            inviteCode: adopte ? codeInvitationDerive(partner.id) : INVITE_CODE,
            inviteExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            pairedAt: now,
            disclaimerAcceptedByCreatorAt: now,
            disclaimerAcceptedByPartnerAt: now,
          },
          select: { id: true },
        });

    if (reset) {
      // GameSession cascades to GameRound → GameRoundQuestion → Answer and
      // to GameResult, so deleting sessions is enough to erase play history.
      const { count } = await prisma.gameSession.deleteMany({ where: { coupleId: couple.id } });
      await prisma.questionUsage.deleteMany({ where: { coupleId: couple.id } });
      await prisma.couple.update({
        where: { id: couple.id },
        data: { cumulativeCoupleScore: 0 },
      });
      console.log(`✓ reset — ${count} partie(s) supprimée(s), score cumulé remis à 0`);
    }

    const questionCount = await prisma.question.count({ where: { active: true } });

    console.log(`✓ couple ACTIVE ${couple.id} — disclaimer accepté des deux côtés`);
    console.log('');
    console.log('  Connexion (http://localhost:3000/connexion) :');
    if (adopte) {
      // Pas de mot de passe affiché : ce compte a le sien, ce script ne l'a
      // pas touché et ne le connaît pas.
      console.log(`    ${creator.email}   (CREATOR — votre mot de passe habituel)`);
      if (adopte.venaitDEtreVerifie) {
        console.log('      → adresse marquée vérifiée : la connexion était bloquée sans ça');
      }
    } else {
      console.log(`    ${creator.email}   mot de passe : ${PASSWORD}   (${CREATOR.name}, CREATOR)`);
    }
    console.log(
      `    ${partner.email}   mot de passe : ${PASSWORD}   (${partenaire.name}, PARTNER)`,
    );
    console.log('');
    console.log('  Pass-and-play : connecte-toi avec UN seul des deux, puis va sur /jeu.');

    if (questionCount === 0) {
      console.warn(
        '\n⚠ Aucune question active en base — lance `pnpm seed:questions` avant de jouer.',
      );
    }
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
