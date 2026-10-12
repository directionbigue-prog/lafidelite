import { describe, it, expect } from 'vitest';
import { shapeQuestionForClient, canRevealPartnerAnswer } from './response-shaping';

describe('shapeQuestionForClient', () => {
  it('strips weight from SCENARIO options', () => {
    const shaped = shapeQuestionForClient({
      id: 'q1',
      roundType: 'SCENARIO',
      prompt: 'Test?',
      options: [
        { id: 'a', text: 'Option A', weight: 8 },
        { id: 'b', text: 'Option B', weight: 3 },
      ],
    });
    expect(shaped.options).toEqual([
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
    ]);
    expect(JSON.stringify(shaped)).not.toContain('weight');
  });

  it('passes MIROIR/FACEAFACE options through unchanged (no weight to strip)', () => {
    const shaped = shapeQuestionForClient({
      id: 'q2',
      roundType: 'MIROIR',
      prompt: 'Test?',
      options: [{ id: 'a', text: 'Option A' }],
    });
    expect(shaped.options).toEqual([{ id: 'a', text: 'Option A' }]);
  });
});

describe('canRevealPartnerAnswer', () => {
  it('is false for PENDING and IN_PROGRESS round status', () => {
    expect(canRevealPartnerAnswer('PENDING')).toBe(false);
    expect(canRevealPartnerAnswer('IN_PROGRESS')).toBe(false);
  });

  it('is true only for COMPLETED round status', () => {
    expect(canRevealPartnerAnswer('COMPLETED')).toBe(true);
  });
});
