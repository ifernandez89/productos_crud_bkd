import { ProductsTool } from '../tools/ProductsTool';
import { createStructuredChatAgent } from 'langchain/agents';
import { AgentExecutor } from 'langchain/agents';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { OllamaModelService } from '../models/ollamaModel';

export async function runIA(
  input: string,
  maxAttempts: number = 6,
  timeout: number = 25000,
): Promise<string> {
  let attempts = 0;
  let lastError: Error | null = null;

  const tools = [new ProductsTool()];

  const modelService = new OllamaModelService();

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `Respondé exclusivamente en formato JSON Markdown, como se indica en las instrucciones. No agregues explicaciones. No uses texto fuera del bloque JSON.{tools}{tool_names}
            Formato:
\`\`\`json
{{
  "action": "Traer productos",
  "action_input": "Traer celulares" 
}}
\`\`\`

O, si querés dar la respuesta final al usuario:

\`\`\`json
{{
  "action": "Final Answer",
  "action_input": "Hay 15 productos en total."
}}
\`\`\`

Usá solo las herramientas: "Traer productos" o "Final Answer".
`,
    ],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    ['system', '{agent_scratchpad}'],
  ]);

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tiempo de espera de ${timeout}ms excedido`));
        }, timeout);
      });

      const taskPromise = (async () => {
        const agent = await createStructuredChatAgent({
          llm: await modelService.getModel(),
          tools,
          prompt,
        });

        const executor = AgentExecutor.fromAgentAndTools({
          agent,
          tools,
          verbose: true,
        });

        const result = await executor.invoke({
          input,
          chat_history: [],
          steps: [],
          agent_scratchpad: '',
        });
        return result.output;
      })();

      const result = await Promise.race([taskPromise, timeoutPromise]);
      return result;
    } catch (error) {
      console.error(
        `Intento ${attempts} fallido:`,
        error instanceof Error ? error.message : error,
      );
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempts >= maxAttempts) {
        throw new Error(
          `Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError.message}`,
        );
      }
    }
  }

  throw new Error(
    `Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError?.message}`,
  );
}
