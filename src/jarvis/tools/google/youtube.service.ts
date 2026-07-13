/**
 * YouTubeService — Solo lectura (YouTube Data API v3, API Key pública)
 *
 * ⚠️  POLÍTICA: Este servicio usa ÚNICAMENTE operaciones de LECTURA.
 *     No se implementan métodos de escritura (subir videos, crear playlists,
 *     moderar comentarios, etc.) para mantener el uso dentro de la cuota
 *     gratuita y evitar requerir OAuth para el usuario.
 *
 * 💰 COSTO DE CUOTA (de 10.000 puntos/día gratuitos):
 *     search.list   → 100 puntos  (búsqueda de videos)
 *     videos.list   →   1 punto   (info de un video por ID)
 *     commentThreads.list → 1 punto (comentarios de un video)
 *     channels.list →   1 punto   (info de un canal)
 *
 * Para activar: agregar YOUTUBE_API_KEY en .env
 * Obtener en: console.cloud.google.com → APIs & Services → Credentials
 */
import { Injectable, Logger } from '@nestjs/common';
import { google, youtube_v3 } from 'googleapis';

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);

  private getClient(): youtube_v3.Youtube {
    return google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
  }

  private get apiKey(): string | undefined {
    return process.env.YOUTUBE_API_KEY;
  }

  private noKeyMsg = '⚠️ No está configurada la variable YOUTUBE_API_KEY. Agregala en tu .env para usar YouTube.';

  // ── BÚSQUEDA (100 puntos de cuota) ─────────────────────────────────────────

  async searchVideos(query: string, maxResults = 5): Promise<string> {
    if (!this.apiKey) return this.noKeyMsg;

    try {
      const res = await this.getClient().search.list({
        part: ['snippet'],
        q: query,
        maxResults,
        type: ['video'],
        relevanceLanguage: 'es',
        safeSearch: 'none',
      });

      const items = res.data.items ?? [];
      if (items.length === 0) return `🎬 No encontré videos para "${query}".`;

      const lines = items.map((item, i) => {
        const id      = item.id?.videoId ?? '';
        const title   = item.snippet?.title ?? 'Sin título';
        const channel = item.snippet?.channelTitle ?? '';
        const url     = id ? `https://youtube.com/watch?v=${id}` : '';
        return `${i + 1}. 🎬 **${title}**\n   Canal: ${channel}${url ? `\n   ${url}` : ''}`;
      });

      return `🎬 **Videos de YouTube para "${query}":**\n\n${lines.join('\n\n')}`;
    } catch (error) {
      this.logger.error(`[YouTube] searchVideos: ${error.message}`);
      return `Error al buscar en YouTube: ${error.message}`;
    }
  }

  // ── INFO DE VIDEO (1 punto de cuota) ───────────────────────────────────────

  async getVideoInfo(videoId: string): Promise<string> {
    if (!this.apiKey) return this.noKeyMsg;

    try {
      const res = await this.getClient().videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [videoId],
      });

      const video = res.data.items?.[0];
      if (!video) return `❌ No encontré el video con ID: ${videoId}`;

      const title       = video.snippet?.title ?? 'Sin título';
      const channel     = video.snippet?.channelTitle ?? '';
      const description = (video.snippet?.description ?? '').slice(0, 400);
      const views       = Number(video.statistics?.viewCount ?? 0).toLocaleString('es-AR');
      const likes       = Number(video.statistics?.likeCount ?? 0).toLocaleString('es-AR');
      const comments    = Number(video.statistics?.commentCount ?? 0).toLocaleString('es-AR');
      const duration    = video.contentDetails?.duration
        ? this.parseDuration(video.contentDetails.duration) : '';
      const published   = video.snippet?.publishedAt
        ? new Date(video.snippet.publishedAt).toLocaleDateString('es-AR') : '';

      return [
        `🎬 **${title}**`,
        `📺 Canal: ${channel}`,
        published ? `📅 Publicado: ${published}` : '',
        duration  ? `⏱️ Duración: ${duration}` : '',
        `👁️ Vistas: ${views}  |  👍 Likes: ${likes}  |  💬 Comentarios: ${comments}`,
        ``,
        `📝 **Descripción:**`,
        description + (description.length === 400 ? '...' : ''),
        ``,
        `🔗 https://youtube.com/watch?v=${videoId}`,
      ].filter(Boolean).join('\n');
    } catch (error) {
      this.logger.error(`[YouTube] getVideoInfo: ${error.message}`);
      return `Error al obtener info del video: ${error.message}`;
    }
  }

  // ── COMENTARIOS DE UN VIDEO (1 punto de cuota) ─────────────────────────────

  async getVideoComments(videoId: string, maxResults = 10): Promise<string> {
    if (!this.apiKey) return this.noKeyMsg;

    try {
      const res = await this.getClient().commentThreads.list({
        part: ['snippet'],
        videoId,
        maxResults,
        order: 'relevance',
        textFormat: 'plainText',
      });

      const items = res.data.items ?? [];
      if (items.length === 0) return `💬 No encontré comentarios para este video.`;

      const lines = items.map((item, i) => {
        const c       = item.snippet?.topLevelComment?.snippet;
        const author  = c?.authorDisplayName ?? 'Anónimo';
        const text    = (c?.textDisplay ?? '').slice(0, 200);
        const likes   = c?.likeCount ?? 0;
        return `${i + 1}. **${author}** (👍 ${likes})\n   ${text}`;
      });

      return `💬 **Comentarios destacados:**\n\n${lines.join('\n\n')}`;
    } catch (error) {
      this.logger.error(`[YouTube] getVideoComments: ${error.message}`);
      return `Error al obtener comentarios: ${error.message}`;
    }
  }

  // ── VIDEOS DE UN CANAL (100 puntos de cuota — usa search.list) ─────────────

  async getChannelVideos(channelId: string, maxResults = 5): Promise<string> {
    if (!this.apiKey) return this.noKeyMsg;

    try {
      const res = await this.getClient().search.list({
        part: ['snippet'],
        channelId,
        maxResults,
        order: 'date',
        type: ['video'],
      });

      const items = res.data.items ?? [];
      if (items.length === 0) return `🎬 No encontré videos para el canal ${channelId}.`;

      const lines = items.map((item, i) => {
        const id    = item.id?.videoId ?? '';
        const title = item.snippet?.title ?? 'Sin título';
        const date  = item.snippet?.publishedAt
          ? new Date(item.snippet.publishedAt).toLocaleDateString('es-AR') : '';
        const url   = id ? `https://youtube.com/watch?v=${id}` : '';
        return `${i + 1}. **${title}**${date ? ` — ${date}` : ''}${url ? `\n   ${url}` : ''}`;
      });

      return `🎬 **Videos recientes del canal:**\n\n${lines.join('\n\n')}`;
    } catch (error) {
      this.logger.error(`[YouTube] getChannelVideos: ${error.message}`);
      return `Error al obtener videos del canal: ${error.message}`;
    }
  }

  // ── INFO DE UN CANAL (1 punto de cuota) ────────────────────────────────────

  async getChannelInfo(channelIdOrName: string): Promise<string> {
    if (!this.apiKey) return this.noKeyMsg;

    try {
      // Intentar por ID directo, si falla buscar por forHandle/@nombre
      const isId = /^UC[A-Za-z0-9_-]{22}$/.test(channelIdOrName);
      const res = await this.getClient().channels.list({
        part: ['snippet', 'statistics'],
        ...(isId ? { id: [channelIdOrName] } : { forHandle: channelIdOrName }),
      });

      const channel = res.data.items?.[0];
      if (!channel) return `❌ No encontré el canal: ${channelIdOrName}`;

      const name        = channel.snippet?.title ?? '';
      const description = (channel.snippet?.description ?? '').slice(0, 300);
      const subs        = Number(channel.statistics?.subscriberCount ?? 0).toLocaleString('es-AR');
      const videos      = channel.statistics?.videoCount ?? '?';
      const views       = Number(channel.statistics?.viewCount ?? 0).toLocaleString('es-AR');

      return [
        `📺 **${name}**`,
        `👥 Suscriptores: ${subs}  |  🎬 Videos: ${videos}  |  👁️ Vistas totales: ${views}`,
        ``,
        description,
      ].filter(Boolean).join('\n');
    } catch (error) {
      this.logger.error(`[YouTube] getChannelInfo: ${error.message}`);
      return `Error al obtener info del canal: ${error.message}`;
    }
  }

  // ── UTILS ──────────────────────────────────────────────────────────────────

  /** Extrae el videoId de una URL de YouTube en cualquier formato */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
      /^([A-Za-z0-9_-]{11})$/, // ID directo
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  /** Convierte duración ISO 8601 (PT1H4M13S) a formato legible (1:04:13) */
  private parseDuration(iso: string): string {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return iso;
    const h   = m[1] ? `${m[1]}:` : '';
    const min = m[2] ? m[2].padStart(h ? 2 : 1, '0') : '0';
    const sec = (m[3] ?? '0').padStart(2, '0');
    return `${h}${min}:${sec}`;
  }
}
