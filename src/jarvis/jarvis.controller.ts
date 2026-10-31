import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Headers,
  Res,
  Optional,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JarvisService } from './jarvis.service';
import { FeedbackDto } from './dto/feedback.dto';
import { CollectionRepository } from './repositories/collection.repository';
import { DocumentRepository } from './repositories/document.repository';
import { DocumentIngestService } from './library/document-ingest.service';
import { DashboardService } from './library/dashboard.service';
import { PlannerService } from './planner/planner.service';
import { InvestigationService } from './tools/web/investigation.service';
import { KnowledgeEvolutionService } from './memory/knowledge-evolution.service';
import { ConversationRepository } from './repositories/conversation.repository';
import { VisionService } from './tools/vision/vision.service';
import { CategorySummaryService } from './library/category-summary.service';
import { DocumentSummaryService } from './library/document-summary.service';
import { KnowledgeTestService } from './library/knowledge-test.service';
import { GeneralIntelligenceTrialsService } from './library/general-intelligence-trials.service';
import { AuditService } from './security/audit.service';
import { DocumentSynthesisService } from './library/document-synthesis.service';
import { VoiceService } from './tools/voice/voice.service';
import { AudiobookIngestService } from './library/audiobook-ingest.service';
import { randomUUID } from 'crypto';
import { Public } from '../auth/public.decorator';
import { getAvailableDisciplines } from '../shared/disciplines';
import { InferenceGatewayService } from './llm/inference-gateway.service';
import { ActionGatekeeperService } from './security/action-gatekeeper.service';
import { MissionRecoveryService } from './planner/mission-recovery.service';
import { InferenceDiagnosticsService } from './llm/inference-diagnostics.service';
import { ExecutionEngine, ExecutionPlan } from './planner/execution-engine.service';
import { VerificationMissionRequest } from './verification/verification-harness.types';
import {
  EngineeringMissionManagerService,
  ManagedMissionRequest,
} from './verification/engineering-mission-manager.service';
import { TelemetryInspectionService } from './llm/telemetry-inspection.service';
import { CapabilityRegistryService } from './config/capability-registry.service';
import { CoreContextService } from './prompt/core-context.service';
import { TripartiteMemoryService } from './memory/tripartite-memory.service';
import {
  MemoryConsolidationService,
  SleepConsolidationOptions,
} from './memory/memory-consolidation.service';

@ApiTags('jarbees')
@Controller('jarbees')
export class JarvisController {
  private readonly logger = new Logger(JarvisController.name);

  constructor(
    private readonly jarvisService: JarvisService,
    private readonly collectionRepo: CollectionRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly ingestService: DocumentIngestService,
    private readonly dashboardService: DashboardService,
    private readonly plannerService: PlannerService,
    private readonly investigationService: InvestigationService,
    private readonly conversationRepo: ConversationRepository,
    private readonly knowledgeEvolution: KnowledgeEvolutionService,
    private readonly visionService: VisionService,
    private readonly categorySummaryService: CategorySummaryService,
    private readonly documentSummaryService: DocumentSummaryService,
    private readonly knowledgeTestService: KnowledgeTestService,
    private readonly auditService: AuditService,
    private readonly synthesisService: DocumentSynthesisService,
    private readonly voiceService: VoiceService,
    private readonly audiobookIngestService: AudiobookIngestService,
    private readonly trialsService: GeneralIntelligenceTrialsService,
    private readonly inferenceGateway: InferenceGatewayService,
    private readonly actionGatekeeper: ActionGatekeeperService,
    private readonly missionRecovery: MissionRecoveryService,
    @Optional()
    private readonly inferenceDiagnostics?: InferenceDiagnosticsService,
    @Optional()
    private readonly executionEngine?: ExecutionEngine,
    @Optional()
    private readonly engineeringMissionManager?: EngineeringMissionManagerService,
    @Optional()
    private readonly telemetryInspection?: TelemetryInspectionService,
    @Optional()
    private readonly capabilityRegistry?: CapabilityRegistryService,
    @Optional()
    private readonly coreContextService?: CoreContextService,
    @Optional()
    private readonly tripartiteMemory?: TripartiteMemoryService,
    @Optional()
    private readonly memoryConsolidation?: MemoryConsolidationService,
  ) {}


  // ── Telemetría y Estado de Inferencia ───────────────────────────────────────

  @Public()
  @Get('inference/status')
  @ApiOperation({
    summary: 'Estado de pasarela de inferencia y motores locales',
    description:
      'Devuelve el estado de llama.cpp (RTX 5070), Ollama (fallback), modelo activo y política de conmutación.',
  })
  async getInferenceStatus() {
    return await this.inferenceGateway.getHealthStatus();
  }

  @Public()
  @Get('inference/diagnostics')
  @ApiOperation({
    summary: 'Diagnóstico estructurado de inferencia llama.cpp, latencia, VRAM y aislamiento bge-m3',
  })
  async getInferenceDiagnostics(
    @Query('probe') probe?: string,
    @Query('model') model?: string,
  ) {
    if (!this.inferenceDiagnostics) {
      throw new BadRequestException('InferenceDiagnosticsService no está inicializado.');
    }
    const report = await this.inferenceDiagnostics.runDiagnostics({
      runInferenceProbe: probe === 'true',
      requestedModel: model,
    });
    return { success: true, report };
  }

  @Public()
  @Get('telemetry/tokens')
  @ApiOperation({
    summary: 'Telemetría programática de consumo de tokens y escalones de contexto para auto-inspección de la IA',
  })
  getTokenTelemetry(
    @Query('missionId') missionId?: string,
    @Query('currentPromptTokens') currentPromptTokens?: string,
  ) {
    if (!this.telemetryInspection) {
      throw new BadRequestException('TelemetryInspectionService no está inicializado.');
    }
    const parsedPrompt = currentPromptTokens ? parseInt(currentPromptTokens, 10) : undefined;
    const report = this.telemetryInspection.getTokenTelemetryReport({
      missionId,
      currentPromptTokens: Number.isFinite(parsedPrompt) ? parsedPrompt : undefined,
    });
    return { success: true, report };
  }

  @Public()
  @Get('telemetry/budget')
  @ApiOperation({
    summary: 'Consulta programática de presupuesto de tokens, reparaciones y límites de misión para la IA',
  })
  getBudgetTelemetry(
    @Query('missionId') missionId?: string,
    @Query('currentPromptTokens') currentPromptTokens?: string,
  ) {
    if (!this.telemetryInspection) {
      throw new BadRequestException('TelemetryInspectionService no está inicializado.');
    }
    const parsedPrompt = currentPromptTokens ? parseInt(currentPromptTokens, 10) : undefined;
    const report = this.telemetryInspection.getBudgetTelemetryReport({
      missionId,
      currentPromptTokens: Number.isFinite(parsedPrompt) ? parsedPrompt : undefined,
    });
    return { success: true, report };
  }

