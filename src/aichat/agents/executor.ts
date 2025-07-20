import { ProductsTool } from "../tools/ProductsTool";
import { createStructuredChatAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ModelService } from '../models/ollamaModel'

export async function runIA(input: string, maxAttempts: number = 6, timeout: number = 25000): Promise<string> {
    let attempts = 0;
    let lastError: Error | null = null;

    const tools = [new ProductsTool()];
    const toolDescriptions = tools.map((tool) => `${tool.name}: ${tool.description}`).join("\n");
    const tool_names = tools.map((tool) => tool.name).join(", ");

    const modelSerrvice = new ModelService();

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", `Respondé exclusivamente en formato JSON Markdown, como se indica en las instrucciones. No agregues explicaciones. No uses texto fuera del bloque JSON.{tools}{tool_names}
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
`],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        ["system", "{agent_scratchpad}"],
    ]);

    while (attempts < maxAttempts) {
        attempts++;
        try {
            // Crear una promesa que se rechaza después de un tiempo de espera
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Tiempo de espera de ${timeout}ms excedido`));
                }, timeout);
            });

            // Ejecutar la tarea con un tiempo de espera
            const taskPromise = (async () => {
                const agent = await createStructuredChatAgent({
                    llm: modelSerrvice.model,
                    tools,
                    prompt,
                });

                const executor = AgentExecutor.fromAgentAndTools({
                    agent,
                    tools,
                    verbose: true,
                });

                return await executor.invoke({
                    input,
                    chat_history: [],
                    steps: [],
                    agent_scratchpad: ""
                });
                // Retornar el resultado si la tarea se completa a tiempo
                return result.output;
            })();

            // Usar Promise.race para aplicar el tiempo de espera
            const result = await Promise.race([taskPromise, timeoutPromise]);

            // Si la tarea se completa a tiempo, retornamos el resultado
            return result;
        } catch (error) {
            console.error(`Intento ${attempts} fallido:`, error instanceof Error ? error.message : error);
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempts >= maxAttempts) {
                throw new Error(`Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError.message}`);
            }
        }
    }

    throw new Error(`Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError?.message}`);
}
