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
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JarvisService } from './jarvis.service';
import { FeedbackDto } from './dto/feedback.dto';
import { CollectionRepository } from './repositories/collection.repository';
import { DocumentRepository } from './repositories/document.repository';
import { DocumentIngestService } from './library/document-ingest.service';
import { DashboardService } from './library/dashboard.service';
import { PlannerService } from './planner/planner.service';

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
  ) {}

  // ── Query principal ─────────────────────────────────────────────────────────

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

  @Post('feedback')
  @ApiOperation({ summary: 'Registrar feedback de una respuesta de Jarvis' })
  async saveFeedback(@Body() body: FeedbackDto) {
    const feedback = await this.jarvisService.saveFeedback(body);
    return { success: true, feedback };
  }

  // ── Planner ─────────────────────────────────────────────────────────────────

  @Post('planner')
  @ApiOperation({ summary: 'Crear un plan de tareas a partir de un objetivo' })
  async createPlan(
    @Body() body: { objective: string; sessionId?: string },
  ) {
    if (!body.objective) throw new BadRequestException('Se requiere un objetivo');
    const plan = await this.plannerService.createPlan(body.objective, body.sessionId);
    return { success: true, plan };
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Estadísticas del sistema: memorias, documentos, colecciones, conversaciones' })
  async getDashboard() {
    return this.dashboardService.getStats();
  }

  // ── Memoria ─────────────────────────────────────────────────────────────────

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

  @Get('memory/:id')
  @ApiOperation({ summary: 'Recuperar una memoria por ID' })
  async getMemory(@Param('id', ParseIntPipe) id: number) {
    const memory = await this.jarvisService.recallMemory(id);
    return { memory };
  }

  @Get('memory')
  @ApiOperation({ summary: 'Listar todas las memorias' })
  async listMemories() {
    const memories = await this.jarvisService.listMemories();
    return { memories };
  }

  // ── Biblioteca — Documentos ─────────────────────────────────────────────────

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

  @Post('library/document/pdf')
  @ApiOperation({ summary: 'Subir e ingerir un PDF a la biblioteca' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file:     { type: 'string', format: 'binary' },
        title:    { type: 'string' },
        category: { type: 'string' },
        source:   { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async ingestPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; category?: string; source?: string },
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo PDF');
    if (!file.mimetype.includes('pdf')) {
      throw new BadRequestException('El archivo debe ser un PDF');
    }
    const title = body.title || file.originalname.replace('.pdf', '');
    const result = await this.ingestService.ingestPdf(
      file.buffer,
      title,
      body.category,
      body.source,
    );
    return { success: true, ...result };
  }

  @Post('library/document/url')
  @ApiOperation({ summary: 'Ingerir contenido desde una URL (Scraping simple)' })
  async ingestUrl(
    @Body() body: { url: string; category?: string },
  ) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.ingestService.ingestUrl(body.url, body.category);
    return { success: true, ...result };
  }

  @Get('library/document')
  @ApiOperation({ summary: 'Listar documentos de la biblioteca' })
  async listDocuments(@Query('category') category?: string) {
    const documents = await this.documentRepo.findDocuments(category);
    return { documents };
  }

  @Get('library/document/search')
  @ApiOperation({ summary: 'Buscar en documentos' })
  async searchDocuments(@Query('q') query: string) {
    const documents = await this.documentRepo.searchDocuments(query);
    return { documents };
  }

  @Get('library/document/recent')
  @ApiOperation({ summary: 'Documentos más recientes' })
  async recentDocuments(@Query('limit') limit?: string) {
    const documents = await this.documentRepo.getMostRecentDocuments(
      limit ? parseInt(limit, 10) : 10,
    );
    return { documents };
  }

  @Get('library/document/:id')
  @ApiOperation({ summary: 'Obtener documento con sus chunks' })
  async getDocument(@Param('id', ParseIntPipe) id: number) {
    const document = await this.documentRepo.getDocumentWithChunks(id);
    return { document };
  }

  @Delete('library/document/:id')
  @ApiOperation({ summary: 'Eliminar un documento' })
  async deleteDocument(@Param('id', ParseIntPipe) id: number) {
    await this.documentRepo.deleteDocument(id);
    return { success: true };
  }

  @Get('library/stats')
  @ApiOperation({ summary: 'Estadísticas de la biblioteca (docs, chunks, categorías, top usados)' })
  async libraryStats() {
    return this.documentRepo.getLibraryStats();
  }

  // ── Biblioteca — Colecciones ────────────────────────────────────────────────

  @Post('library/collection')
  @ApiOperation({ summary: 'Crear una colección temática' })
  async createCollection(
    @Body() body: { name: string; description?: string; color?: string; icon?: string },
  ) {
    const collection = await this.collectionRepo.create(body);
    return { success: true, collection };
  }

  @Get('library/collection')
  @ApiOperation({ summary: 'Listar todas las colecciones con conteo de documentos' })
  async listCollections() {
    const collections = await this.collectionRepo.findAll();
    return { collections };
  }

  @Get('library/collection/:id')
  @ApiOperation({ summary: 'Ver colección con sus documentos' })
  async getCollection(@Param('id', ParseIntPipe) id: number) {
    const collection = await this.collectionRepo.findById(id);
    return { collection };
  }

  @Patch('library/collection/:id')
  @ApiOperation({ summary: 'Actualizar una colección' })
  async updateCollection(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; description?: string; color?: string; icon?: string },
  ) {
    const collection = await this.collectionRepo.update(id, body);
    return { success: true, collection };
  }

  @Delete('library/collection/:id')
  @ApiOperation({ summary: 'Eliminar una colección' })
  async deleteCollection(@Param('id', ParseIntPipe) id: number) {
    await this.collectionRepo.delete(id);
    return { success: true };
  }

  @Post('library/collection/:id/document/:docId')
  @ApiOperation({ summary: 'Agregar documento a una colección' })
  async addDocumentToCollection(
    @Param('id',    ParseIntPipe) id:    number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    const entry = await this.collectionRepo.addDocument(id, docId);
    return { success: true, entry };
  }

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

  @Post('browser/fetch')
  @ApiOperation({ summary: 'Extraer contenido de una URL (axios → Playwright si es SPA)' })
  async browserFetch(@Body() body: { url: string }) {
    if (!body.url) throw new BadRequestException('Se requiere una URL');
    const result = await this.jarvisService.fetchUrl(body.url);
    return { success: true, ...result };
  }

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

  @Post('browser/search')
  @ApiOperation({ summary: 'Buscar en Google y devolver resultados con título, URL y snippet' })
  async browserSearch(
    @Body() body: { query: string; limit?: number },
  ) {
    if (!body.query) throw new BadRequestException('Se requiere una query de búsqueda');
    const results = await this.jarvisService.webSearch(body.query, body.limit ?? 5);
    return { success: true, results };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario' })
  async getProfile() {
    const profile = await this.jarvisService.getProfile();
    return { profile };
  }

  @Patch('profile')
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

  @Get('observability/stats')
  @ApiOperation({ summary: 'Estadísticas de uso (herramientas, latencia, éxitos)' })
  async getStats() {
    return this.jarvisService.getObservabilityStats();
  }

  @Get('observability/runs')
  @ApiOperation({ summary: 'Runs recientes del agente' })
  async getRecentRuns(@Query('limit') limit?: string) {
    const runs = await this.jarvisService.getRecentRuns(
      limit ? parseInt(limit, 10) : 50,
    );
    return { runs };
  }

  // ── Jarvis config y registro ──────────────────────────────────────────────

  @Get('identity')
  @ApiOperation({ summary: 'Obtener identidad de Jarvis' })
  async getIdentity() {
    return { identity: await this.jarvisService.getIdentity() };
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Obtener capacidades activas de Jarvis' })
  async getCapabilities() {
    return { capabilities: await this.jarvisService.getCapabilities() };
  }

  @Get('skills')
  @ApiOperation({ summary: 'Listar todas las skills cargadas' })
  async listSkills() {
    return { skills: await this.jarvisService.listSkills() };
  }

  @Get('skills/relevant')
  @ApiOperation({ summary: 'Buscar skills relevantes para una consulta' })
  async findRelevantSkills(@Query('q') query: string) {
    return { skills: await this.jarvisService.findRelevantSkills(query) };
  }

  @Get('tools')
  @ApiOperation({ summary: 'Listar herramientas habilitadas' })
  async listTools() {
    return { tools: await this.jarvisService.listTools() };
  }
}