  @Public()
  @Get('context/core')
  @ApiOperation({
    summary: 'Obtiene el CoreContext compacto permanente (máximo 25 líneas) de JarBees',
  })
  async getCoreContext(
    @Query('sessionId') sessionId?: string,
    @Query('mode') mode?: string,
  ) {
    if (!this.coreContextService) {
      throw new BadRequestException('CoreContextService no está inicializado.');
    }
    const coreContext = await this.coreContextService.buildCoreContext({
      sessionId,
      mode,
    });
    return { success: true, coreContext };
  }

  @Public()
  @Get('capabilities/registry')
  @ApiOperation({
    summary: 'Consulta el registro dinámico de capacidades reales (AVAILABLE, DEGRADED, UNAVAILABLE)',
  })
  getCapabilityRegistry() {
    if (!this.capabilityRegistry) {
      throw new BadRequestException('CapabilityRegistryService no está inicializado.');
    }
    return {
      success: true,
      registry: this.capabilityRegistry.getSnapshot(),
    };
  }

  @Post('capabilities/refresh')
  @ApiOperation({
    summary: 'Fuerza un sondeo activo del entorno y actualiza el CapabilityRegistry (soporta dryRun)',
  })
  async refreshCapabilityRegistry(
    @Body() body?: { dryRun?: boolean; probeNetwork?: boolean },
  ) {
    if (!this.capabilityRegistry) {
      throw new BadRequestException('CapabilityRegistryService no está inicializado.');
    }
    const registry = await this.capabilityRegistry.refreshCapabilities({
      dryRun: body?.dryRun,
      probeNetwork: body?.probeNetwork,
    });
    return { success: true, registry };
  }

  @Public()
  @Get('memory/tripartite')
  @ApiOperation({
    summary: 'Consulta unificada de la Memoria Tripartita (Working + Episodic 50/30/20 + Associative TripleStore)',
  })
  async getTripartiteMemory(
    @Query('query') query?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    if (!this.tripartiteMemory) {
      throw new BadRequestException('TripartiteMemoryService no está inicializado.');
    }
    const stats = await this.tripartiteMemory.getStats();
    const recall = query
      ? await this.tripartiteMemory.recallTripartiteContext(
          query,
          sessionId || 'global',
        )
      : null;
    return { success: true, stats, recall };
  }

  @Post('memory/sleep')
  @ApiOperation({
    summary: 'Ejecuta bajo demanda la rutina sleep de consolidación, deduplicación y calibración epistémica',
  })
  async runMemorySleep(@Body() options?: SleepConsolidationOptions) {
    if (!this.memoryConsolidation) {
      throw new BadRequestException('MemoryConsolidationService no está inicializado.');
    }
    const report = await this.memoryConsolidation.executeSleepCycle(options || {});
    return { success: true, report };
  }

  @Post('engineering/mission')
  @ApiOperation({
    summary: 'Ejecutar misión interactiva de ingeniería verificada (Protegido por Auth + Confinamiento + HITL)',
  })
  async executeEngineeringMission(
    @Body() mission: ManagedMissionRequest,
    @Headers('x-action-token') actionToken?: string,
  ) {
    if (!mission?.missionId || !mission?.objective || !mission?.entryFile) {
      throw new BadRequestException(
        'Se requieren missionId, objective y entryFile para ejecutar la misión de ingeniería.',
      );
    }

    if (this.engineeringMissionManager) {
      const record = await this.engineeringMissionManager.executeManagedMission({
        ...mission,
        humanApprovalToken: actionToken || mission.humanApprovalToken,
      });
      return {
        success:
          record.status === 'completed' ||
          record.status === 'awaiting_human_approval',
        planStatus: record.status,
        durationMs: record.budgetUsage.durationMs,
        managedRecord: record,
        verificationReport: record.verificationReport,
      };
    }

    if (!this.executionEngine) {
      throw new BadRequestException('ExecutionEngine no está inicializado.');
    }
    const plan: ExecutionPlan = {
      taskId: Date.now() % 1000000,
      objective: mission.objective,
      steps: [
        {
          id: 1,
          stepNumber: 1,
          description: `Misión de ingeniería verificada: ${mission.missionId}`,
          type: 'verify_code',
          status: 'pending',
          input: { verificationMission: mission },
        },
      ],
    };
    const planResult = await this.executionEngine.execute(plan);
    const stepContent = plan.steps[0]?.output?.content;
    const stepOutput = stepContent ? JSON.parse(stepContent) : null;
    return {
      success: Boolean(stepOutput?.success),
      planStatus: planResult.stepsFailed === 0 ? 'completed' : 'failed',
      durationMs: planResult.totalDurationMs,
      verificationReport: stepOutput,
    };
  }

  @Get('engineering/missions')
  @ApiOperation({
    summary: 'Listar misiones de ingeniería administradas y sus estados',
  })
  listEngineeringMissions() {
    if (!this.engineeringMissionManager) {
      throw new BadRequestException(
        'EngineeringMissionManagerService no está inicializado.',
      );
    }
    return {
      success: true,
      missions: this.engineeringMissionManager.listMissionRecords(),
    };
  }

  @Get('engineering/mission/:missionId')
  @ApiOperation({
    summary: 'Consultar estado detallado, diffs, presupuesto y checkpoints de una misión de ingeniería',
  })
  getEngineeringMission(@Param('missionId') missionId: string) {
    if (!this.engineeringMissionManager) {
      throw new BadRequestException(
        'EngineeringMissionManagerService no está inicializado.',
      );
    }
    const record = this.engineeringMissionManager.getMissionRecord(missionId);
    if (!record) {
      throw new BadRequestException(`Misión "${missionId}" no encontrada.`);
    }
    return { success: true, mission: record };
  }

  @Post('engineering/mission/:missionId/approve')
  @ApiOperation({
    summary: 'Aprobar humanamente (HITL) e integrar los cambios verificados de una misión en el workspace',
  })
  approveEngineeringMission(
    @Param('missionId') missionId: string,
    @Headers('x-action-token') actionToken?: string,
  ) {
    if (!this.engineeringMissionManager) {
      throw new BadRequestException(
        'EngineeringMissionManagerService no está inicializado.',
      );
    }
    const record = this.engineeringMissionManager.approveAndIntegrateMission(
      missionId,
      actionToken,
    );
    return { success: true, mission: record };
  }

