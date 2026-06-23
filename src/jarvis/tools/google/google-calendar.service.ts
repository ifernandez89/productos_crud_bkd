import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { GoogleAuthService } from '../../../google/google-auth.service';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private googleAuthService: GoogleAuthService) {}

  async getCalendarClient(): Promise<calendar_v3.Calendar | null> {
    const auth = await this.googleAuthService.getAuthenticatedClient();
    if (!auth) {
      this.logger.warn('[Google Calendar] No hay cliente autenticado. El usuario debe loguearse.');
      return null;
    }
    return google.calendar({ version: 'v3', auth });
  }

  async getUpcomingEvents(maxResults: number = 10): Promise<string | null> {
    const calendar = await this.getCalendarClient();
    if (!calendar) return null;

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items;
      if (!events || events.length === 0) {
        return 'No tienes eventos próximos en el calendario.';
      }

      const formattedEvents = events.map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        const formattedDate = new Date(start!).toLocaleString('es-AR', {
          weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `${i + 1}. **${event.summary || 'Sin título'}** - ${formattedDate}`;
      });

      return `📅 **Próximos eventos en tu Calendario:**\n${formattedEvents.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Google Calendar] Error obteniendo eventos: ${error.message}`);
      return 'Ocurrió un error al intentar leer tu calendario. Verifica tus permisos.';
    }
  }

  async createEvent(summary: string, description: string, startTimeIso: string, endTimeIso: string): Promise<string> {
    const calendar = await this.getCalendarClient();
    if (!calendar) return 'No tengo acceso a tu cuenta de Google. Por favor autentícate primero.';

    try {
      const event = {
        summary,
        description,
        start: { dateTime: startTimeIso, timeZone: 'America/Argentina/Buenos_Aires' },
        end: { dateTime: endTimeIso, timeZone: 'America/Argentina/Buenos_Aires' },
      };

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      return `✅ Evento creado con éxito: **${res.data.summary}**\n🔗 [Ver en Google Calendar](${res.data.htmlLink})`;
    } catch (error) {
      this.logger.error(`[Google Calendar] Error creando evento: ${error.message}`);
      return `❌ Hubo un error al crear el evento: ${error.message}`;
    }
  }
}
