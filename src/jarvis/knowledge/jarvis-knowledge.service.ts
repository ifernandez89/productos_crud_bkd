import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class JarvisKnowledgeService {
  private readonly logger = new Logger(JarvisKnowledgeService.name);
  private readonly knowledgeDir = path.join(process.cwd(), 'src', 'jarvis', 'knowledge');

  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private getFiles(): string[] {
    try {
      if (!fs.existsSync(this.knowledgeDir)) {
        return [];
      }
      return fs.readdirSync(this.knowledgeDir).filter(f => f.endsWith('.json'));
    } catch (err: any) {
      this.logger.error(`Error reading knowledge directory: ${err.message}`);
      return [];
    }
  }

  private loadFile(filename: string): any {
    try {
      const filePath = path.join(this.knowledgeDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err: any) {
      this.logger.error(`Error reading knowledge file ${filename}: ${err.message}`);
      return null;
    }
  }

  /**
   * Detects if the query asks for a list of elements from a specific knowledge database.
   * e.g. "qué plantas medicinales tenemos registradas?" -> lists names of all plants.
   */
  async handleListCommand(message: string): Promise<string | null> {
    const normalizedQuery = this.normalizeText(message);
    const files = this.getFiles();

    for (const file of files) {
      const dbKey = file.replace('.json', ''); // e.g. "plantas_medicinales"
      const dbLabel = dbKey.replace(/[-_]/g, ' '); // e.g. "plantas medicinales"
      const normalizedLabel = this.normalizeText(dbLabel);

      if (normalizedQuery.includes(normalizedLabel)) {
        const isListQuery = /(lista|cuales|que|que\s+clase|que\s+tipo|mostrar|tenemos\s+registradas?|tenemos\s+registrados?|hay\s+registradas?|guardadas?|guardados?)/i.test(normalizedQuery);
        
        if (isListQuery) {
          const data = this.loadFile(file);
          if (!data) continue;

          const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
          if (arrayKey && data[arrayKey].length > 0) {
            const items = data[arrayKey];
            const names = items.map((item: any) => item.nombre || item.title || item.titulo).filter(Boolean);
            const dbName = data.metadata?.nombre || dbLabel;

            return [
              `🗃️ **Conocimiento Registrado: ${dbName}**`,
              `Tenemos ${names.length} elementos registrados:`,
              ``,
              names.map((name: string) => `• ${name}`).join('\n'),
              ``,
              `💡 Podés consultar detalles sobre cualquiera de ellos (por ejemplo: "para qué sirve el Cedrón?" o "cómo se cura la culebrilla?")`
            ].join('\n');
          }
        }
      }
    }
    return null;
  }

  /**
   * Scans all items in JSON files and extracts the full details of any item mentioned in the query.
   * Returns a formatted markdown string to be injected in the LLM context.
   */
  async extractRelevantContext(message: string): Promise<string | null> {
    const normalizedQuery = this.normalizeText(message);
    const files = this.getFiles();
    const matches: string[] = [];

    for (const file of files) {
      const data = this.loadFile(file);
      if (!data) continue;

      const dbName = data.metadata?.nombre || file.replace('.json', '').replace(/[-_]/g, ' ');
      const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
      if (!arrayKey) continue;

      const items = data[arrayKey];
      const matchingItems: any[] = [];

      for (const item of items) {
        const keywords = this.getItemKeywords(item);
        
        for (const keyword of keywords) {
          if (keyword.length < 3) continue; // Skip short keywords to prevent false matches
          
          const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (regex.test(normalizedQuery)) {
            matchingItems.push(item);
            break;
          }
        }
      }

      if (matchingItems.length > 0) {
        const itemsText = matchingItems.map(item => {
          const title = item.nombre || item.title || item.titulo || 'Elemento';
          let body = '';
          
          for (const key of Object.keys(item)) {
            if (['nombre', 'slug', 'title', 'titulo'].includes(key)) continue;
            const val = item[key];
            if (val === null || val === undefined || (Array.isArray(val) && val.length === 0)) continue;
            
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            if (Array.isArray(val)) {
              body += `  - **${label}**: ${val.join(', ')}\n`;
            } else if (typeof val === 'object') {
              body += `  - **${label}**: ${JSON.stringify(val)}\n`;
            } else {
              body += `  - **${label}**: ${val}\n`;
            }
          }
          
          return `• **${title}**:\n${body}`;
        }).join('\n');

        matches.push([
          `### BASE DE CONOCIMIENTO LOCAL: ${dbName}`,
          `Información importante preseleccionada y resumida sobre tu consulta:`,
          itemsText
        ].join('\n'));
      }
    }

    if (matches.length > 0) {
      return matches.join('\n\n');
    }
    return null;
  }

  private getItemKeywords(item: any): string[] {
    const keywords: string[] = [];
    
    if (item.nombre) keywords.push(item.nombre);
    if (item.title) keywords.push(item.title);
    if (item.titulo) keywords.push(item.titulo);
    
    const primaryName = item.nombre || item.title || item.titulo;
    if (primaryName) {
      // Split by common separators (e.g. "Culebrilla (Herpes Zóster) — Cura 1" -> "Culebrilla", "Herpes Zóster")
      const parts = primaryName.split(/[\(\)\-\—\/]/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length >= 3) {
          keywords.push(trimmed);
        }
      }
    }

    if (item.slug) {
      keywords.push(item.slug.replace(/[-_]/g, ' '));
    }
    
    if (item.nombreCientifico) {
      keywords.push(item.nombreCientifico);
    }
    
    return Array.from(new Set(keywords)).map(k => this.normalizeText(k));
  }
}
