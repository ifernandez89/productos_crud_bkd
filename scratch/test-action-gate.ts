import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ActionExecutionGateService } from '../src/jarvis/security/action-execution-gate.service';

async function bootstrap() {
  console.log('--- TEST ACTION GATE START ---');
  const app = await NestFactory.createApplicationContext(AppModule);

  const actionGate = app.get(ActionExecutionGateService);

  // 1. Probar paso permitido normal
  console.log('Probando paso normal permitido (search)...');
  try {
    await actionGate.checkStep({
      type: 'search',
      input: { query: 'NestJS NestFactory' },
    });
    console.log('✅ Paso normal aprobado correctamente.');
  } catch (err: any) {
    console.error('❌ ERROR: Se rechazó un paso permitido:', err.message);
  }

  // 2. Probar paso no permitido (fuera de lista blanca)
  console.log('Probando paso no permitido (custom_cmd)...');
  try {
    await actionGate.checkStep({
      type: 'custom_cmd',
      input: { cmd: 'rm -rf /' },
    });
    console.error('❌ ERROR: Se aprobó una acción que no está en la lista blanca!');
  } catch (err: any) {
    console.log(`✅ Paso no permitido bloqueado correctamente. Mensaje: "${err.message}"`);
  }

  // 3. Probar paso destructivo/alto riesgo sin HITL
  console.log('Probando paso destructivo sin HITL (save con drop)...');
  try {
    await actionGate.checkStep({
      type: 'save',
      input: { content: 'Debemos drop table "Document" de inmediato.' },
    });
    console.error('❌ ERROR: Se aprobó una acción destructiva sin confirmación humana!');
  } catch (err: any) {
    console.log(`✅ Paso destructivo sin HITL bloqueado correctamente. Mensaje: "${err.message}"`);
  }

  // 4. Probar paso destructivo/alto riesgo CON HITL
  console.log('Probando paso destructivo CON HITL (save con drop y confirmación)...');
  try {
    await actionGate.checkStep(
      {
        type: 'save',
        input: { content: 'Debemos drop table "Document" de inmediato.' },
      },
      'test-session',
      true // isHumanConfirmed = true
    );
    console.log('✅ Paso destructivo con HITL aprobado correctamente.');
  } catch (err: any) {
    console.error('❌ ERROR: Se rechazó una acción destructiva que sí tenía HITL:', err.message);
  }

  // Cerrar app
  await app.close();
  console.log('--- TEST ACTION GATE END ---');
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Fallo fatal en test:', err);
  process.exit(1);
});
