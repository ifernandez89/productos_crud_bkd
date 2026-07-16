import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { BalanceService } from '../src/modules/balance/balance.service';

async function run() {
  console.log('Bootstrapping NestJS test context...');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const balanceService = app.get(BalanceService);

  console.log('--- 1. Starting a new session ---');
  const sessionResult = await balanceService.start('manual');
  console.log('Session created:', {
    sessionId: sessionResult.sessionId,
    type: sessionResult.type,
    questionsCount: sessionResult.questions.length,
  });

  const sessionId = sessionResult.sessionId;
  const questions = sessionResult.questions;

  console.log('--- 2. Submitting answers ---');
  // Answer all 20 questions with typical scenarios
  const dummyAnswers = [
    "Suelo planificar en detalle e investigar antes de hacer cualquier cosa.",
    "Me cuesta mucho decir que no, por lo que a veces me sobrecargo.",
    "Trato de mediar y encontrar un punto medio siempre que hay conflictos.",
    "Termino todo lo que empiezo, aunque me lleve mucho tiempo y esfuerzo.",
    "Analizo cada opción detalladamente para no cometer errores.",
    "Busco aplicar de inmediato lo que aprendo en la práctica.",
    "Me enfoco en producir y terminar las cosas físicamente.",
    "Me encanta soñar despierto y planificar nuevos horizontes.",
    "Tengo rutinas rígidas y me molesta cuando se alteran.",
    "Mantengo la calma y busco que todos en el equipo estén alineados.",
    "No abandono los proyectos a mitad de camino por más difíciles que sean.",
    "Me paso horas reflexionando sobre teorías y conceptos abstractos.",
    "Sé cómo traducir un plan abstracto a pasos de acción inmediatos.",
    "Me enfoco en terminar las tareas del día y ver el resultado físico.",
    "Me abro a probar nuevas herramientas y frameworks constantemente.",
    "Establezco límites claros y defino prioridades firmes.",
    "Busco que el ambiente de trabajo sea armonioso y sin tensiones.",
    "Si algo no sale a la primera, insisto y persisto hasta lograrlo.",
    "Intento entender el origen de los problemas de forma lógica y estructurada.",
    "Busco el balance entre planificar y ejecutar sin irme a los extremos."
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const ans = dummyAnswers[i % dummyAnswers.length];
    await balanceService.submitAnswer(sessionId, q.id, ans);
  }
  console.log('Submitted answers for all questions.');

  console.log('--- 3. Finishing session & generating report ---');
  const report = await balanceService.finish(sessionId);
  console.log('Report generated successfully:');
  console.log('Score General:', report.scoreGeneral);
  console.log('Energy Distribution:', JSON.stringify(report.energyDistribution, null, 2));
  console.log('Analysis strengths:', report.analysis.fortalezas);
  console.log('Lo que observo:', report.analysis.loQueObservo);
  console.log('Punto ciego:', report.analysis.puntoCiego);
  console.log('Astrology Connection:', report.analysis.astrologyConnection);
  console.log('Seed (Semilla):', report.recommendations.semilla);

  console.log('--- 4. Getting latest status ---');
  const latest = await balanceService.getLatest();
  console.log('Latest status session ID:', latest.sessionId);
  console.log('Latest status score general:', latest.scoreGeneral);

  console.log('--- 5. Getting trends ---');
  const trends = await balanceService.getTrends();
  console.log('Trends data count:', trends.length);

  await app.close();
  console.log('NestJS test context closed. Test completed successfully!');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
