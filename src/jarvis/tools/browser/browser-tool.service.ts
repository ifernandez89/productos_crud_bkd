import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface BrowserResult {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  text: string;
  excerpt: string;
  headlines: string[];         // titulares / h1-h3 extraídos
  links: string[];
  images: string[];
  wordCount: number;
  renderedWithPlaywright: boolean;
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
  screenshot?: string;
}

// ── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class BrowserToolService {
  private readonly logger = new Logger(BrowserToolService.name);

  private readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  private readonly TIMEOUT_MS     = 20_000;
  private readonly MAX_TEXT_CHARS = 10_000;
  private readonly EXCERPT_CHARS  = 3_000;
  private readonly MIN_WORDS      = 300;   // umbral para decidir si vale la pena

  // Tiempos de espera optimizados para velocidad
  private readonly GOTO_TIMEOUT   = 15_000;  // timeout navegación
  private readonly CONTENT_WAIT   = 2_000;   // espera contenido inicial
  private readonly SCROLL_STEP_MS = 300;     // ms entre pasos de scroll (antes: 600)

  private browser: Browser | null = null;

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Estrategia dual:
   * 1. Playwright con scroll profundo (siempre para páginas de noticias/dinámicas)
   * 2. Fallback a axios + cheerio si Playwright falla
   */
  async fetch(url: string): Promise<BrowserResult | BrowserError> {
    this.logger.log(`[browser] fetching: ${url}`);

    // Playwright primero para sitios dinámicos
    const rendered = await this.fetchRendered(url);
    if (!('error' in rendered) && rendered.wordCount >= this.MIN_WORDS) {
      return rendered;
    }

    // Si Playwright da poco contenido, intentar con axios como respaldo
    const staticResult = await this.fetchStatic(url);
    if ('error' in staticResult) {
      // Si ambos fallan, devolver el resultado de Playwright aunque sea pobre
      return rendered;
    }

    // Usar el que tenga más contenido
    if ('error' in rendered) return staticResult;
    return rendered.wordCount >= staticResult.wordCount ? rendered : staticResult;
  }

  extractUrls(message: string): string[] {
    const regex = /https?:\/\/[^\s<>"')\]]+/gi;
    const matches = message.match(regex) ?? [];
    return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, '')))];
  }

  /**
   * Construye el contexto para el LLM con toda la info extraída.
   * Incluye titulares separados del cuerpo para mejor contexto.
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

      const rendered = result.renderedWithPlaywright ? ' _(JS renderizado)_' : '';
      const parts: string[] = [
        `### 🌐 ${result.title}${rendered}`,
        `**URL:** ${result.finalUrl}`,
        result.description ? `**Descripción:** ${result.description}` : '',
        `**Palabras extraídas:** ${result.wordCount}  |  **Extraído:** ${result.scrapedAt}`,
      ];

      // Titulares de la página (muy útil para portales de noticias)
      if (result.headlines.length > 0) {
        parts.push('');
        parts.push('**Titulares encontrados:**');
        result.headlines.slice(0, 20).forEach((h) => parts.push(`• ${h}`));
      }

      // Cuerpo del texto
      if (result.excerpt.trim().length > 50) {
        parts.push('');
        parts.push('**Contenido:**');
        parts.push(result.excerpt);
      }

      // Links relevantes (solo los que no son anclas internas)
      const externalLinks = result.links.filter(
        (l) => !l.includes('#') && l !== result.finalUrl,
      );
      if (externalLinks.length > 0) {
        parts.push('');
        parts.push('**Links encontrados:**');
        externalLinks.slice(0, 5).forEach((l) => parts.push(`- ${l}`));
      }

      sections.push(parts.filter(Boolean).join('\n'));
    }

    return sections.join('\n\n---\n\n');
  }

  // ── Nivel 2: Navegación autónoma ────────────────────────────────────────────

  async navigate(
    url: string,
    options?: { screenshot?: boolean; waitFor?: string },
  ): Promise<NavigationResult | BrowserError> {
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ userAgent: this.USER_AGENT });
      page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.TIMEOUT_MS });

      if (options?.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout: 5000 }).catch(() => {});
      }

      await this.deepScroll(page);

      const title = await page.title();
      const finalUrl = page.url();

      const text = await this.extractTextFromPage(page);
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 20)
          .map((a) => ({
            text: (a as HTMLAnchorElement).innerText?.trim().slice(0, 80) ?? '',
            href: (a as HTMLAnchorElement).href ?? '',
          }))
          .filter((l) => l.href.startsWith('http') && l.text.length > 2),
      );

      let screenshot: string | undefined;
      if (options?.screenshot) {
        const buf = await page.screenshot({ type: 'png', fullPage: false });
        screenshot = buf.toString('base64');
      }

      await context.close();
      return { url: finalUrl, title, text, links, screenshot };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[browser:navigate] error en ${url}: ${msg}`);
      if (page) await page.context().close().catch(() => {});
      return { url, error: msg };
    }
  }

  async search(
    query: string,
    limit = 5,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
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
        document.querySelectorAll('div.g, div[data-sokoban-container]').forEach((container) => {
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

  async fetchMultiple(urls: string[]): Promise<BrowserResult[]> {
    const results = await Promise.all(urls.map((u) => this.fetch(u)));
    return results.filter((r): r is BrowserResult => !('error' in r));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log('[browser] instancia de Playwright cerrada');
    }
  }

  // ── Estrategias de fetch ─────────────────────────────────────────────────────

  private async fetchRendered(url: string): Promise<BrowserResult | BrowserError> {
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({
        userAgent: this.USER_AGENT,
        extraHTTPHeaders: { 'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8' },
      });
      page = await context.newPage();

      // Bloquear recursos pesados que no aportan texto
      await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,mp4,mp3,avi}', (route) =>
        route.abort(),
      );
      // Bloquear también analytics/ads que alargan networkidle indefinidamente
      await page.route('**/{analytics,gtm,googletagmanager,doubleclick,facebook,hotjar,intercom}**', (route) =>
        route.abort(),
      );

      // ✅ Cambiado de 'networkidle' a 'domcontentloaded' — 10-15x más rápido
      // networkidle espera que TODA la red esté quieta (ads, analytics, etc.)
      // domcontentloaded dispara apenas el HTML principal está listo
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.GOTO_TIMEOUT });

      // Esperar a que el contenido principal aparezca (máx 3s, no bloqueante)
      await Promise.race([
        page.waitForSelector('article, .article, [class*="news"], [class*="nota"], main, h2, h3', {
          timeout: 3000,
        }).catch(() => {}),
        page.waitForTimeout(this.CONTENT_WAIT),
      ]);

      // Scroll profundo optimizado
      await this.deepScroll(page);

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

  private async fetchStatic(url: string): Promise<BrowserResult | BrowserError> {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': this.USER_AGENT, 'Accept-Language': 'es-AR,es;q=0.9' },
        timeout: this.TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      });
      const html = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
      return this.parseHtml(url, url, html, false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { url, error: msg };
    }
  }

  // ── Scroll profundo ──────────────────────────────────────────────────────────

  /**
   * Scroll progresivo en 3 pasos (antes 4) con 300ms entre pasos (antes 600ms).
   * Total: ~1.3s en lugar de ~3.4s anteriores.
   */
  private async deepScroll(page: Page): Promise<void> {
    try {
      await page.evaluate(async (stepMs: number) => {
        const totalHeight = document.body.scrollHeight;
        const steps = 3;
        for (let i = 1; i <= steps; i++) {
          window.scrollTo(0, (totalHeight / steps) * i);
          await new Promise((r) => setTimeout(r, stepMs));
        }
        window.scrollTo(0, 0);
      }, this.SCROLL_STEP_MS);
      await page.waitForTimeout(500); // antes: 1000ms
    } catch {
      // Scroll no crítico — ignorar error
    }
  }

  // ── Extractor de texto desde página viva ─────────────────────────────────────

  private async extractTextFromPage(page: Page): Promise<string> {
    const text = await page.evaluate(() => {
      const selectors = [
        'script, style, noscript, nav, footer, header',
        'aside, iframe, form, [aria-hidden="true"]',
        '[class*="cookie"], [class*="banner"], [class*="popup"]',
        '[class*="ads"], [class*="advertisement"], [id*="cookie"]',
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });
      return document.body?.innerText ?? '';
    });

    return text
      .replace(/\t+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, this.MAX_TEXT_CHARS);
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
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      originalUrl;

    const description =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('meta[name="description"]').attr('content')?.trim() ||
      '';

    // ── Extraer titulares antes de limpiar el DOM ──────────────────────────────
    const headlines: string[] = [];

    // Buscar en estructuras semánticas de artículos/noticias primero
    const newsSelectors = [
      'article h1, article h2, article h3',
      '.news-item h2, .news-item h3',
      '[class*="nota"] h2, [class*="nota"] h3',
      '[class*="news"] h2, [class*="news"] h3',
      '[class*="article"] h2, [class*="article"] h3',
      'h2 a, h3 a',          // links dentro de titulares (muy común en portales)
      'h2, h3',              // fallback general
    ];

    for (const selector of newsSelectors) {
      $(selector).each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text.length > 10 && text.length < 300 && !headlines.includes(text)) {
          headlines.push(text);
        }
      });
      if (headlines.length >= 30) break; // suficiente
    }

    // ── Limpiar DOM para extraer cuerpo ──────────────────────────────────────
    $(
      'script, style, noscript, nav, footer, header, aside, ' +
      'iframe, form, [aria-hidden="true"], ' +
      '[class*="cookie"], [class*="banner"], [class*="popup"], ' +
      '[class*="ads"], [class*="advertisement"]',
    ).remove();

    // Intentar extraer solo el cuerpo principal (article, main, etc.)
    let bodyText = '';
    const mainSelectors = ['article', 'main', '[role="main"]', '#content', '.content', 'body'];
    for (const sel of mainSelectors) {
      const candidate = $(sel).text();
      const clean = candidate.replace(/\s+/g, ' ').trim();
      if (clean.length > bodyText.length) {
        bodyText = clean;
        if (sel !== 'body') break; // prefiere semántico sobre body genérico
      }
    }

    const cleanText = bodyText
      .replace(/\t+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, this.MAX_TEXT_CHARS);

    // ── Links ────────────────────────────────────────────────────────────────
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      try {
        const abs = href.startsWith('http') ? href : new URL(href, finalUrl).href;
        if (!links.includes(abs) && !abs.includes('#') && links.length < 15) {
          links.push(abs);
        }
      } catch { /* ignorar href inválido */ }
    });

    // ── Imágenes ─────────────────────────────────────────────────────────────
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
      title: title.slice(0, 200),
      description: description.slice(0, 400),
      text: cleanText,
      excerpt: cleanText.slice(0, this.EXCERPT_CHARS),
      headlines: headlines.slice(0, 30),
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
      this.logger.log('[browser] iniciando Playwright Chromium...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      this.logger.log('[browser] Playwright Chromium listo');
    }
    return this.browser;
  }
}