  @Post('engineering/mission/:missionId/restore-checkpoint')
  @ApiOperation({
    summary: 'Restaurar manualmente un checkpoint previo de una misión de ingeniería',
  })
  restoreEngineeringMissionCheckpoint(
    @Param('missionId') missionId: string,
    @Body() body: { attemptIndex: number },
  ) {
    if (!this.engineeringMissionManager) {
      throw new BadRequestException(
        'EngineeringMissionManagerService no está inicializado.',
      );
    }
    const restored = this.engineeringMissionManager.restoreCheckpointManually(
      missionId,
      body.attemptIndex,
    );
    return { success: true, ...restored };
  }

  private _noopInferenceStatusPlaceholder() {
    return null;
  }

  // ── Sesión persistente ──────────────────────────────────────────────────────

  @Public()
  @Get('session')
  @ApiOperation({
    summary: 'Obtener o crear sessionId persistente',
    description:
      'El frontend llama esto UNA VEZ al arrancar y guarda el sessionId en localStorage. ' +
      'De esta forma el historial de conversación persiste entre recargas.',
  })
  getOrCreateSession(@Query('sessionId') sessionId?: string) {
    // Si el frontend ya tiene uno guardado, se lo devolvemos validado
    // Si no tiene, generamos uno nuevo (UUID)
    const id = sessionId && sessionId.length === 36 ? sessionId : randomUUID();
    return { sessionId: id };
  }

  // ── Historial de conversación ───────────────────────────────────────────────

  @Public()
  @Get('history')
  @ApiOperation({
    summary: 'Historial de mensajes de una sesión',
    description:
      'Devuelve los últimos N mensajes de la sesión. El frontend puede usarlo para reconstruir el chat al recargar.',
  })
  async getHistory(
    @Query('sessionId') sessionId: string,
    @Query('limit') limit?: string,
  ) {
    if (!sessionId) throw new BadRequestException('Se requiere sessionId');
    const messages = await this.conversationRepo.getRecentMessages(
      sessionId,
      limit ? parseInt(limit, 10) : 50,
    );
    return { sessionId, messages };
  }

  @Public()
  @Get('disciplines')
  @ApiOperation({
    summary: 'Listar disciplinas y especialistas disponibles para JarBees',
  })
  getDisciplines() {
    return {
      success: true,
      disciplines: getAvailableDisciplines(),
    };
  }

  // ── Query principal ─────────────────────────────────────────────────────────

