export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  keywords: string[];
  priority?: number;
  capabilities?: string[];
  preconditions?: string[];
  steps?: string[];
  pitfalls?: string[];
  verificationSteps?: string[];
}

export interface Skill extends SkillMetadata {
  content: string;
  summary: string;
  source: string;
  isProceduralSop?: boolean;
}
