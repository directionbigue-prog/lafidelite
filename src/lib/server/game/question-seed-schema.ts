import { z } from 'zod';

const BaseOption = z.object({ id: z.string().min(1), text: z.string().min(1) });
const ScenarioOption = BaseOption.extend({ weight: z.number().int().min(0).max(10) });

export const QuestionSeedSchema = z
  .object({
    slug: z.string().min(1),
    roundType: z.enum(['MIROIR', 'SCENARIO', 'FACEAFACE']),
    category: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(z.union([ScenarioOption, BaseOption])).min(2),
  })
  .superRefine((val, ctx) => {
    const hasWeight = val.options.some((o) => 'weight' in o);
    if (val.roundType === 'SCENARIO' && !val.options.every((o) => 'weight' in o)) {
      ctx.addIssue({ code: 'custom', message: 'SCENARIO options must all declare a weight' });
    }
    if (val.roundType !== 'SCENARIO' && hasWeight) {
      ctx.addIssue({
        code: 'custom',
        message: `${val.roundType} options must not declare a weight`,
      });
    }
  });

export type QuestionSeed = z.infer<typeof QuestionSeedSchema>;

export function validateQuestionSeeds(seeds: QuestionSeed[]): void {
  const slugs = new Set<string>();
  for (const seed of seeds) {
    const parsed = QuestionSeedSchema.safeParse(seed);
    if (!parsed.success) {
      throw new Error(`Invalid question seed "${seed.slug}": ${parsed.error.message}`);
    }
    if (slugs.has(seed.slug)) {
      throw new Error(`Duplicate question slug: ${seed.slug}`);
    }
    slugs.add(seed.slug);
  }
}