  @Public()
  @Post('query')
  @ApiOperation({ summary: 'Consultar a Jarvis con selector de especialista opcional' })
  async query(
    @Body()
    body: {
      message: string;
      sessionId?: string;
      provider?: 'gateway' | 'llamacpp' | 'ollama' | 'openrouter' | string;
      mode?: string;
      discipline?: string;
      specialist?: string;
    },
  ) {
    const requestedProvider =
      body.provider === 'ollama' ? 'gateway' : body.provider;
    const answer = await this.jarvisService.query(body.message, {
      sessionId: body.sessionId,
      provider: requestedProvider,
      mode: body.mode || body.discipline || body.specialist,
    });
    return { answer, sessionId: body.sessionId, mode: body.mode || body.discipline };
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  @Public()
  @Post('feedback')
  @ApiOperation({ summary: 'Registrar feedback de una respuesta de Jarvis' })
  async saveFeedback(@Body() body: FeedbackDto) {
    const feedback = await this.jarvisService.saveFeedback(body);
    return { success: true, feedback };
  }

  // ── Planner ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('planner')
  @ApiOperation({ summary: 'Crear un plan de tareas a partir de un objetivo' })
  async createPlan(@Body() body: { objective: string; sessionId?: string }) {
    if (!body.objective)
      throw new BadRequestException('Se requiere un objetivo');
    const plan = await this.plannerService.createPlan(
      body.objective,
      body.sessionId,
    );
    return { success: true, plan };
  }

  @Public()
  @Post('planner/execute')
  @ApiOperation({
    summary: 'Crear y ejecutar un plan completo',
    description:
      'El Execution Engine descompone el objetivo en pasos (search, scrape, summarize, save, respond) ' +
      'y los ejecuta secuencialmente. Retorna la respuesta final generada por el LLM con el contexto acumulado.',
  })
  async executePlan(@Body() body: { objective: string; sessionId?: string }) {
    if (!body.objective)
      throw new BadRequestException('Se requiere un objetivo');
    const result = await this.plannerService.createAndExecute(
      body.objective,
      body.sessionId,
    );
    return { success: true, ...result };
  }

  @Public()
  @Get('missions/recoverable')
  @ApiOperation({
    summary: 'Listar misiones interrumpidas o pendientes de recuperación',
    description:
      'Devuelve las misiones que quedaron en estado in_progress o waiting_recovery tras un reinicio, junto con sus checkpoints en disco.',
  })
  async getRecoverableMissions() {
    const missions = await this.missionRecovery.getRecoverableMissions();
    return { success: true, missions };
  }

  @Public()
  @Post('missions/:id/resume')
  @ApiOperation({
    summary: 'Reanudar misión interrumpida de forma idempotente',
    description:
      'Reanuda una misión desde el último paso completado sin volver a ejecutar los pasos previos.',
  })
  async resumeMission(@Param('id', ParseIntPipe) id: number) {
    const result = await this.missionRecovery.resumeMission(id);
    return { success: true, ...result };
  }


  // ── Dashboard ───────────────────────────────────────────────────────────────

  @Public()
  @Get('dashboard')
  @ApiOperation({
    summary:
      'Estadísticas del sistema: memorias, documentos, colecciones, conversaciones',
  })
  async getDashboard() {
    return this.dashboardService.getStats();
  }

  // ── Memoria ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('memory')
  @ApiOperation({ summary: 'Guardar un hecho en la memoria permanente' })
  async saveMemory(
    @Body() body: { content: string; category: string; importance?: number },
  ) {
    const memory = await this.jarvisService.rememberFact(
      body.content,
      body.category,
      body.importance,
    );
    return { success: true, memory };
  }

  @Public()
  @Get('memory/:id')
  @ApiOperation({ summary: 'Recuperar una memoria por ID' })
  async getMemory(@Param('id', ParseIntPipe) id: number) {
    const memory = await this.jarvisService.recallMemory(id);
    return { memory };
  }

  @Public()
  @Get('memory')
  @ApiOperation({ summary: 'Listar todas las memorias' })
  async listMemories() {
    const memories = await this.jarvisService.listMemories();
    return { memories };
  }

  // ── Biblioteca — Documentos ─────────────────────────────────────────────────

  @Public()
  @Post('library/document')
  @ApiOperation({ summary: 'Ingerir un documento de texto o markdown' })
  async ingestDocument(
    @Body()
    body: {
      title: string;
      content: string;
      category?: string;
      source?: string;
    },
  ) {
    const result = await this.ingestService.ingestText(
      body.title,
      body.content,
      body.category,
      body.source,
    );
    return { success: true, ...result };
  }

  @Public()
  @Post('library/document/pdf')
  @ApiOperation({ summary: 'Subir e ingerir un PDF a la biblioteca' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        category: { type: 'string' },
        source: { type: 'string' },
        question: {
          type: 'string',
          description:
            'Pregunta sobre el contenido del PDF (opcional, si no se envía se genera un resumen)',
        },
        sessionId: {
          type: 'string',
          description:
            'Para guardar la respuesta en el historial de conversación',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async ingestPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      title?: string;
      category?: string;
      source?: string;
      question?: string;
      sessionId?: string;
    },
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo PDF');
    if (!file.mimetype.includes('pdf')) {
      throw new BadRequestException('El archivo debe ser un PDF');
    }
    const rawTitle = body.title || file.originalname;
    const title = this.ingestService.sanitizeTitle(rawTitle);
    const result = await this.ingestService.ingestPdf(
      file.buffer,
      title,
      body.category,
      body.source,
      body.question,
    );

    // Guardar en historial si hay sessionId
    if (body.sessionId && result.answer) {
      const userMsg = body.question
        ? `[PDF: ${file.originalname}] ${body.question}`
        : `[PDF: ${file.originalname}] Resumime este documento.`;
      await this.conversationRepo.create({
        sessionId: body.sessionId,
        role: 'user',
        content: userMsg,
        metadata: { source: 'pdf_upload', filename: file.originalname },
      });
      await this.conversationRepo.create({
        sessionId: body.sessionId,
        role: 'assistant',
        content: result.answer,
        metadata: { source: 'pdf_ingest', documentId: result.documentId },
      });
    }

    return { success: true, ...result };
  }

  @Public()
  @Post('library/document/url')
  @ApiOperation({
    summary: 'Ingerir contenido desde una URL (Scraping simple)',
  })
  async ingestUrl(@Body() body: { url: string; category?: string }) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.ingestService.ingestUrl(body.url, body.category);
    return { success: true, ...result };
  }

  @Public()
  @Get('library/document')
  @ApiOperation({ summary: 'Listar documentos de la biblioteca' })
  async listDocuments(@Query('category') category?: string) {
    const documents = await this.documentRepo.findDocuments(category);
    return { documents };
  }

  @Public()
  @Get('library/index')
  @ApiOperation({
    summary: 'Obtener el índice completo de la biblioteca (library-index.json)',
  })
  getLibraryIndex() {
    return this.jarvisService.getLibraryIndex();
  }

  @Public()
  @Get('library/document/search')
  @ApiOperation({ summary: 'Buscar en documentos' })
  async searchDocuments(@Query('q') query: string) {
    const documents = await this.documentRepo.searchDocuments(query);
    return { documents };
  }

  @Public()
  @Get('library/document/recent')
  @ApiOperation({ summary: 'Documentos más recientes' })
  async recentDocuments(@Query('limit') limit?: string) {
    const documents = await this.documentRepo.getMostRecentDocuments(
      limit ? parseInt(limit, 10) : 10,
    );
    return { documents };
  }

  @Public()
  @Get('library/document/:id')
  @ApiOperation({ summary: 'Obtener documento con sus chunks' })
  async getDocument(@Param('id', ParseIntPipe) id: number) {
    const document = await this.documentRepo.getDocumentWithChunks(id);
    return { document };
  }

  // ── Seguridad y Autorización de Acciones Críticas (HITL) ───────────────────

  @Public()
  @Post('security/challenge')
  @ApiOperation({
    summary: 'Solicitar un Action Challenge Token (HITL criptográfico de un solo uso)',
    description:
      'Genera un token firmado con HMAC-SHA256 con validez de 60 segundos para autorizar una acción destructiva concreta (ej: LIBRARY_DELETE_DOCUMENT). Previene inyecciones indirectas.',
  })
  requestActionChallenge(
    @Body()
    body: {
      actionType: string;
      targetId: string | number;
      payload?: Record<string, any>;
    },
  ) {
    return this.actionGatekeeper.createChallenge(
      body.actionType,
      body.targetId,
      body.payload,
    );
  }

  @Public()
  @Delete('library/document/:id')
  @ApiOperation({
    summary: 'Eliminar un documento (Requiere Action Challenge Token o confirmación HITL autorizada)',
  })
  async deleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-action-token') actionToken?: string,
    @Query('actionToken') queryActionToken?: string,
    @Query('confirm') confirm?: string,
    @Headers('x-human-confirmation') humanConfirmation?: string,
  ) {
    const token = actionToken || queryActionToken;

    // Si no se proporcionó token firmado, pero se pasó confirmación legacy
    if (!token) {
      const isLegacyDevBypass =
        (confirm === 'true' || humanConfirmation === 'yes') &&
        process.env.SKIP_HITL === 'true';

      if (!isLegacyDevBypass) {
        throw new BadRequestException(
          'Operación destructiva rechazada. Se requiere un Action Challenge Token firmado. Solicite un token primero en POST /api/jarbees/security/challenge con actionType="LIBRARY_DELETE_DOCUMENT" y targetId=' + id,
        );
      }
    } else {
      // Validar y consumir el token de un solo uso (Anti-Replay)
      this.actionGatekeeper.verifyAndConsumeChallenge(
        token,
        'LIBRARY_DELETE_DOCUMENT',
        id,
      );
    }

    // Audit before performing destructive action
    await this.auditService.log('deleteDocument.request', {
      id,
      by: 'api',
      tokenVerified: Boolean(token),
    });

    await this.documentRepo.deleteDocument(id);

    await this.auditService.log('deleteDocument.success', { id, by: 'api' });
    return {
      success: true,
      message: `Documento #${id} eliminado con autorización confirmada.`,
    };
  }

  @Public()
  @Post('library/document/:id/approve')
  @ApiOperation({
    summary:
      'Aprobar un documento en cuarentena e iniciar su indexación jerárquica',
  })
  async approveDocument(@Param('id', ParseIntPipe) id: number) {
    await this.auditService.log('approveDocument.request', { id });
    await this.ingestService.approveDocument(id);
    await this.auditService.log('approveDocument.success', { id });
    return {
      success: true,
      message:
        'Documento aprobado. Indexación jerárquica e incremental iniciada en segundo plano.',
    };
  }

  @Public()
  @Get('library/stats')
  @ApiOperation({
    summary:
      'Estadísticas de la biblioteca (docs, chunks, categorías, top usados)',
  })
  async libraryStats() {
    return this.documentRepo.getLibraryStats();
  }

