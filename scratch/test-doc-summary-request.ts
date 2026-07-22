import { JarvisPromptBuilderService } from '../src/jarvis/prompt/jarvis-prompt-builder.service';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';

async function main() {
  const corpusSelector = new CorpusSelectorService();
  const promptBuilder = new JarvisPromptBuilderService(
    {} as any,
    { getIdentity: () => ({ name: 'JarBees', personality: { tone: 'amigable', verbosity: 'media' }, language: 'es-AR', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires' }) } as any,
    { getCapabilities: () => ({}) } as any,
    { findRelevant: () => [] } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    corpusSelector,
  );

  const testMessages = [
    "Energetica Psiquica y Esencia Del Sueño",
    "resumen de Energetica Psiquica y Esencia Del Sueño",
    "El hombre y sus simbolos",
    "hola, que tal?"
  ];

  for (const msg of testMessages) {
    const res = await (promptBuilder as any).detectDocumentSummaryRequest(msg);
    console.log(`Msg: "${msg}" -> isRequest: ${res.isRequest}, title: "${res.title}"`);
  }
}

main().catch(console.error);
