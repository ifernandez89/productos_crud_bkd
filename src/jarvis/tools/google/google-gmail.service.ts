import { Injectable, Logger } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
import { GoogleAuthService } from '../../../google/google-auth.service';

@Injectable()
export class GoogleGmailService {
  private readonly logger = new Logger(GoogleGmailService.name);

  constructor(private readonly googleAuthService: GoogleAuthService) {}

  private async getClient(): Promise<gmail_v1.Gmail | null> {
    const auth = await this.googleAuthService.getAuthenticatedClient();
    if (!auth) {
      this.logger.warn('[Gmail] No hay cliente autenticado.');
      return null;
    }
    return google.gmail({ version: 'v1', auth });
  }

  private getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
    return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const text = this.extractBody(part);
        if (text) return text;
      }
    }
    return '';
  }

  async getImportantEmails(maxResults = 10): Promise<string> {
    const gmail = await this.getClient();
    if (!gmail) return 'No tengo acceso a Gmail. Autenticate primero en /api/jarbees/google/auth.';

    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        labelIds: ['INBOX', 'IMPORTANT'],
        q: 'is:unread',
      });

      const messages = listRes.data.messages ?? [];
      if (messages.length === 0) return '📭 No tenés correos importantes no leídos.';

      const details = await Promise.all(
        messages.map(m =>
          gmail.users.messages.get({
            userId: 'me', id: m.id!, format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          })
        )
      );

      const lines = details.map((d, i) => {
        const h       = d.data.payload?.headers;
        const subject = this.getHeader(h, 'Subject') || '(sin asunto)';
        const from    = this.getHeader(h, 'From').replace(/<.*>/, '').trim() || 'Desconocido';
        const date    = this.getHeader(h, 'Date');
        const dateStr = date ? new Date(date).toLocaleDateString('es-AR') : '';
        return `${i + 1}. 📧 **${subject}**\n   De: ${from}${dateStr ? ` · ${dateStr}` : ''}`;
      });

      return `📬 **Correos importantes no leídos (${lines.length}):**\n\n${lines.join('\n\n')}`;
    } catch (error) {
      this.logger.error(`[Gmail] getImportantEmails: ${error.message}`);
      return `Error al leer Gmail: ${error.message}`;
    }
  }

  async getEmailsFromToday(): Promise<string> {
    const gmail = await this.getClient();
    if (!gmail) return 'No tengo acceso a Gmail. Autenticate primero.';

    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me', maxResults: 15, q: 'newer_than:1d in:inbox',
      });

      const messages = listRes.data.messages ?? [];
      if (messages.length === 0) return '📭 No recibiste correos hoy.';

      const details = await Promise.all(
        messages.map(m =>
          gmail.users.messages.get({
            userId: 'me', id: m.id!, format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
          })
        )
      );

      const lines = details.map((d, i) => {
        const h       = d.data.payload?.headers;
        const subject = this.getHeader(h, 'Subject') || '(sin asunto)';
        const from    = this.getHeader(h, 'From').replace(/<.*>/, '').trim();
        return `${i + 1}. **${subject}** — ${from}`;
      });

      return `📬 **Correos de hoy (${lines.length}):**\n${lines.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Gmail] getEmailsFromToday: ${error.message}`);
      return `Error al leer Gmail: ${error.message}`;
    }
  }

  async summarizeThread(threadId: string): Promise<string> {
    const gmail = await this.getClient();
    if (!gmail) return 'No tengo acceso a Gmail.';

    try {
      const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
      const bodies = (thread.data.messages ?? [])
        .map(m => this.extractBody(m.payload))
        .filter(b => b.length > 20)
        .slice(0, 5)
        .join('\n\n---\n\n');

      return bodies.slice(0, 3000) || 'No pude extraer el contenido de este hilo.';
    } catch (error) {
      this.logger.error(`[Gmail] summarizeThread: ${error.message}`);
      return `Error al leer el hilo: ${error.message}`;
    }
  }

  async draftEmail(to: string, subject: string, body: string): Promise<string> {
    const gmail = await this.getClient();
    if (!gmail) return 'No tengo acceso a Gmail. Autenticate primero.';

    try {
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
      ).toString('base64url');

      await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
      return `✅ Borrador creado.\n  📧 Para: **${to}**\n  📝 Asunto: **${subject}**`;
    } catch (error) {
      this.logger.error(`[Gmail] draftEmail: ${error.message}`);
      return `❌ Error al crear el borrador: ${error.message}`;
    }
  }

  async searchEmails(query: string, maxResults = 10): Promise<string> {
    const gmail = await this.getClient();
    if (!gmail) return 'No tengo acceso a Gmail.';

    try {
      const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
      const messages = listRes.data.messages ?? [];
      if (messages.length === 0) return `📭 No encontré correos para: "${query}"`;

      const details = await Promise.all(
        messages.map(m =>
          gmail.users.messages.get({
            userId: 'me', id: m.id!, format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
          })
        )
      );

      const lines = details.map((d, i) => {
        const h       = d.data.payload?.headers;
        const subject = this.getHeader(h, 'Subject') || '(sin asunto)';
        const from    = this.getHeader(h, 'From').replace(/<.*>/, '').trim();
        return `${i + 1}. **${subject}** — ${from}`;
      });

      return `🔍 **Resultados para "${query}" (${lines.length}):**\n${lines.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Gmail] searchEmails: ${error.message}`);
      return `Error al buscar en Gmail: ${error.message}`;
    }
  }
}
