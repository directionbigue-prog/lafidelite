// scripts/grant-pack.ts
//
// Accorde un pack à un compte, sans passer par un paiement.
//
// Pourquoi. Les moyens de paiement ne sont pas encore intégrés : sans ce
// script, rien dans le produit ne peut créer un `Entitlement`, et tout ce
// que les paliers décident — thèmes ouverts, Salon, parties illimitées —
// serait intestable autrement qu'en écrivant du SQL à la main.
//
// Ce n'est PAS un contournement laissé dans le produit : la route de
// création de partie ne l'appelle jamais, et il ne tourne pas en
// production. Le jour où le tunnel de paiement existe, c'est le webhook
// Bictorys qui créera la ligne, dans la transaction `Serializable` qui
// passe la commande à PAID — au même endroit, avec le même `expiresAt`.
//
// Usage : pnpm abonner <email> [ESSENTIEL|INTEGRAL|ANNUEL]
//         pnpm abonner <email> --retirer     (révoque les droits en cours)
//
// Le script s'appelle `abonner` et non `pack` : `pnpm pack` est une
// commande NATIVE de pnpm — elle fabrique un tarball. Un script du projet
// portant ce nom n'est pas seulement ignoré, il est silencieusement
// remplacé : le premier essai a produit `izikit-0.0.1.tgz` à la racine et
// un code de sortie 0, sans le moindre message.
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { PACKS_PAYANTS, packParId, finDuDroit } from '../src/lib/game/packs';

function refuseEnProduction(): boolean {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refus : ce script accorde un acces payant sans paiement.');
    return true;
  }
  return false;
}

const NOMS_PAYANTS = PACKS_PAYANTS.map((p) => p.id).join('|');

export async function main(argv: string[], deps: { prisma: PrismaClient }): Promise<number> {
  const email = argv[0]?.trim().toLowerCase();
  const second = argv[1]?.trim();
  const retirer = argv.includes('--retirer');

  if (!email) {
    console.error(`Usage : pnpm abonner <email> [${NOMS_PAYANTS}]`);
    console.error('        pnpm abonner <email> --retirer');
    return 1;
  }

  const user = await deps.prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    console.error(`Aucun compte pour ${email}.`);
    return 1;
  }

  if (retirer) {
    // Statut CANCELLED plutôt que suppression : un droit retiré reste
    // lisible en base, ce qui compte le jour où quelqu'un demande pourquoi
    // son acces a disparu. `packEffectif` ne retient que les ACTIVE.
    const { count } = await deps.prisma.entitlement.updateMany({
      where: { userId: user.id, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    console.log(`\n  ${count} droit(s) revoque(s) pour ${email}.\n`);
    return 0;
  }

  const packId = (second && !second.startsWith('--') ? second : 'INTEGRAL').toUpperCase();
  const pack = packParId(packId);
  if (!pack || pack.prix === 0) {
    console.error(`Pack inconnu : ${packId}. Attendu : ${NOMS_PAYANTS}.`);
    return 1;
  }

  const debut = new Date();
  const droit = await deps.prisma.entitlement.create({
    data: {
      userId: user.id,
      packId: pack.id,
      expiresAt: finDuDroit(pack, debut),
      note: 'accorde par scripts/grant-pack.ts (developpement)',
    },
    select: { id: true, expiresAt: true },
  });

  console.log('');
  console.log(`  pack     ${pack.nom} (${pack.id})`);
  console.log(`  pour     ${email}`);
  console.log(`  themes   ${pack.themes.length}`);
  console.log(`  salon    ${pack.salon ? 'inclus' : 'non inclus'}`);
  console.log(`  jusqu au ${droit.expiresAt.toISOString().slice(0, 10)}`);
  console.log('');
  return 0;
}

// Garde d'entree CLI — pathToFileURL, jamais un gabarit `file://` (sous
// Windows les deux formes ne sont jamais egales ; voir smoke-auth.ts).
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
