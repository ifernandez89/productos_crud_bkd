import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JarvisService } from '../jarvis/jarvis.service';
import { PrismaService } from '../prisma/prisma.service';
import { RssIngestService } from '../jarvis/library/rss-ingest.service';
import { randomUUID } from 'crypto';

@Injectable()
export class DailyJobsService {
  private readonly logger = new Logger(DailyJobsService.name);

  constructor(
    private readonly jarvisService: JarvisService,
    private readonly prisma: PrismaService,
    private readonly rssIngest: RssIngestService,
  ) {}

  /**
   * Resumen Matutino (Todos los días a las 8:00 AM)
   * JarBees analiza de forma proactiva las noticias y agenda del día,
   * y guarda el resumen para que el usuario lo vea al despertar.
   */
  @Cron('0 8 * * *', {
    name: 'morning_briefing',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async generateMorningBriefing() {
    this.logger.log('🌅 Iniciando Morning Briefing (Job Matutino)');
    const sessionId = `job-morning-${new Date().toISOString().split('T')[0]}`;

    const prompt =
      'Generá un resumen de las noticias más importantes de hoy para Paraná, Entre Ríos. Y luego sumá un reporte del clima.';

    try {
      const response = await this.jarvisService.query(prompt, {
        sessionId,
        useMemory: true, // Queremos que use las preferencias del usuario
      });

      this.logger.log('✅ Morning Briefing generado exitosamente.');

      // En el futuro, esto podría enviarse por Telegram o Email.
      // Por ahora, solo queda registrado en ConversationMessage asociado a ese sessionId.
      // Vamos a guardar una métrica en los logs para que sea fácil de rastrear.
      this.logger.log(`[Reporte Generado] \n${response.slice(0, 300)}...`);
    } catch (error) {
      this.logger.error(
        `❌ Error generando el Morning Briefing: ${error.message}`,
      );
    }
  }

  /**
   * Procesamiento Nocturno (Todos los días a las 3:00 AM)
   * Ideal para procesar PDFs de un "inbox" local, generar embeddings pesados, etc.
   */
  @Cron('0 3 * * *', {
    name: 'nightly_processing',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async runNightlyProcessing() {
    this.logger.log(
      '🦉 Iniciando Procesamiento Nocturno (Ingesta de Biblioteca Viva)',
    );

    // 1. Ingesta de fuentes RSS
    const rssSources = await this.prisma.knowledgeSource.findMany({
      where: { type: 'rss', active: true },
    });

    for (const source of rssSources) {
      if (source.url) {
        await this.rssIngest.processFeed(source.url, 'rss');
      }
    }

    // 2. Podríamos recorrer una carpeta "docs_inbox" para PDFs
    this.logger.log(
      '✅ Fuentes RSS y Documentos indexados. Base de conocimiento actualizada.',
    );
  }

  /**
   * JOB TEMPORAL DE PRUEBA (Cada 30 segundos)
   * Descomentar para ver cómo JarBees es proactivo sin intervención humana.
   * CUIDADO: Esto consumirá créditos/recursos si se deja corriendo.
   */
  // @Cron('*/30 * * * * *', { name: 'demo_job' })
  // async runDemoJob() {
  //   this.logger.log('🔄 Ejecutando Job de Prueba cada 30 segundos...');
  //   const sessionId = `job-demo-${randomUUID()}`;
  //   const response = await this.jarvisService.query('Dame un dato curioso cortito aleatorio.', { sessionId });
  //   this.logger.log(`[Dato Curioso Proactivo]: ${response}`);
  // }
}
