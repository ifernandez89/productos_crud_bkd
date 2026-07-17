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
      this.logger.warn(
        '[Google Calendar] No hay cliente autenticado. El usuario debe loguearse.',
      );
      return null;
    }
    return google.calendar({ version: 'v3', auth });
  }

  async getUpcomingEvents(maxResults = 10): Promise<string | null> {
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
      if (!events || events.length === 0)
        return 'No tenés eventos próximos en el calendario.';

      const formatted = events.map((e, i) => {
        const start = e.start?.dateTime || e.start?.date;
        const date = new Date(start!).toLocaleString('es-AR', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `${i + 1}. **${e.summary || 'Sin título'}** — ${date}`;
      });

      return `📅 **Próximos eventos:**\n${formatted.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Calendar] getUpcomingEvents: ${error.message}`);
      return 'Error al leer el calendario. Verificá tus permisos.';
    }
  }

  async getDailyAgenda(date?: string): Promise<string> {
    const calendar = await this.getCalendarClient();
    if (!calendar) return 'No tengo acceso al calendario. Autenticate primero.';

    const target = date ? new Date(date) : new Date();
    const start = new Date(target);
    start.setHours(0, 0, 0, 0);
    const end = new Date(target);
    end.setHours(23, 59, 59, 999);

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items ?? [];
      const dayLabel = target.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });

      if (events.length === 0) return `📅 No tenés eventos el ${dayLabel}.`;

      const sections: Record<string, string[]> = {
        '🌅 Mañana': [],
        '🌞 Tarde': [],
        '🌙 Noche': [],
      };
      for (const e of events) {
        const dt = e.start?.dateTime ? new Date(e.start.dateTime) : null;
        const hour = dt ? dt.getHours() : -1;
        const time = dt
          ? dt.toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'todo el día';
        const entry = `  • ${time} — **${e.summary || 'Sin título'}**`;
        if (hour < 0 || hour >= 20) sections['🌙 Noche'].push(entry);
        else if (hour >= 13) sections['🌞 Tarde'].push(entry);
        else sections['🌅 Mañana'].push(entry);
      }

      const lines = [`📅 **Agenda del ${dayLabel}**`];
      for (const [label, items] of Object.entries(sections)) {
        if (items.length > 0) lines.push(`\n${label}\n${items.join('\n')}`);
      }
      return lines.join('\n');
    } catch (error) {
      this.logger.error(`[Calendar] getDailyAgenda: ${error.message}`);
      return `Error al leer la agenda: ${error.message}`;
    }
  }

  async getEventsInRange(
    startDate: string,
    endDate: string,
  ): Promise<calendar_v3.Schema$Event[]> {
    const calendar = await this.getCalendarClient();
    if (!calendar) return [];

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      return response.data.items ?? [];
    } catch (error) {
      this.logger.error(`[Calendar] getEventsInRange: ${error.message}`);
      return [];
    }
  }

  async detectConflicts(dateIso: string): Promise<string> {
    const calendar = await this.getCalendarClient();
    if (!calendar) return 'No tengo acceso al calendario.';

    const start = new Date(dateIso);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateIso);
    end.setHours(23, 59, 59, 999);

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items ?? [];
      if (events.length < 2)
        return `✅ No hay conflictos de horario para ese día.`;

      const conflicts: string[] = [];
      for (let i = 0; i < events.length - 1; i++) {
        const a = events[i];
        const b = events[i + 1];
        const aEnd = a.end?.dateTime ? new Date(a.end.dateTime) : null;
        const bStart = b.start?.dateTime ? new Date(b.start.dateTime) : null;
        if (aEnd && bStart && bStart < aEnd) {
          conflicts.push(
            `⚠️ **${a.summary}** y **${b.summary}** se superponen`,
          );
        }
      }

      return conflicts.length > 0
        ? `⚠️ **Conflictos detectados:**\n${conflicts.join('\n')}`
        : `✅ No hay conflictos de horario para ese día.`;
    } catch (error) {
      this.logger.error(`[Calendar] detectConflicts: ${error.message}`);
      return `Error al verificar conflictos: ${error.message}`;
    }
  }

  async createEvent(
    summary: string,
    description: string,
    startTimeIso: string,
    endTimeIso: string,
  ): Promise<string> {
    const calendar = await this.getCalendarClient();
    if (!calendar)
      return 'No tengo acceso a tu cuenta de Google. Autenticate primero.';

    try {
      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary,
          description,
          start: {
            dateTime: startTimeIso,
            timeZone: 'America/Argentina/Buenos_Aires',
          },
          end: {
            dateTime: endTimeIso,
            timeZone: 'America/Argentina/Buenos_Aires',
          },
        },
      });
      return `✅ Evento creado: **${res.data.summary}**\n🔗 [Ver en Google Calendar](${res.data.htmlLink})`;
    } catch (error) {
      this.logger.error(`[Calendar] createEvent: ${error.message}`);
      return `❌ Error al crear el evento: ${error.message}`;
    }
  }

  async createMeetingWithAttendees(
    summary: string,
    attendees: string[],
    startTimeIso: string,
    endTimeIso: string,
  ): Promise<string> {
    const calendar = await this.getCalendarClient();
    if (!calendar) return 'No tengo acceso al calendario. Autenticate primero.';

    try {
      const res = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: {
          summary,
          start: {
            dateTime: startTimeIso,
            timeZone: 'America/Argentina/Buenos_Aires',
          },
          end: {
            dateTime: endTimeIso,
            timeZone: 'America/Argentina/Buenos_Aires',
          },
          attendees: attendees.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: `jarbees-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      });

      const meetLink =
        res.data.conferenceData?.entryPoints?.[0]?.uri ?? 'sin enlace de Meet';
      return `✅ Reunión creada: **${res.data.summary}**\n🎥 Google Meet: ${meetLink}\n🔗 [Ver en Calendario](${res.data.htmlLink})`;
    } catch (error) {
      this.logger.error(
        `[Calendar] createMeetingWithAttendees: ${error.message}`,
      );
      return `❌ Error al crear la reunión: ${error.message}`;
    }
  }
}
