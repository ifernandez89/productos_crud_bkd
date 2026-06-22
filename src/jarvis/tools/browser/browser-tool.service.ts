import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface BrowserResult {
  url: string;
  finalUrl: string;         // URL final tras redirecciones
  title: string;
  description: string;
  text: string;             // texto limpio completo (hasta MAX_TEXT_CHARS)
  excerpt: string;          // primeros 2000 chars para contexto rápido
  links: string[];          // hasta 10 links relevantes
  images: string[];         // alt-text de imágenes principales
  wordCount: number;
  renderedWithPlaywright: boolean;   // indica si se necesitó JS rendering
  scrapedAt: string;
}

export interface BrowserError {
  url: string;
  error: string;
}

export interface NavigationResult {
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; href: string }>;
  screenshot?: string;   // base64 si se pidió
}

// ── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class BrowserToolService {
  private readonly logger = new Logger(BrowserToolService.name);

  private readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 JarBees/1.0';

  private readonly TIMEOUT_MS  = 15_000;
  private readonly MAX_TEXT_CHARS = 8_000;
  private readonly EXCERPT_CHARS  = 2_000;

  // Playwright es costoso — se crea bajo demanda y se cierra
  private browser: Browser | null = null;

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Estrategia dual:
   * 1. Intenta con axios + cheerio (rápido, liviano)
   * 2. Si el contenido útil es escaso (<200 palabras), usa Playwright para renderizar JS
   */
  async fetch(url: string): Promise<BrowserResult | BrowserError> {
    this.logger.log(`[browser] fetching: ${url}`);

    // Intentar con cheerio primero
    const staticResult = await this.fetchStatic(url);
    if ('error' in staticResult) {
      // Si falla, probar con Playwright
      this.logger.log(`[browser] static failed, trying playwright: ${url}`);
      return this.fetchRendered(url);
    }

    // Si el contenido es escaso → necesita JS rendering
    if (staticResult.wordCount < 200) {
      this.logger.log(`[browser] thin content (${staticResult.wordCount} words), rendering with playwright: ${url}`);
      const renderedResult = await this.fetchRendered(url);
      if ('error' in renderedResult) return staticResult; // fallback al estático
      return renderedResult;
    }

    return staticResult;
  }

  /**
   * Extrae todas las URLs mencionadas en un mensaje de usuario.
   */
  extractUrls(message: string): string[] {
    const regex = /https?:\/\/[^\s<>"')\]]+/gi;
    const matches = message.match(regex) ?? [];
    return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, '')))];
  }

  /**
   * Construye el contexto listo para inyectar en el prompt del LLM.
   */
  async buildContext(message: string): Promise<string | null> {
    const urls = this.extractUrls(message);
    if (urls.length === 0) return null;

    this.logger.log(`[browser] ${urls.length} URL(s) detectadas: ${urls.join(', ')}`);

    const results = await Promise.all(urls.map((u) => this.fetch(u)));
    const sections: string[] = [];

    for (const result of results) {
      if ('error' in result) {
        sections.push(`### 🌐 URL: ${result.url}\n⚠️ No se pudo acceder: ${result.error}`);
        continue;
      }

      const rendered = result.renderedWithPlaywright ? ' _(renderizado con Playwright)_' : '';
      sections.push(
        [
          `### 🌐 ${result.title}${rendered}`,
          `**URL:** ${result.finalUrl}`,
          result.description ? `**Descripción:** ${result.description}` : '',
          `**Palabras:** ${result.wordCount}  |  **Extraído:** ${result.scrapedAt}`,
          '',
          '**Contenido:**',
          result.excerpt,
          result.links.length > 0
            ? `\n**Links encontrados:**\n${result.links.slice(0, 5).map((l) => `- ${l}`).join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    return sections.join('\n\n---\n\n');
  }

  // ── Nivel 2: Navegación autónoma ────────────────────────────────────────────

  /**
   * Abre una URL con Playwright y devuelve el contenido renderizado + links.
   * Permite navegación autónoma por el agente.
   */
  async navigate(url: string, options?: { screenshot?: boolean; waitFor?: string }): Promise<NavigationResult | BrowserError> {
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ userAgent: this.USER_AGENT });
      page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.TIMEOUT_MS });

      // Esperar selector específico si se pidió
      if (options?.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout: 5000 }).catch(() => {});
      }

      // Scroll para cargar contenido lazy
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(1000);

      const title = await page.title();
      const finalUrl = page.url();

      // Extraer texto limpio
      const text = await page.evaluate(() => {
        const remove = document.querySelectorAll(
          'script, style, noscript, nav, footer, header, aside, iframe, form, [aria-hidden="true"]',
        );
        remove.forEach((el) => el.remove());
        return document.body?.innerText ?? '';
      });

      const cleanText = text
        .replace(/\t+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/ {2,}/g, ' ')
        .trim()
        .slice(0, this.MAX_TEXT_CHARS);

      // Extraer links
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 20)
          .map((a) => ({
            text: (a as HTMLAnchorElement).innerText?.trim().slice(0, 80) ?? '',
            href: (a as HTMLAnchorElement).href ?? '',
          }))
          .filter((l) => l.href.startsWith('http') && l.text.length > 2);
      });

      // Screenshot opcional
      let screenshot: string | undefined;
      if (options?.screenshot) {
        const buf = await page.screenshot({ type: 'png', fullPage: false });
        screenshot = buf.toString('base64');
      }

      await context.close();

      return { url: finalUrl, title, text: cleanText, links, screenshot };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[browser:navigate] error en ${url}: ${msg}`);
      if (page) await page.context().close().catch(() => {});
      return { url, error: msg };
    }
  }

  /**
   * Busca en Google y devuelve los primeros N resultados con título + URL + snippet.
   */
  async search(query: string, limit = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const encoded = encodeURIComponent(query);
    const searchUrl = `https://www.google.com/search?q=${encoded}&hl=es&num=${limit + 2}`;

    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ userAgent: this.USER_AGENT });
      page = await context.newPage();

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: this.TIMEOUT_MS });

      const results = await page.evaluate((maxResults: number) => {
        const items: Array<{ title: string; url: string; snippet: string }> = [];

        // Selectores de resultados orgánicos de Google
        const containers = document.querySelectorAll('div.g, div[data-sokoban-container]');
        containers.forEach((container) => {
          if (items.length >= maxResults) return;

          const anchor = container.querySelector('a[href]') as HTMLAnchorElement | null;
          const titleEl = container.querySelector('h3');
          const snippetEl = container.querySelector('.VwiC3b, span[data-ved], .IsZvec');

          const url = anchor?.href ?? '';
          const title = titleEl?.innerText?.trim() ?? '';
          const snippet = snippetEl?.textContent?.trim() ?? '';

          if (url.startsWith('http') && title) {
            items.push({ title, url, snippet: snippet.slice(0, 200) });
          }
        });

        return items;
      }, limit);

      await context.close();
      this.logger.log(`[browser:search] "${query}" → ${results.length} resultados`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[browser:search] error buscando "${query}": ${msg}`);
      if (page) await page.context().close().catch(() => {});
      return [];
    }
  }

  /**
   * Navega a múltiples URLs y las lee en paralelo (para investigación autónoma).
   */
  async fetchMultiple(urls: string[]): Promise<BrowserResult[]> {
    const results = await Promise.all(urls.map((u) => this.fetch(u)));
    return results.filter((r): r is BrowserResult => !('error' in r));
  }

  /**
   * Cierra el browser si está abierto (llamar al apagar la app).
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log('[browser] instancia de Playwright cerrada');
    }
  }

  // ── Estrategias de fetch ─────────────────────────────────────────────────────

  private async fetchStatic(url: string): Promise<BrowserResult | BrowserError> {
    let html: string;
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': this.USER_AGENT },
        timeout: this.TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      });
      html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { url, error: msg };
    }

    return this.parseHtml(url, url, html, false);
  }

  private async fetchRendered(url: string): Promise<BrowserResult | BrowserError> {
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ userAgent: this.USER_AGENT });
      page = await context.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: this.TIMEOUT_MS });

      // Scroll para activar lazy-loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(800);

      const html = await page.content();
      const finalUrl = page.url();
      await context.close();

      return this.parseHtml(url, finalUrl, html, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[browser:playwright] error en ${url}: ${msg}`);
      if (page) await page.context().close().catch(() => {});
      return { url, error: msg };
    }
  }

  // ── Parseo HTML ──────────────────────────────────────────────────────────────

  private parseHtml(
    originalUrl: string,
    finalUrl: string,
    html: string,
    renderedWithPlaywright: boolean,
  ): BrowserResult {
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text() ||
      originalUrl;

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Limpiar DOM
    $(
      'script, style, noscript, nav, footer, header, ' +
      'aside, .cookie-banner, .ads, .advertisement, ' +
      '[aria-hidden="true"], iframe, form',
    ).remove();

    const rawText = $('body').text();
    const cleanText = rawText
      .replace(/\t+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, this.MAX_TEXT_CHARS);

    // Links
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      try {
        const abs = href.startsWith('http') ? href : new URL(href, finalUrl).href;
        if (!links.includes(abs) && links.length < 10) links.push(abs);
      } catch { /* ignorar href inválido */ }
    });

    // Imágenes
    const images: string[] = [];
    $('img[alt]').each((_, el) => {
      const alt = $(el).attr('alt')?.trim();
      if (alt && alt.length > 3 && !images.includes(alt) && images.length < 8) {
        images.push(alt);
      }
    });

    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    return {
      url: originalUrl,
      finalUrl,
      title: title.trim().slice(0, 200),
      description: description.trim().slice(0, 400),
      text: cleanText,
      excerpt: cleanText.slice(0, this.EXCERPT_CHARS),
      links,
      images,
      wordCount,
      renderedWithPlaywright,
      scrapedAt: new Date().toISOString(),
    };
  }

  // ── Playwright lifecycle ─────────────────────────────────────────────────────

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('[browser] iniciando instancia de Playwright Chromium...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
        ],
      });
      this.logger.log('[browser] Playwright Chromium listo');
    }
    return this.browser;
  }
}
