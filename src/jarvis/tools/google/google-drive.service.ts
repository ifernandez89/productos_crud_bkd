import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { GoogleAuthService } from '../../../google/google-auth.service';
import { DocumentIngestService } from '../../library/document-ingest.service';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly ingestService: DocumentIngestService,
  ) {}

  private async getClient(): Promise<drive_v3.Drive | null> {
    const auth = await this.googleAuthService.getAuthenticatedClient();
    if (!auth) {
      this.logger.warn('[Drive] No hay cliente autenticado.');
      return null;
    }
    return google.drive({ version: 'v3', auth });
  }

  async searchFiles(query: string, mimeType?: string): Promise<string> {
    const drive = await this.getClient();
    if (!drive) return 'No tengo acceso a Drive. Autenticate primero en /api/jarbees/google/auth.';

    try {
      let q = `name contains '${query}' and trashed = false`;
      if (mimeType) q += ` and mimeType = '${mimeType}'`;

      const res = await drive.files.list({
        q,
        pageSize: 10,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
      });

      const files = res.data.files ?? [];
      if (files.length === 0) return `📂 No encontré archivos que coincidan con "${query}".`;

      const lines = files.map((f, i) => {
        const size = f.size ? `${Math.round(Number(f.size) / 1024)} KB` : '';
        const date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('es-AR') : '';
        const link = f.webViewLink ? ` · [Abrir](${f.webViewLink})` : '';
        return `${i + 1}. 📄 **${f.name}**${size ? ` (${size})` : ''}${date ? ` — ${date}` : ''}${link}`;
      });

      return `📂 **Resultados en Drive para "${query}" (${files.length}):**\n${lines.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Drive] searchFiles: ${error.message}`);
      return `Error al buscar en Drive: ${error.message}`;
    }
  }

  async listRecentFiles(maxResults = 10): Promise<string> {
    const drive = await this.getClient();
    if (!drive) return 'No tengo acceso a Drive.';

    try {
      const res = await drive.files.list({
        pageSize: maxResults,
        orderBy: 'modifiedTime desc',
        q: 'trashed = false',
        fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
      });

      const files = res.data.files ?? [];
      if (files.length === 0) return '📂 Tu Drive no tiene archivos recientes.';

      const lines = files.map((f, i) => {
        const date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('es-AR') : '';
        const link = f.webViewLink ? ` · [Abrir](${f.webViewLink})` : '';
        const icon = f.mimeType?.includes('pdf') ? '📄'
          : f.mimeType?.includes('document') ? '📝'
          : f.mimeType?.includes('spreadsheet') ? '📊'
          : '📁';
        return `${i + 1}. ${icon} **${f.name}**${date ? ` — ${date}` : ''}${link}`;
      });

      return `📂 **Archivos recientes en Drive:**\n${lines.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Drive] listRecentFiles: ${error.message}`);
      return `Error al listar Drive: ${error.message}`;
    }
  }

  private async downloadFileContent(fileId: string, mimeType: string): Promise<string | null> {
    const drive = await this.getClient();
    if (!drive) return null;

    try {
      if (mimeType.includes('google-apps.document')) {
        const res = await drive.files.export(
          { fileId, mimeType: 'text/plain' },
          { responseType: 'text' },
        );
        return res.data as string;
      }

      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(res.data as ArrayBuffer).toString('utf-8');
    } catch (error) {
      this.logger.error(`[Drive] downloadFileContent: ${error.message}`);
      return null;
    }
  }

  /**
   * Descarga un archivo de Drive (PDF o Doc) y lo ingesta en el sistema RAG.
   * Queda disponible para búsquedas y resúmenes igual que cualquier PDF subido manualmente.
   */
  async syncToKnowledge(fileId: string, titleOverride?: string): Promise<string> {
    const drive = await this.getClient();
    if (!drive) return 'No tengo acceso a Drive. Autenticate primero.';

    try {
      const meta = await drive.files.get({ fileId, fields: 'id, name, mimeType' });
      const fileName = titleOverride ?? meta.data.name ?? fileId;
      const mimeType = meta.data.mimeType ?? '';
      const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

      this.logger.log(`[Drive] sincronizando "${fileName}" (${mimeType}) → RAG`);

      if (mimeType === 'application/pdf') {
        const res = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer' },
        );
        const buffer = Buffer.from(res.data as ArrayBuffer);
        const result = await this.ingestService.ingestPdf(buffer, fileName, undefined, driveUrl);
        return `✅ PDF de Drive sincronizado al conocimiento.\n  📄 **${result.title}**\n  🏷️ Categoría: ${result.category}\n  📦 Chunks: ${result.chunks}`;
      }

      if (mimeType.includes('document') || mimeType.includes('text')) {
        const content = await this.downloadFileContent(fileId, mimeType);
        if (!content) return `❌ No pude leer el contenido de "${fileName}".`;
        const result = await this.ingestService.ingestText(fileName, content, undefined, driveUrl);
        return `✅ Documento de Drive sincronizado.\n  📝 **${result.title}**\n  🏷️ Categoría: ${result.category}\n  📦 Chunks: ${result.chunks}`;
      }

      return `⚠️ Tipo de archivo no soportado: ${mimeType}. Soportados: PDF, Google Docs, texto plano.`;
    } catch (error) {
      this.logger.error(`[Drive] syncToKnowledge: ${error.message}`);
      return `❌ Error al sincronizar desde Drive: ${error.message}`;
    }
  }

  async uploadTextFile(fileName: string, content: string): Promise<string> {
    const drive = await this.getClient();
    if (!drive) return 'No tengo acceso a Drive.';

    try {
      const { Readable } = await import('stream');
      const res = await drive.files.create({
        requestBody: { name: fileName },
        media: { mimeType: 'text/plain', body: Readable.from([content]) },
        fields: 'id, name, webViewLink',
      });
      return `✅ Archivo subido a Drive: **${res.data.name}**\n🔗 [Ver en Drive](${res.data.webViewLink})`;
    } catch (error) {
      this.logger.error(`[Drive] uploadTextFile: ${error.message}`);
      return `❌ Error al subir a Drive: ${error.message}`;
    }
  }
}
