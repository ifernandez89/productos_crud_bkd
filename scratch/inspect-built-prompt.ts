import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JarvisPromptBuilderService } from '../src/jarvis/prompt/jarvis-prompt-builder.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const promptBuilder = app.get(JarvisPromptBuilderService);

  const context = await promptBuilder.buildJarvisContext(
    "Energetica Psiquica y Esencia Del Sueño",
    "test-session",
    true,
    true,
    6
  );

  console.log('=================== SYSTEM PROMPT ===================');
  console.log(context.systemPrompt);
  console.log('\n=================== USER PROMPT ===================');
  console.log(context.userPrompt);

  await app.close();
}

main().catch(console.error);
