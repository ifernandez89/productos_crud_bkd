import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JarvisService } from '../src/jarvis/jarvis.service';

async function testTitle(jarvisService: JarvisService, title: string) {
  console.log(`\n================================================================================`);
  console.log(`📚 PRUEBA DE TÍTULO: "${title}"`);
  console.log(`================================================================================`);
  
  try {
    const response = await jarvisService.query(title, {
      sessionId: `test-session-${Date.now()}`,
      useDocuments: true,
    });
    console.log(response);
  } catch (err: any) {
    console.error(`❌ ERROR al consultar "${title}":`, err.message);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const jarvisService = app.get(JarvisService);

  const titlesToTest = [
    "El hombre y sus simbolos",
    "Los Nueve Ritos del Munay-Ki",
    "La vía del tarot",
    "Mas alla del ego Walsh",
  ];

  for (const title of titlesToTest) {
    await testTitle(jarvisService, title);
  }

  await app.close();
}

main().catch(console.error);
