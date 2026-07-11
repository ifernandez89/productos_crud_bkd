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
} from '@nestjs/common';
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
import { randomUUID } from 'crypto';
import { Public } from '../auth/public.decorator';

@ApiTags('jarbees')
@Controller('jarbees')
export class JarvisController {
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
  ) {}

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
    description: 'Devuelve los últimos N mensajes de la sesión. El frontend puede usarlo para reconstruir el chat al recargar.',
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

  // ── Query principal ─────────────────────────────────────────────────────────

  @Public()
  @Post('query')
  @ApiOperation({ summary: 'Consultar a Jarvis' })
  async query(
    @Body()
    body: {
      message: string;
      sessionId?: string;
      provider?: 'ollama' | 'openrouter';
    },
  ) {
    const answer = await this.jarvisService.query(body.message, {
      sessionId: body.sessionId,
      provider: body.provider,
    });
    return { answer, sessionId: body.sessionId };
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
  async createPlan(
    @Body() body: { objective: string; sessionId?: string },
  ) {
    if (!body.objective) throw new BadRequestException('Se requiere un objetivo');
    const plan = await this.plannerService.createPlan(body.objective, body.sessionId);
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
  async executePlan(
    @Body() body: { objective: string; sessionId?: string },
  ) {
    if (!body.objective) throw new BadRequestException('Se requiere un objetivo');
    const result = await this.plannerService.createAndExecute(body.objective, body.sessionId);
    return { success: true, ...result };
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  @Public()
  @Get('dashboard')
  @ApiOperation({ summary: 'Estadísticas del sistema: memorias, documentos, colecciones, conversaciones' })
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
    body: { title: string; content: string; category?: string; source?: string },
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
        file:      { type: 'string', format: 'binary' },
        title:     { type: 'string' },
        category:  { type: 'string' },
        source:    { type: 'string' },
        question:  { type: 'string', description: 'Pregunta sobre el contenido del PDF (opcional, si no se envía se genera un resumen)' },
        sessionId: { type: 'string', description: 'Para guardar la respuesta en el historial de conversación' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async ingestPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; category?: string; source?: string; question?: string; sessionId?: string },
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo PDF');
    if (!file.mimetype.includes('pdf')) {
      throw new BadRequestException('El archivo debe ser un PDF');
    }
    const title = body.title || file.originalname.replace(/\.pdf$/i, '');
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
  @ApiOperation({ summary: 'Ingerir contenido desde una URL (Scraping simple)' })
  async ingestUrl(
    @Body() body: { url: string; category?: string },
  ) {
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

  @Public()
  @Delete('library/document/:id')
  @ApiOperation({ summary: 'Eliminar un documento' })
  async deleteDocument(@Param('id', ParseIntPipe) id: number) {
    await this.documentRepo.deleteDocument(id);
    return { success: true };
  }

  @Public()
  @Get('library/stats')
  @ApiOperation({ summary: 'Estadísticas de la biblioteca (docs, chunks, categorías, top usados)' })
  async libraryStats() {
    return this.documentRepo.getLibraryStats();
  }

  @Public()
  @Post('library/category-summary')
  @ApiOperation({ 
    summary: 'Generar resumen inteligente por categoría',
    description: 'Combina información de múltiples documentos de una categoría específica y genera un resumen coherente. ' +
                 'Ejemplo: categoría="plantas_medicinales" con query="propiedades curativas" → resumen basado en todos los PDFs sobre plantas medicinales.'
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
    description: 'Genera un resumen ejecutivo y extrae los puntos clave (top 10) de un documento individual. ' +
                 'Busca el documento por título (fuzzy match) o ID numérico. ' +
                 'Ejemplos: "Manual de Plantas Medicinales", "TypeScript Handbook", o ID: 123'
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

  // ── Biblioteca — Colecciones ────────────────────────────────────────────────

  @Public()
  @Post('library/collection')
  @ApiOperation({ summary: 'Crear una colección temática' })
  async createCollection(
    @Body() body: { name: string; description?: string; color?: string; icon?: string },
  ) {
    const collection = await this.collectionRepo.create(body);
    return { success: true, collection };
  }

  @Public()
  @Get('library/collection')
  @ApiOperation({ summary: 'Listar todas las colecciones con conteo de documentos' })
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
    @Body() body: { name?: string; description?: string; color?: string; icon?: string },
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
    @Param('id',    ParseIntPipe) id:    number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    const entry = await this.collectionRepo.addDocument(id, docId);
    return { success: true, entry };
  }

  @Public()
  @Delete('library/collection/:id/document/:docId')
  @ApiOperation({ summary: 'Quitar documento de una colección' })
  async removeDocumentFromCollection(
    @Param('id',    ParseIntPipe) id:    number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    await this.collectionRepo.removeDocument(id, docId);
    return { success: true };
  }

  // ── Browser Tool ────────────────────────────────────────────────────────────

  @Public()
  @Post('browser/fetch')
  @ApiOperation({ summary: 'Extraer contenido de una URL (axios → Playwright si es SPA)' })
  async browserFetch(@Body() body: { url: string }) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.jarvisService.fetchUrl(body.url);
    return { success: true, ...result };
  }

  @Public()
  @Post('browser/navigate')
  @ApiOperation({ summary: 'Navegar a una URL con Playwright (JavaScript renderizado, screenshot opcional)' })
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
  @ApiOperation({ summary: 'Buscar en Google y devolver resultados con título, URL y snippet' })
  async browserSearch(
    @Body() body: { query: string; limit?: number },
  ) {
    if (!body.query) throw new BadRequestException('Se requiere una query de búsqueda');
    const results = await this.jarvisService.webSearch(body.query, body.limit ?? 5);
    return { success: true, results };
  }

  @Public()
  @Post('investigate')
  @ApiOperation({ summary: 'Investigar una URL y convertirla en conocimiento consultable' })
  async investigateUrl(@Body() body: { url: string; sessionId?: string }) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.investigationService.investigateUrl(body.url, body.sessionId);
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
  @ApiOperation({ summary: 'Estadísticas de uso (herramientas, latencia, éxitos)' })
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
    if (!topic) throw new BadRequestException('Se requiere un topic. Ej: ?topic=Qwen');
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
    description: 'Retorna los temas más frecuentes con fecha del último registro.',
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
        file:      { type: 'string', format: 'binary' },
        question:  { type: 'string', description: 'Pregunta sobre la imagen (opcional)' },
        mode:      { type: 'string', enum: ['general', 'ocr', 'error', 'diagram', 'document'] },
        sessionId: { type: 'string', description: 'Para guardar en historial de conversación' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async analyzeImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { question?: string; mode?: string; sessionId?: string },
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo de imagen');

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Formato no soportado. Usá PNG, JPG, WEBP o GIF.');
    }

    const imageBase64 = file.buffer.toString('base64');
    const mode = (body.mode ?? 'general') as 'general' | 'ocr' | 'error' | 'diagram' | 'document';

    const result = await this.visionService.analyze(imageBase64, body.question, mode);

    // Si hay sessionId, guardar la interacción en el historial de conversación
    if (body.sessionId) {
      const userMsg = body.question
        ? `[Imagen adjunta] ${body.question}`
        : `[Imagen adjunta — análisis: ${mode}]`;

      await this.conversationRepo.create({
        sessionId: body.sessionId,
        role: 'user',
        content: userMsg,
        metadata: { source: 'vision', filename: file.originalname, mimetype: file.mimetype },
      });
      await this.conversationRepo.create({
        sessionId: body.sessionId,
        role: 'assistant',
        content: result.text,
        metadata: { source: 'vision', model: result.model, latencyMs: result.latencyMs },
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
}
