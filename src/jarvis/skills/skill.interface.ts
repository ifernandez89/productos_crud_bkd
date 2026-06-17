export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  keywords: string[];
  priority?: number;
  capabilities?: string[];
}

export interface Skill extends SkillMetadata {
  content: string;
  summary: string;
  source: string;
}
