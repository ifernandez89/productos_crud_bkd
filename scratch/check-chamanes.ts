import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';

async function checkChamanes() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const corpus = app.get(CorpusSelectorService);
  const index = corpus.getIndex();

  const missingTitles = [
    "Los Chamanes de Mexico El Cerebro y los Chamanes Vol 5 2",
    "Los Chamanes de Mexico Vol 6",
    "Los Chamanes de Mexico Vol 7"
  ];

  for (const title of missingTitles) {
    const found = index.documentos.find((d: any) => d.titulo === title);
    if (found) {
      console.log(`FOUND: "${found.titulo}" -> autor: "${found.autor}" | archivo: "${found.archivo}"`);
    } else {
      console.log(`NOT FOUND BY TITLE: "${title}"`);
    }
  }

  await app.close();
  process.exit(0);
}

checkChamanes().catch(err => {
  console.error(err);
  process.exit(1);
});
