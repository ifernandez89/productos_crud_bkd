export interface AIContentPart {
  text?: string;
}

export interface AIMessageResponse {
  content: string | AIContentPart[];
}

export interface IModelService {
  invoke(prompt: string): Promise<AIMessageResponse>;
}
