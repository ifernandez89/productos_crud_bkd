const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { JarvisCommandService } = require('../dist/jarvis/commands/jarvis-command.service');

async function test() {
  console.log('--- Creando contexto NestJS ---');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const commandService = app.get(JarvisCommandService);

  const testQueries = [
    '¿Qué libros tenemos?',
    'que libros tenemos',
    'qué libros tenemos en nuestra biblioteca',
    'mis libros',
    '/libros',
    '/audiolibros',
    'cuales libros hay'
  ];

  for (const q of testQueries) {
    console.log(`\n========================================`);
    console.log(`Probando query: "${q}"`);
    const result = await commandService.handleCommand(q, 'test-session', Date.now());
    console.log(`Handled: ${result.handled}`);
    if (result.handled) {
      console.log(`Respuesta preview (primeras 14 líneas):`);
      console.log(result.response.split('\n').slice(0, 14).join('\n'));
      console.log('...');
    } else {
      console.log('NO FUE CAPTURADO POR COMMAND SERVICE!');
    }
  }

  await app.close();
}

test().catch(console.error);
