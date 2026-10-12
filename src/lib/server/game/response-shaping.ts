// The single chokepoint every /api/games/* route (Lot 2) MUST use before
// putting a Question or another player's Answer into a client response.
// Two invariants this repo has decided are non-negotiable (see this plan's
// Global Constraints):
//   1. A SCENARIO option's `weight` must never reach the client.
//   2. The other player's answer for the current question must never be
//      visible before the round is COMPLETED.
export interface ClientOption {
  id: string;
  text: string;
}

export interface ClientQuestion {
  id: string;
  roundType: string;
  prompt: string;
  options: ClientOption[];
}

interface RawOption {
  id: string;
  text: string;
  weight?: number;
}

export function shapeQuestionForClient(question: {
  id: string;
  roundType: string;
  prompt: string;
  options: unknown;
}): ClientQuestion {
  const options = question.options as RawOption[];
  return {
    id: question.id,
    roundType: question.roundType,
    prompt: question.prompt,
    options: options.map((o) => ({ id: o.id, text: o.text })),
  };
}

export function canRevealPartnerAnswer(roundStatus: string): boolean {
  return roundStatus === 'COMPLETED';
}
