// scripts/dev-code.ts
//
// Lit le dernier code de vérification d'une adresse, en développement.
//
// Pourquoi. En local, un code de vérification doit traverser toute la
// chaîne d'envoi avant d'être lisible : outbox -> file d'emails -> Resend
// -> boîte de réception. Chaque maillon peut manquer — aucun cron ne tourne
// en local, Upstash peut ne pas être configuré, et un domaine d'expédition
// neuf voit ses messages classés en spam par Gmail. Attendre un email pour
// tester une inscription, c'est faire dépendre son cycle de développement
// du DNS et d'un filtre anti-spam.
//
// Or le code n'a jamais eu besoin de l'email : il est en base dès la fin de
// la transaction d'inscription. C'est d'ailleurs ce que fait déjà
// `smoke-auth.ts`, qui lit `VerificationCode` par Prisma au lieu d'ouvrir
// une boîte mail.
//
// Usage : pnpm code <email> [type]
//         type = EMAIL_VERIFY (défaut) | PASSWORD_RESET
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

// Ce script AFFICHE un secret d'authentification. Il n'a rien à faire
// ailleurs qu'en développement, et refuse de tourner en production plutôt
// que de compter sur la discipline de l'appelant.
function refuseEnProduction(): boolean {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refus : ce script affiche un code de verification et ne doit pas tourner en production.',
    );
    return true;
  }
  return false;
}

export async function main(argv: string[], deps: { prisma: PrismaClient }): Promise<number> {
  const email = argv[0]?.trim().toLowerCase();
  const type = (argv[1]?.trim() || 'EMAIL_VERIFY').toUpperCase();

  if (!email) {
    console.error('Usage : pnpm code <email> [EMAIL_VERIFY|PASSWORD_RESET]');
    return 1;
  }

  const user = await deps.prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });

  if (!user) {
    console.error(`Aucun compte pour ${email}.`);
    return 1;
  }

  const code = await deps.prisma.verificationCode.findFirst({
    where: { userId: user.id, type, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { code: true, expiresAt: true, createdAt: true },
  });

  if (!code) {
    console.error(`Aucun code ${type} en attente pour ${email}.`);
    console.error('Demandez-en un : POST /api/auth/resend-verification { email } — puis relancez.');
    return 1;
  }

  const resteMs = code.expiresAt.getTime() - Date.now();
  const expire = resteMs <= 0;

  console.log('');
  console.log(`  code    ${code.code}`);
  console.log(`  pour    ${email}`);
  console.log(`  type    ${type}`);
  console.log(
    `  valide  ${expire ? 'NON — expire depuis ' + Math.round(-resteMs / 60000) + ' min' : 'encore ' + Math.round(resteMs / 60000) + ' min'}`,
  );
  console.log(`  compte  ${user.emailVerifiedAt ? 'deja verifie' : 'en attente de verification'}`);
  console.log('');

  // Un code expire n'est pas une erreur du script, mais l'appelant ne doit
  // pas le saisir en croyant qu'il marchera.
  return expire ? 1 : 0;
}

// Garde d'entrée CLI — pathToFileURL, jamais un gabarit `file://` (voir
// smoke-auth.ts : sous Windows les deux formes ne sont jamais égales).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (refuseEnProduction()) {
    process.exit(1);
  } else {
    const prisma = new PrismaClient();
    main(process.argv.slice(2), { prisma })
      .then(async (code) => {
        await prisma.$disconnect();
        process.exit(code);
      })
      .catch(async (err: unknown) => {
        console.error(err);
        await prisma.$disconnect();
        process.exit(1);
      });
  }
}
