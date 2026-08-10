import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Public } from '../../auth/public.decorator';
import { TranslatorService } from './translator.service';
import { TranslatePdfDto } from './dto/translate-pdf.dto';
import { TranslateDocumentDto } from './dto/translate-document.dto';

@ApiTags('translator')
@Controller('translator')
export class TranslatorController {
  private readonly logger = new Logger(TranslatorController.name);

  constructor(private readonly translatorService: TranslatorService) {}

  // ──────────────────────────────────────────────────────────────────────────────
  // POST /translator/translate-pdf
  // Recibe un PDF multipart y lo traduce al español de forma asíncrona.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('translate-pdf')
  @ApiOperation({
    summary: 'Subir un PDF en idioma extranjero y traducirlo al español con Qwen3:4b',
    description:
      'La traducción se realiza de forma asíncrona. Devuelve un jobId para consultar el progreso. ' +
      'Una vez completada, el libro traducido aparece automáticamente en la lista del Reader.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF a traducir' },
        customTitle: { type: 'string', description: 'Título personalizado (opcional)' },
        category: { type: 'string', description: 'Categoría (opcional)' },
        originalDocId: { type: 'number', description: 'ID del documento original en la BD para ocultarlo (opcional)' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async translatePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: TranslatePdfDto & { originalDocId?: string },
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo PDF');
    if (!file.mimetype?.includes('pdf') && !file.originalname?.endsWith('.pdf')) {
      throw new BadRequestException('El archivo debe ser un PDF');
    }

    const originalDocId = body.originalDocId ? parseInt(body.originalDocId, 10) : undefined;

    this.logger.log(
      `[TranslatorController] Iniciando traducción de "${file.originalname}" (${file.size} bytes)`,
    );

    const job = await this.translatorService.translatePdfBuffer(
      file.buffer,
      file.originalname,
      body.customTitle,
      body.category,
      originalDocId,
    );

    return {
      success: true,
      message: 'Traducción iniciada en segundo plano. Consulta el progreso con /translator/status/:jobId',
      jobId: job.jobId,
      originalTitle: job.originalTitle,
      startedAt: job.startedAt,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // POST /translator/translate-document/:id
  // Traduce un documento ya indexado en la BD por su ID.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('translate-document/:id')
  @ApiOperation({
    summary: 'Traducir un documento ya indexado en la biblioteca (por ID)',
    description:
      'Si el documento tiene contenido en la BD, se traduce completo al español y se crea una nueva entrada. ' +
      'El documento original se oculta del Reader automáticamente.',
  })
  async translateDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TranslateDocumentDto,
  ) {
    const job = await this.translatorService.translateExistingDocument(
      id,
      body.customTitle,
      body.category,
    );

    return {
      success: true,
      message: `Traducción del documento ${id} iniciada. Consulta el progreso con /translator/status/${job.jobId}`,
      jobId: job.jobId,
      originalTitle: job.originalTitle,
      startedAt: job.startedAt,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // GET /translator/status/:jobId
  // Consulta el progreso de un job de traducción.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Get('status/:jobId')
  @ApiOperation({ summary: 'Consultar el progreso de una traducción en curso' })
  getStatus(@Param('jobId') jobId: string) {
    const job = this.translatorService.getJobStatus(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} no encontrado`);
    return {
      success: true,
      ...job,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // GET /translator/jobs
  // Lista todos los jobs de traducción en memoria.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Get('jobs')
  @ApiOperation({ summary: 'Listar todos los jobs de traducción (historial en memoria)' })
  listJobs() {
    return {
      success: true,
      jobs: this.translatorService.listJobs(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // GET /translator/list
  // Lista todos los libros traducidos al español disponibles.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Get('list')
  @ApiOperation({ summary: 'Listar todos los libros traducidos al español disponibles en la biblioteca' })
  async listTranslated() {
    const docs = await this.translatorService.listTranslatedDocuments();
    return {
      success: true,
      total: docs.length,
      documentos: docs,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // POST /translator/hide/:id
  // Oculta un documento del Reader sin borrarlo.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('hide/:id')
  @ApiOperation({
    summary: 'Ocultar un documento del Reader (sin borrarlo)',
    description:
      'Marca el documento como hidden=true. No aparecerá en la lista del Reader pero sigue en la BD. ' +
      'Útil para versiones en idioma extranjero cuando ya existe la versión en español.',
  })
  async hideDocument(@Param('id', ParseIntPipe) id: number) {
    await this.translatorService.hideDocument(id, 'manual');
    return {
      success: true,
      message: `Documento ${id} ocultado del Reader exitosamente`,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // POST /translator/detect-language
  // Detecta el idioma de un texto sin traducir.
  // ──────────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('detect-language')
  @ApiOperation({ summary: 'Detectar el idioma de un texto (para diagnóstico)' })
  detectLanguage(@Body() body: { text: string }) {
    if (!body?.text) throw new BadRequestException('Se requiere el campo "text"');
    const lang = this.translatorService.detectLanguage(body.text);
    return { success: true, language: lang };
  }
}
