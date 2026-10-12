import { describe, it, expect } from 'vitest';
import {
  QuestionSeedSchema,
  validateQuestionSeeds,
  type QuestionSeed,
} from './question-seed-schema';

describe('QuestionSeedSchema', () => {
  it('accepts a valid MIROIR seed', () => {
    const seed: QuestionSeed = {
      slug: 'test-mirror',
      roundType: 'MIROIR',
      category: 'Test',
      prompt: 'What is your favorite color?',
      options: [
        { id: 'a', text: 'Red' },
        { id: 'b', text: 'Blue' },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(true);
  });

  it('rejects a MIROIR seed with weight on options', () => {
    const seed = {
      slug: 'test-mirror-with-weight',
      roundType: 'MIROIR',
      category: 'Test',
      prompt: 'What is your favorite color?',
      options: [
        { id: 'a', text: 'Red', weight: 5 },
        { id: 'b', text: 'Blue' },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('must not declare a weight');
    }
  });

  it('accepts a valid SCENARIO seed with weights on all options', () => {
    const seed: QuestionSeed = {
      slug: 'test-scenario',
      roundType: 'SCENARIO',
      category: 'Test',
      prompt: 'What would you do?',
      options: [
        { id: 'a', text: 'Option A', weight: 5 },
        { id: 'b', text: 'Option B', weight: 7 },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(true);
  });

  it('rejects a SCENARIO seed missing weight on one option', () => {
    const seed = {
      slug: 'test-scenario-incomplete',
      roundType: 'SCENARIO',
      category: 'Test',
      prompt: 'What would you do?',
      options: [
        { id: 'a', text: 'Option A', weight: 5 },
        { id: 'b', text: 'Option B' },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('SCENARIO options must all declare a weight');
    }
  });

  it('rejects weight out of range (11)', () => {
    const seed = {
      slug: 'test-weight-too-high',
      roundType: 'SCENARIO',
      category: 'Test',
      prompt: 'What would you do?',
      options: [
        { id: 'a', text: 'Option A', weight: 11 },
        { id: 'b', text: 'Option B', weight: 5 },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it('rejects weight out of range (-1)', () => {
    const seed = {
      slug: 'test-weight-negative',
      roundType: 'SCENARIO',
      category: 'Test',
      prompt: 'What would you do?',
      options: [
        { id: 'a', text: 'Option A', weight: -1 },
        { id: 'b', text: 'Option B', weight: 5 },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it('accepts a valid FACEAFACE seed', () => {
    const seed: QuestionSeed = {
      slug: 'test-faceaface',
      roundType: 'FACEAFACE',
      category: 'Test',
      prompt: 'What matters most?',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
      ],
    };
    const result = QuestionSeedSchema.safeParse(seed);
    expect(result.success).toBe(true);
  });
});

describe('validateQuestionSeeds', () => {
  it('throws on duplicate slug', () => {
    const seeds: QuestionSeed[] = [
      {
        slug: 'duplicate',
        roundType: 'MIROIR',
        category: 'Test',
        prompt: 'Question 1?',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
      },
      {
        slug: 'duplicate',
        roundType: 'MIROIR',
        category: 'Test',
        prompt: 'Question 2?',
        options: [
          { id: 'a', text: 'C' },
          { id: 'b', text: 'D' },
        ],
      },
    ];
    expect(() => validateQuestionSeeds(seeds)).toThrow('Duplicate question slug: duplicate');
  });

  it('succeeds with valid seeds', () => {
    const seeds: QuestionSeed[] = [
      {
        slug: 'q1',
        roundType: 'MIROIR',
        category: 'Test',
        prompt: 'Question 1?',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
      },
      {
        slug: 'q2',
        roundType: 'SCENARIO',
        category: 'Test',
        prompt: 'Question 2?',
        options: [
          { id: 'a', text: 'C', weight: 5 },
          { id: 'b', text: 'D', weight: 7 },
        ],
      },
    ];
    expect(() => validateQuestionSeeds(seeds)).not.toThrow();
  });
});
