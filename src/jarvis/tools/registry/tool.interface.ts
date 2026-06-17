export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  config?: Record<string, any>;
}