  @Public()
  @Post('library/category-summary')
  @ApiOperation({
    summary: 'Generar resumen inteligente por categoría',
    description:
      'Combina información de múltiples documentos de una categoría específica y genera un resumen coherente. ' +
      'Ejemplo: categoría="plantas_medicinales" con query="propiedades curativas" → resumen basado en todos los PDFs sobre plantas medicinales.',
  })
  async categorySummary(
    @Body() body: { category: string; query?: string; maxChunks?: number },
  ) {
    const result = await this.categorySummaryService.generateCategorySummary(
      body.category,
      body.query,
      body.maxChunks,
    );
    return { success: true, ...result };
  }

  @Public()
  @Post('library/document-summary')
  @ApiOperation({
    summary: 'Generar resumen detallado de un documento específico',
    description:
      'Genera un resumen ejecutivo y extrae los puntos clave (top 10) de un documento individual. ' +
      'Busca el documento por título (fuzzy match) o ID numérico. ' +
      'Ejemplos: "Manual de Plantas Medicinales", "TypeScript Handbook", o ID: 123',
  })
  async documentSummary(
    @Body() body: { titleOrId: string | number; maxKeyPoints?: number },
  ) {
    const result = await this.documentSummaryService.generateDocumentSummary(
      body.titleOrId,
      body.maxKeyPoints || 10,
    );
    return { success: true, ...result };
  }

  // ── Diagnóstico y Validación de Conocimiento RAG ─────────────────────────

  @Public()
  @Get('library/diagnostic')
  @ApiOperation({
    summary: 'Diagnóstico completo de la biblioteca RAG',
    description:
      'Retorna estadísticas detalladas: total de documentos, chunks indexados, ' +
      'categorías, documentos más consultados, documentos sin chunks (posible error de ingesta) ' +
      'y recomendaciones para mejorar la cobertura del RAG.',
  })
  async libraryDiagnostic() {
    const diag = await this.knowledgeTestService.getLibraryDiagnostic();
    const formatted = this.knowledgeTestService.formatDiagnostic(diag);
    return { success: true, diagnostic: diag, formatted };
  }

  @Public()
  @Post('library/knowledge-test')
  @ApiOperation({
    summary: 'Validación automática del RAG con N pruebas',
    description:
      'Para cada documento testeado: genera una pregunta de prueba con el LLM, ' +
      'ejecuta la búsqueda RAG y verifica si recuperó el documento correcto. ' +
      'Retorna tasa de éxito y diagnóstico por documento. Body: { numTests?: number }',
  })
  async runKnowledgeTest(@Body() body: { numTests?: number }) {
    const result = await this.knowledgeTestService.runKnowledgeValidation(
      body.numTests ?? 3,
    );
    return { success: true, ...result };
  }

  @Public()
  @Post('library/probe')
  @ApiOperation({
    summary: 'Inspeccionar qué chunks recupera el RAG para una consulta',
    description:
      'Ejecuta la búsqueda de chunks con la consulta dada y retorna los N resultados más relevantes ' +
      'con título del documento, categoría y snippet del contenido. ' +
      'Útil para debuggear por qué el asistente no encontró algo. Body: { query: string, limit?: number }',
  })
  async probeRag(@Body() body: { query: string; limit?: number }) {
    if (!body.query) throw new BadRequestException('Se requiere una query');
    const result = await this.knowledgeTestService.probeRag(
      body.query,
      body.limit ?? 8,
    );
    const formatted = this.knowledgeTestService.formatProbeResult(result);
    return { success: true, ...result, formatted };
  }

  // ── JarBees General Intelligence Trials (Edición 1.0) ──────────────────────

  @Public()
  @Get('trials/spec')
  @ApiOperation({
    summary: 'Especificación completa del banco de pruebas (12 categorías, 36 preguntas, rúbricas)',
  })
  getTrialsSpec() {
    const spec = this.trialsService.getTrialsSpec();
    return { success: true, spec };
  }

  @Public()
  @Get('trials/history')
  @ApiOperation({
    summary: 'Historial de ejecuciones y puntuaciones del banco de pruebas guardadas en disco',
  })
  getTrialsHistory() {
    const history = this.trialsService.getTrialsHistory();
    return { success: true, count: history.length, history };
  }

  @Public()
  @Post('trials/run')
  @ApiOperation({
    summary: 'Ejecutar banco de pruebas de inteligencia general y calibración',
    description:
      'Ejecuta la batería de pruebas (total o filtrada por categoría/nivel) con scoring en 5 dimensiones ' +
      'y persistencia incremental obligatoria en disco (.json y .txt). Body: { category?: string|number, level?: number, limit?: number, withFollowUp?: boolean, model?: string }',
  })
  async runTrials(
    @Body()
    body: {
      category?: string | number;
      level?: number;
      limit?: number;
      withFollowUp?: boolean;
      model?: string;
    },
  ) {
    const summary = await this.trialsService.runTrials(body || {});
    const formatted = this.trialsService.formatSummaryForChat(summary);
    return { success: true, summary, formatted };
  }

  // ── Biblioteca — Synthesis Pipeline (Map-Reduce) ───────────────────────────

  @Public()
  @Post('library/synthesis/document')
  @ApiOperation({
    summary: 'Generar o actualizar ficha narrativa de un documento (map-reduce)',
    description:
      'Ejecuta el pipeline de síntesis estructurada sobre un documento ya indexado. ' +
      'Extrae: resumen ejecutivo, historias destacadas, personajes, conceptos clave, ' +
      'citas y técnicas prácticas. Guarda en DocumentInsight para consulta directa. ' +
      'Body: { documentId: number, collection?: string, force?: boolean }',
  })
  async synthesizeDocument(
    @Body() body: { documentId: number; collection?: string; force?: boolean },
  ) {
    if (!body.documentId) throw new BadRequestException('Se requiere documentId');
    const result = await this.synthesisService.synthesizeDocument(
      body.documentId,
      body.collection,
      body.force ?? false,
    );
    return { success: result.status !== 'error', ...result };
  }

  @Public()
  @Post('library/synthesis/collection')
  @ApiOperation({
    summary: 'Sintetizar todos los libros de una colección (map-reduce)',
    description:
      'Procesa todos los documentos de una colección temática de forma secuencial. ' +
      'Al finalizar genera una comparación cross-autor si hay 2 o más libros. ' +
      'Body: { collection: string, force?: boolean } — collection ej: "plano_astral"',
  })
  async synthesizeCollection(
    @Body() body: { collection: string; force?: boolean },
  ) {
    if (!body.collection) throw new BadRequestException('Se requiere collection');
    const result = await this.synthesisService.synthesizeCollection(
      body.collection,
      body.force ?? false,
    );
    return { success: true, ...result };
  }

