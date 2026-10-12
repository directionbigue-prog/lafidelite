import { validateQuestionSeeds } from '../src/lib/server/game/question-seed-schema';
import { QUESTIONS_SEED } from '../prisma/seed-data/questions';
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

export async function main(_args: string[], deps: { prisma: PrismaClient }): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-questions must not run against production');
  }
  validateQuestionSeeds(QUESTIONS_SEED);
  for (const q of QUESTIONS_SEED) {
    await deps.prisma.question.upsert({
      where: { slug: q.slug },
      create: { ...q },
      update: {
        roundType: q.roundType,
        category: q.category,
        prompt: q.prompt,
        options: q.options,
      },
    });
  }

  console.log(`Seeded ${QUESTIONS_SEED.length} questions.`);
}

// CLI entrypoint guard — only run when invoked as a script, not when
// imported by tests. Uses pathToFileURL (not a manual `file://` template
// literal) so this matches correctly on Windows, where import.meta.url is
// `file:///C:/Users/.../seed-questions.ts` (three slashes, forward
// slashes) while `file://${process.argv[1]}` would produce
// `file://C:\Users\...\seed-questions.ts` (backslashes) — never equal.
//
// No top-level await here (mirrors seed-dev.ts / make-superadmin.ts's
// .then()/.catch() convention) — this repo's tsx invocation transpiles to
// a CJS output format, which cannot support top-level await at all,
// regardless of whether the `if` branch is taken at runtime.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaClient();
  main(process.argv.slice(2), { prisma })
    .then(() => prisma.$disconnect())
    .catch(async (err: unknown) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
