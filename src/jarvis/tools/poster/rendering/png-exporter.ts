import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

export interface RenderOutput {
  svgPath: string;
  pngPath: string;
  buffer: Buffer;
  durationMs: number;
}

@Injectable()
export class PngExporter {
  private readonly logger = new Logger(PngExporter.name);

  /**
   * Renderiza el contenido SVG en un navegador Chromium/Edge headless y exporta a PNG
   */
  async renderToDisk(
    svgContent: string,
    outputFilename: string,
    width = 720,
    height = 960,
  ): Promise<RenderOutput> {
    const startTime = Date.now();
    const outputDir = path.join(process.cwd(), 'storage', 'posters');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const svgPath = path.join(outputDir, `${outputFilename}.svg`);
    const pngPath = path.join(outputDir, `${outputFilename}.png`);

    // 1. Guardar SVG maestro en disco
    fs.writeFileSync(svgPath, svgContent, 'utf-8');

    // 2. Renderizar a PNG usando Edge/Chromium de Playwright
    let browser;
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewportSize({ width, height });

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; background: transparent; overflow: hidden; }
    svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

      await page.setContent(htmlContent, { waitUntil: 'load' });

      // Esperar brevemente para asegurar que los gradientes y filtros SVG se compilen
      await page.waitForTimeout(100);

      const buffer = await page.screenshot({
        type: 'png',
        omitBackground: false,
      });

      fs.writeFileSync(pngPath, buffer);

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `[poster] Renderizado exitoso: ${pngPath} (${buffer.length} bytes en ${durationMs}ms)`,
      );

      return {
        svgPath,
        pngPath,
        buffer,
        durationMs,
      };
    } catch (err: any) {
      this.logger.error(`[poster] Error renderizando PNG: ${err.message}`);
      throw new Error(`Fallo en el renderizado con Playwright: ${err.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
