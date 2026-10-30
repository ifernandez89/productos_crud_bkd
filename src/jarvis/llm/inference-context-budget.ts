export type ContextWindowTier =
  | 'BELOW_2K'
  | '2K_3K_LOCALIZED'
  | '4K_5K_MULTICOMPONENT'
  | '5K_6K_NEAR_LIMIT'
  | 'OVERFLOW_RISK';

export interface ContextBudgetEvaluation {
  promptTokens: number;
  maxContextTokens: number;
  reservedOutputTokens: number;
  availableForPrompt: number;
  utilizationRatio: number;
  canFitRequest: boolean;
  tier: ContextWindowTier;
}

export function evaluateContextWindowBudget(
  promptTokens: number,
  maxContextTokens: number,
  reservedOutputTokens: number,
): ContextBudgetEvaluation {
  const safePrompt = Math.max(0, Math.floor(promptTokens));
  const safeMax = Math.max(1, Math.floor(maxContextTokens));
  const safeReserved = Math.max(0, Math.floor(reservedOutputTokens));
  const availableForPrompt = Math.max(0, safeMax - safeReserved);
  const utilizationRatio =
    availableForPrompt > 0
      ? Math.round((safePrompt / availableForPrompt) * 100) / 100
      : 1;
  const canFitRequest = safePrompt <= availableForPrompt;

  let tier: ContextWindowTier = 'BELOW_2K';
  if (!canFitRequest || safePrompt > 6000) {
    tier = 'OVERFLOW_RISK';
  } else if (safePrompt >= 5000) {
    tier = '5K_6K_NEAR_LIMIT';
  } else if (safePrompt >= 4000) {
    tier = '4K_5K_MULTICOMPONENT';
  } else if (safePrompt >= 2000) {
    tier = '2K_3K_LOCALIZED';
  }

  return {
    promptTokens: safePrompt,
    maxContextTokens: safeMax,
    reservedOutputTokens: safeReserved,
    availableForPrompt,
    utilizationRatio,
    canFitRequest,
    tier,
  };
}