  @Public()
  @Post('library/synthesis/query')
  @ApiOperation({
    summary: 'Consultar insights pre-computados por colección o autor',
    description:
      'Recupera fichas narrativas pre-computadas sin búsqueda vectorial. ' +
      'Ideal para: "dame las mejores historias de Monroe" o "qué técnicas enseña Leadbeater". ' +
      'Body: { collection?: string, author?: string, field?: "highlightedStories|keyCharacters|coreConcepts|notableQuotes|practicalTechniques", limit?: number }',
  })
  async queryInsights(
    @Body() body: {
      collection?: string;
      author?: string;
      field?: 'highlightedStories' | 'keyCharacters' | 'coreConcepts' | 'notableQuotes' | 'practicalTechniques';
      limit?: number;
    },
  ) {
    const results = await this.synthesisService.queryInsights(body);
    return { success: true, count: results.length, results };
  }

  // ── Biblioteca — Colecciones ────────────────────────────────────────────────

  @Public()
  @Post('library/collection')
  @ApiOperation({ summary: 'Crear una colección temática' })
  async createCollection(
    @Body()
    body: {
      name: string;
      description?: string;
      color?: string;
      icon?: string;
    },
  ) {
    const collection = await this.collectionRepo.create(body);
    return { success: true, collection };
  }

  @Public()
  @Get('library/collection')
  @ApiOperation({
    summary: 'Listar todas las colecciones con conteo de documentos',
  })
  async listCollections() {
    const collections = await this.collectionRepo.findAll();
    return { collections };
  }

  @Public()
  @Get('library/collection/:id')
  @ApiOperation({ summary: 'Ver colección con sus documentos' })
  async getCollection(@Param('id', ParseIntPipe) id: number) {
    const collection = await this.collectionRepo.findById(id);
    return { collection };
  }

