import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Patch,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JarvisService } from './jarvis.service';

@ApiTags('jarbees')
@Controller('jarbees')
export class JarvisController {
  constructor(private readonly jarvisService: JarvisService) {}

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

  // ── Documentos RAG ──────────────────────────────────────────────────────────

  @Post('document/ingest')
  @ApiOperation({ summary: 'Ingerir un documento para RAG' })
  async ingestDocument(
    @Body()
    body: { title: string; content: string; category?: string; source?: string },
  ) {
    const doc = await this.jarvisService.ingestDocument(
      body.title,
      body.content,
      body.category,
      body.source,
    );
    return { success: true, document: doc };
  }

  @Get('document/search')
  @ApiOperation({ summary: 'Buscar en documentos' })
  async searchDocuments(@Query('q') query: string) {
    const documents = await this.jarvisService.searchDocuments(query);
    return { documents };
  }

  // ── Perfil ──────────────────────────────────────────────────────────────────

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
