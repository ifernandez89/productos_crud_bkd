import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JarvisCommandService } from '../src/jarvis/commands/jarvis-command.service';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';

async function testQuery(cmdService: JarvisCommandService, corpusSelector: CorpusSelectorService, input: string) {
  console.log(`\n====================================================`);
  console.log(`💬 USER INPUT: "${input}"`);
  console.log(`====================================================`);

  const startTime = Date.now();
  const res = await cmdService.handleCommand(input, 'test-session', startTime);

  if (res.handled) {
    console.log(`[HANDLED BY COMMAND]`);
    console.log(res.response);
  } else {
    console.log(`[NOT HANDLED AS COMMAND -> PASSES TO RAG / CHAT]`);
    const matches = corpusSelector.findRelevantDocuments(input, 3);
    console.log(`Corpus Selector matches: ${matches.length}`);
    for (const m of matches) {
      console.log(`  • "${m.document.titulo}" (${m.document.autor}) | Score: ${m.score} | MatchedOn: ${m.matchedOn.join(', ')}`);
    }
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cmdService = app.get(JarvisCommandService);
  const corpusSelector = app.get(CorpusSelectorService);

  const testQueries = [
    "Sigmund freud",
    "Hablame sobre los libros de obras completas sigmund freud",
    "Hablame sobre sigmund freud",
    "Obras completas",
    "Detalla obras completas",
    "Profundiza en Sigmund Freud Obras completas",
    "Resume Obras Completas",
    "Resumen de Sigmund Freud",
    "Busca en mis documentos sexualidad"
  ];

  for (const q of testQueries) {
    await testQuery(cmdService, corpusSelector, q);
  }

  await app.close();
}

main().catch(console.error);