  @Public()
  @Patch('library/collection/:id')
  @ApiOperation({ summary: 'Actualizar una colección' })
  async updateCollection(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
    },
  ) {
    const collection = await this.collectionRepo.update(id, body);
    return { success: true, collection };
  }

  @Public()
  @Delete('library/collection/:id')
  @ApiOperation({ summary: 'Eliminar una colección' })
  async deleteCollection(@Param('id', ParseIntPipe) id: number) {
    await this.collectionRepo.delete(id);
    return { success: true };
  }

  @Public()
  @Post('library/collection/:id/document/:docId')
  @ApiOperation({ summary: 'Agregar documento a una colección' })
  async addDocumentToCollection(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    const entry = await this.collectionRepo.addDocument(id, docId);
    return { success: true, entry };
  }

  @Public()
  @Delete('library/collection/:id/document/:docId')
  @ApiOperation({ summary: 'Quitar documento de una colección' })
  async removeDocumentFromCollection(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    await this.collectionRepo.removeDocument(id, docId);
    return { success: true };
  }

  // ── Browser Tool ────────────────────────────────────────────────────────────

  @Public()
  @Post('browser/fetch')
  @ApiOperation({
    summary: 'Extraer contenido de una URL (axios → Playwright si es SPA)',
  })
  async browserFetch(@Body() body: { url: string }) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.jarvisService.fetchUrl(body.url);
    return { success: true, ...result };
  }

  @Public()
  @Post('browser/navigate')
  @ApiOperation({
    summary:
      'Navegar a una URL con Playwright (JavaScript renderizado, screenshot opcional)',
  })
  async browserNavigate(
    @Body() body: { url: string; screenshot?: boolean; waitFor?: string },
  ) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.jarvisService.navigateUrl(body.url, {
      screenshot: body.screenshot,
      waitFor: body.waitFor,
    });
    return { success: true, ...result };
  }

  @Public()
  @Post('browser/search')
  @ApiOperation({
    summary: 'Buscar en Google y devolver resultados con título, URL y snippet',
  })
  async browserSearch(@Body() body: { query: string; limit?: number }) {
    if (!body.query)
      throw new BadRequestException('Se requiere una query de búsqueda');
    const results = await this.jarvisService.webSearch(
      body.query,
      body.limit ?? 5,
    );
    return { success: true, results };
  }

  @Public()
  @Post('investigate')
  @ApiOperation({
    summary: 'Investigar una URL y convertirla en conocimiento consultable',
  })
  async investigateUrl(@Body() body: { url: string; sessionId?: string }) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.investigationService.investigateUrl(
      body.url,
      body.sessionId,
    );
    return { success: true, ...result };
  }

  @Public()
  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario' })
  async getProfile() {
    const profile = await this.jarvisService.getProfile();
    return { profile };
  }

  @Public()
  @Patch('profile')
  @Public()
  @ApiOperation({ summary: 'Actualizar perfil del usuario' })
  async updateProfile(
    @Body()
    body: {
      name?: string;
      timezone?: string;
      country?: string;
      language?: string;
      preferences?: Record<string, any>;
    },
  ) {
    const profile = await this.jarvisService.updateProfile(body);
    return { success: true, profile };
  }

  // ── Observabilidad ──────────────────────────────────────────────────────────

  @Public()
  @Get('observability/stats')
  @ApiOperation({
    summary: 'Estadísticas de uso (herramientas, latencia, éxitos)',
  })
  async getStats() {
    return this.jarvisService.getObservabilityStats();
  }

  @Public()
  @Get('observability/runs')
  @ApiOperation({ summary: 'Runs recientes del agente' })
  async getRecentRuns(@Query('limit') limit?: string) {
    const runs = await this.jarvisService.getRecentRuns(
      limit ? parseInt(limit, 10) : 50,
    );
    return { runs };
  }

  @Public()
  @Get('observability/explain/:runId')
  @ApiOperation({ 
    summary: 'Explicar proceso cognitivo de una ejecución',
    description: 'Muestra el recorrido real: intent, chunks recuperados, auditoría, síntesis, afirmaciones y evidencia.'
  })
  async explainReasoning(@Param('runId', ParseIntPipe) runId: number) {
    const trace = await this.jarvisService.explainReasoning(runId);
    if (!trace) {
      throw new BadRequestException(`No se encontró AgentRun #${runId}`);
    }
    return { success: true, trace };
  }

  @Public()
  @Get('observability/cognitive-stats')
  @ApiOperation({ 
    summary: 'Estadísticas de observabilidad cognitiva',
    description: 'Tasa de uso RAG, motor dialéctico, cobertura promedio, afirmaciones por estado.'
  })
  async getCognitiveStats() {
    const stats = await this.jarvisService.getCognitiveStats();
    return { success: true, stats };
  }

  // ── Jarvis config y registro ──────────────────────────────────────────────

  @Public()
  @Get('identity')
  @ApiOperation({ summary: 'Obtener identidad de Jarvis' })
  async getIdentity() {
    return { identity: await this.jarvisService.getIdentity() };
  }

  @Public()
  @Get('capabilities')
  @ApiOperation({ summary: 'Obtener capacidades activas de Jarvis' })
  async getCapabilities() {
    return { capabilities: await this.jarvisService.getCapabilities() };
  }

  @Public()
  @Get('skills')
  @ApiOperation({ summary: 'Listar todas las skills cargadas' })
  async listSkills() {
    return { skills: await this.jarvisService.listSkills() };
  }

  @Public()
  @Get('skills/relevant')
  @ApiOperation({ summary: 'Buscar skills relevantes para una consulta' })
  async findRelevantSkills(@Query('q') query: string) {
    return { skills: await this.jarvisService.findRelevantSkills(query) };
  }

  @Public()
  @Get('tools')
  @ApiOperation({ summary: 'Listar herramientas habilitadas' })
  async listTools() {
    return { tools: await this.jarvisService.listTools() };
  }

  // ── Knowledge Evolution ─────────────────────────────────────────────────

  @Public()
  @Get('evolution')
  @ApiOperation({
    summary: 'Consultar cómo evolucionó un tema',
    description:
      'Retorna la línea de tiempo de un tema con narración del LLM. ' +
      'Ejemplo: GET /jarbees/evolution?topic=Qwen\n' +
      'Responde: hace 6 meses preferías X, ahora usás Y porque...',
  })
  async getEvolution(
    @Query('topic') topic: string,
    @Query('days') days?: string,
  ) {
    if (!topic)
      throw new BadRequestException('Se requiere un topic. Ej: ?topic=Qwen');
    const limitDays = days ? parseInt(days, 10) : 365;
    const report = await this.knowledgeEvolution.getEvolution(topic, limitDays);
    if (!report) {
      return {
        success: false,
        message: `No hay registros sobre "${topic}" en los últimos ${limitDays} días. Segui hablando con JarBees y pronto habrá historial.`,
      };
    }
    return { success: true, report };
  }

  @Public()
  @Get('evolution/topics')
  @ApiOperation({
    summary: 'Listar todos los temas registrados',
    description:
      'Retorna los temas más frecuentes con fecha del último registro.',
  })
  async listEvolutionTopics() {
    const topics = await this.knowledgeEvolution.listTopics();
    return { success: true, topics };
  }

  // ── Visión / Multimodal ─────────────────────────────────────────────────────

  @Public()
  @Post('vision/analyze')
  @ApiOperation({
    summary: 'Analizar imagen con Qwen2.5-VL (OCR, errores, diagramas)',
    description:
      'Acepta una imagen (PNG/JPG/WEBP) y una pregunta opcional. ' +
      'Modes: general | ocr | error | diagram | document. ' +
      'Si se combina con sessionId, el resultado se guarda en el historial de conversación.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        question: {
          type: 'string',
          description: 'Pregunta sobre la imagen (opcional)',
        },
        mode: {
          type: 'string',
          enum: ['general', 'ocr', 'error', 'diagram', 'document'],
        },
        sessionId: {
          type: 'string',
          description: 'Para guardar en historial de conversación',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async analyzeImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { question?: string; mode?: string; sessionId?: string },
  ) {
    if (!file)
      throw new BadRequestException('Se requiere un archivo de imagen');

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        'Formato no soportado. Usá PNG, JPG, WEBP o GIF.',
      );
    }

    const imageBase64 = file.buffer.toString('base64');
    const mode = (body.mode ?? 'general') as
      | 'general'
      | 'ocr'
      | 'error'
      | 'diagram'
      | 'document';

    const result = await this.visionService.analyze(
      imageBase64,
      body.question,
      mode,
    );

    // Si hay sessionId, guardar la interacción en el historial de conversación
    if (body.sessionId) {
      const userMsg = body.question
        ? `[Imagen adjunta] ${body.question}`
        : `[Imagen adjunta — análisis: ${mode}]`;

      await this.conversationRepo.create({
        sessionId: body.sessionId,
        role: 'user',
        content: userMsg,
        metadata: {
          source: 'vision',
          filename: file.originalname,
          mimetype: file.mimetype,
        },
      });
      await this.conversationRepo.create({
        sessionId: body.sessionId,
        role: 'assistant',
        content: result.text,
        metadata: {
          source: 'vision',
          model: result.model,
          latencyMs: result.latencyMs,
        },
      });
    }

    return {
      success: true,
      answer: result.text,
      model: result.model,
      latencyMs: result.latencyMs,
      detectedLanguage: result.detectedLanguage,
    };
  }

  @Public()
  @Post('vision/ocr')
  @ApiOperation({
    summary: 'OCR rápido — extrae solo el texto de una imagen o PDF escaneado',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async ocrImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Se requiere un archivo');
    const imageBase64 = file.buffer.toString('base64');
    const text = await this.visionService.extractText(imageBase64);
    return { success: true, text };
  }

  // ── Voz & Procesamiento de Audio (Opus CLI + SAPI STT/TTS) ───────────────────

  @Public()
  @Get('voice/status')
  @ApiOperation({
    summary: 'Estado del motor de voz (Opus CLI, Windows SAPI STT y TTS Helena)',
  })
  async getVoiceStatus() {
    return this.voiceService.getStatus();
  }

  @Public()
  @Post('voice/transcribe')
  @ApiOperation({
    summary: 'Transcribir nota de voz (Opus, OGG, WebM o WAV) a texto',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { audio: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('audio'))
  async transcribeVoice(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo de audio en el campo "audio"');
    }
    try {
      const result = await this.voiceService.processAudioToText(
        file.buffer,
        file.originalname || 'audio.opus',
      );
      return { success: true, ...result };
    } catch (error) {
      this.logger.error(`Error transcribiendo voz: ${error.message}`);
      return {
        success: false,
        text: '',
        confidence: 0,
        durationMs: 0,
        engine: 'error',
        error: error.message,
      };
    }
  }

  @Public()
  @Post('voice/chat')
  @ApiOperation({
    summary: 'Enviar nota de voz directamente al chat de JarBees',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: { type: 'string', format: 'binary' },
        sessionId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('audio'))
  async voiceChat(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionIdBody?: string,
    @Headers('x-session-id') sessionIdHeader?: string,
    @Headers('x-user-id') userId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo de audio en el campo "audio"');
    }

    try {
      const transcription = await this.voiceService.processAudioToText(
        file.buffer,
        file.originalname || 'audio.opus',
      );

      if (!transcription.text || transcription.text.trim().length === 0) {
        return {
          success: false,
          transcription: '',
          confidence: 0,
          answer:
            'No pude distinguir palabras en el audio grabado. ¿Podrías grabarlo de nuevo más cerca del micrófono o escribir tu consulta?',
        };
      }

      const sessionId = sessionIdBody || sessionIdHeader || randomUUID();
      const answer = await this.jarvisService.query(transcription.text, {
        sessionId,
      });

      return {
        success: true,
        transcription: transcription.text,
        confidence: transcription.confidence,
        transcriptionDurationMs: transcription.durationMs,
        answer,
        sessionId,
      };
    } catch (error) {
      this.logger.error(`Error en voiceChat: ${error.message}`);
      return {
        success: false,
        transcription: '',
        confidence: 0,
        answer: `Ocurrió un inconveniente al procesar la nota de voz: ${error.message}. Por favor intentá nuevamente o enviá el mensaje por texto.`,
        error: error.message,
      };
    }
  }

  @Public()
  @Post('voice/speak')
  @ApiOperation({
    summary: 'Sintetizar texto a voz WAV (TTS) con voz Helena en español',
  })
  async speakText(@Body('text') text: string, @Res() res: Response) {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Se requiere texto a sintetizar');
    }
    const audioBuffer = await this.voiceService.synthesizeSpeech(text);
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length.toString(),
      'Content-Disposition': 'inline; filename="jarbees_voice.wav"',
    });
    res.end(audioBuffer);
  }

  @Public()
  @Get('library/:id/audiobook')
  @ApiOperation({
    summary: 'Generar y descargar audiolibro narrado de un documento o síntesis de la biblioteca',
  })
  async getDocumentAudiobook(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const doc = await this.documentRepo.findById(id);
    if (!doc) {
      throw new BadRequestException(`Documento con ID ${id} no encontrado`);
    }

    const insight = await this.synthesisService.getInsight(id);
    let narrationText = '';

    if (insight) {
      narrationText = [
        `Audiolibro del libro: ${doc.title}. ${insight.author ? `Por ${insight.author}.` : ''}`,
        `Resumen Ejecutivo: ${insight.executiveSummary}`,
        insight.centralThesis ? `Tesis Central: ${insight.centralThesis}` : '',
        insight.coreConcepts && insight.coreConcepts.length > 0
          ? `Conceptos fundamentales: ${insight.coreConcepts.join('. ')}.`
          : '',
        insight.notableQuotes && insight.notableQuotes.length > 0
          ? `Citas destacadas: ${insight.notableQuotes.join('. ')}.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    } else {
      narrationText = `Audiolibro de ${doc.title}. ${doc.content ? doc.content.slice(0, 2000) : 'Sin contenido disponible.'}`;
    }

    const audioBuffer = await this.voiceService.generateAudiobook(narrationText, {
      title: doc.title,
      author: insight?.author,
    });

    const safeTitle = (doc.title || 'audiolibro')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .substring(0, 40);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length.toString(),
      'Content-Disposition': `attachment; filename="${safeTitle}_audiolibro.wav"`,
    });
    res.end(audioBuffer);
  }

  // ── Ingesta Inversa de Audiolibros ──────────────────────────────────────────

  @Public()
  @Get('audiobooks')
  @ApiOperation({
    summary: 'Listar audiolibros encontrados en I:\\Musica\\Audiolibros y mas',
  })
  async listAudiobooks() {
    const items = await this.audiobookIngestService.listAvailableAudiobooks();
    return {
      success: true,
      total: items.length,
      audiobooks: items,
    };
  }

  @Public()
  @Post('audiobooks/ingest')
  @ApiOperation({
    summary: 'Transcribir e ingestar un audiolibro a la base de datos de conocimiento de JarBees',
  })
  async ingestAudiobook(
    @Body() body: { filePath: string; category?: string },
  ) {
    if (!body.filePath) {
      throw new BadRequestException('Se requiere "filePath" del archivo de audiolibro a ingestar');
    }
    const result = await this.audiobookIngestService.ingestAudiobook(
      body.filePath,
      body.category,
    );
    return result;
  }

  @Public()
  @Post('audiobooks/ingest-all')
  @ApiOperation({
    summary: 'Ingesta por lotes de todos los audiolibros disponibles en I:\\Musica\\Audiolibros y mas',
  })
  async ingestAllAudiobooks(
    @Body() body?: { skipPureAmbient?: boolean; maxFiles?: number },
  ) {
    const result = await this.audiobookIngestService.ingestAllAvailableAudiobooks(body);
    return {
      success: true,
      ...result,
    };
  }

  // ── Observabilidad Cognitiva & Motor Dialéctico (Fases 1, 2 y 3) ───────────────

  @Public()
  @Get('explain/:runId')
  @ApiOperation({
    summary: 'Explicabilidad cognitiva forense de un AgentRun',
    description:
      'Muestra el recorrido real del proceso cognitivo: enrutamiento, chunks recuperados, fase de auditoría, síntesis dialéctica y desglose de claims con evidencias.',
  })
  async explainRun(@Param('runId', ParseIntPipe) runId: number) {
    const explanation = await this.jarvisService.explainRun(runId);
    if (!explanation) {
      throw new BadRequestException(`No se encontró AgentRun con ID #${runId}`);
    }
    return {
      success: true,
      data: explanation,
    };
  }

  @Public()
  @Get('runs')
  @ApiOperation({
    summary: 'Listar ejecuciones recientes de JarBees con métricas cognitivas',
  })
  async getAgentRuns(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const runs = await this.jarvisService.getRecentRuns(parsedLimit);
    return {
      success: true,
      count: runs.length,
      runs,
    };
  }

  @Public()
  @Get('cognitive/stats')
  @ApiOperation({
    summary: 'Estadísticas globales de observabilidad y calibración cognitiva',
  })
  async getGlobalCognitiveStats() {
    const stats = await this.jarvisService.getCognitiveStats();
    return {
      success: true,
      stats,
    };
  }

  @Public()
  @Post('runs/:runId/claims/:claimId/evaluate')
  @ApiOperation({
    summary: 'Evaluar y calibrar una afirmación individual de un run (Fase 3)',
  })
  async evaluateClaim(
    @Param('runId', ParseIntPipe) runId: number,
    @Param('claimId', ParseIntPipe) claimId: number,
    @Body()
    body: {
      status?: 'supported' | 'contradicted' | 'partially_supported' | 'inference' | 'speculative' | 'unverified';
      limitations?: string[];
      notes?: string;
    },
  ) {
    try {
      const updated = await this.jarvisService.evaluateRunClaim(runId, claimId, body);
      return {
        success: true,
        claim: updated,
      };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }
}
