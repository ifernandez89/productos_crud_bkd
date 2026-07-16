import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BalanceService } from '../src/modules/balance/balance.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Cargar archivo .env de forma manual para inicializar variables antes de instanciar Prisma
const envPath = 'C:/nest/productos_crud_bkd/.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const parts = trimmedLine.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        // Limpiar comillas si existen
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    }
  }
}

async function run() {
  console.log('=== Iniciando Simulación de Entrevista Adaptativa ===');
  const app = await NestFactory.createApplicationContext(AppModule);
  const balanceService = app.get(BalanceService);
  const prisma = app.get(PrismaService);

  try {
    // 1. Iniciar la sesión
    console.log('\n[1] Iniciando nueva sesión de balance...');
    const startResult = await balanceService.start('manual');
    const sessionId = startResult.sessionId;
    console.log(`Sesión iniciada con ID: ${sessionId}`);
    console.log(`Ciclo detectado: ${startResult.cycle} - "${startResult.cycleName}"`);
    
    let currentQuestion = startResult.questions[0];
    console.log(`\nPregunta 1: ${currentQuestion.question}`);

    // Mock de respuestas de prueba
    // Estructuramos respuestas que muestran un patrón claro: investigar vs construir (análisis vs manifestación)
    const mockAnswers = [
      "Investigación. Estuve analizando un montón de ideas nuevas para nuestro software.", // R a Pregunta 1
      "Principalmente a leer documentación de arquitecturas y aprender nuevas herramientas.", // R a Pregunta 2
      "Siento que descuidé el sentarme a programar de verdad y escribir código real.", // R a Pregunta 3
      "Me dio satisfacción aprender tanto, pero al mismo tiempo culpa por no avanzar en la práctica.", // R a Pregunta 4
      "No sé, supongo que me da un poco de miedo meter la pata en la base de la arquitectura.", // R a Pregunta 5
      "Prefiero seguir investigando y estar 100% seguro antes de tocar la primera línea de código.", // R a Pregunta 6
      "Generalmente postergo la construcción y sigo buscando más información en internet.", // R a Pregunta 7
      "Para nada, me lo guardé todo para mí solo durante estas semanas.", // R a Pregunta 8
      "La idea de armar el backend desde cero, pero sigue viviendo solo en mi cabeza.", // R a Pregunta 9
      "Aceptar que todavía podía mejorar me frena bastante a la hora de arrancar." // R a Pregunta 10
    ];

    // 2. Simular el flujo adaptativo de preguntas y respuestas (1 a 10)
    for (let i = 0; i < 10; i++) {
      const answerText = mockAnswers[i];
      console.log(`> Usuario responde: "${answerText}"`);
      
      const submitResult = await balanceService.submitAnswer(sessionId, currentQuestion.id, answerText);
      
      if (submitResult.nextQuestion) {
        currentQuestion = submitResult.nextQuestion;
        console.log(`\nPregunta ${i + 2}: ${currentQuestion.question}`);
      } else {
        console.log('\n[Fin de preguntas] Entrevista completada.');
      }
    }

    // 3. Finalizar la sesión y generar el reporte
    console.log('\n[2] Finalizando sesión y generando informe de balance energético...');
    const report = await balanceService.finish(sessionId);

    console.log('\n=== RESULTADOS DEL REPORTE ===');
    console.log(`Score General: ${report.scoreGeneral}`);
    console.log(`Resumen: ${report.summary}`);
    console.log('\nDistribución de Energía:');
    console.dir(report.energyDistribution);
    console.dir(report.analysis);
    console.log('\nRecomendaciones:');
    console.dir(report.recommendations);

  } catch (error) {
    console.error('Error durante la simulación:', error);
  } finally {
    await prisma.$disconnect();
    await app.close();
    console.log('\n=== Simulación Finalizada ===');
  }
}

run();
