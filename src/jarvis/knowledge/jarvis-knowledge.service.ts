import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class JarvisKnowledgeService {
  private readonly logger = new Logger(JarvisKnowledgeService.name);
  private readonly knowledgeDir = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
  );

  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private getFiles(): string[] {
    try {
      if (!fs.existsSync(this.knowledgeDir)) return [];
      return fs
        .readdirSync(this.knowledgeDir)
        .filter((f) => f.endsWith('.json'));
    } catch (err: any) {
      this.logger.error(`Error reading knowledge directory: ${err.message}`);
      return [];
    }
  }

  private loadFile(filename: string): any {
    try {
      const content = fs.readFileSync(
        path.join(this.knowledgeDir, filename),
        'utf8',
      );
      return JSON.parse(content);
    } catch (err: any) {
      this.logger.error(
        `Error reading knowledge file ${filename}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Devuelve TODOS los arrays de items útiles de un JSON.
   * Filtra arrays de strings simples o con claves numéricas (no son entidades).
   */
  private getAllItemArrays(data: any): Array<{ key: string; items: any[] }> {
    const result: Array<{ key: string; items: any[] }> = [];
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (!Array.isArray(val) || val.length === 0) continue;
      const first = val[0];
      if (typeof first !== 'object' || first === null) continue;
      // Saltear objetos con claves numéricas (arrays planos mal estructurados)
      if (Object.keys(first).every((k) => /^\d+$/.test(k))) continue;
      result.push({ key, items: val });
    }
    return result;
  }

  /**
   * Extrae keywords de un item: nombre, nombre científico, sinónimos,
   * acciones terapéuticas, aplicaciones, chakras, efectos.
   */
  private getItemKeywords(item: any): string[] {
    const raw: string[] = [];

    // Campos de texto directo
    for (const field of [
      'nombre',
      'title',
      'titulo',
      'nombreAlternativo',
      'slug',
      'nombreCientifico',
      'categoria',
    ]) {
      if (typeof item[field] === 'string') raw.push(item[field]);
    }

    // Arrays de texto (acciones, aplicaciones, chakras, etc.)
    for (const field of [
      'sinonimos',
      'nombres',
      'aliases',
      'acciones',
      'aplicacion',
      'chakras',
      'centrosDePoder',
      'conexion',
      'efecto',
      'accionTerapeutica',
      'propiedad',
    ]) {
      if (Array.isArray(item[field])) {
        item[field].forEach((v: any) => typeof v === 'string' && raw.push(v));
      } else if (typeof item[field] === 'string') {
        raw.push(item[field]);
      }
    }

    // Expandir nombre principal por separadores comunes
    const primary = item.nombre || item.title || item.titulo;
    if (primary) {
      primary.split(/[\(\)\-\—\/,]/).forEach((p: string) => {
        const t = p.trim();
        if (t.length >= 3) raw.push(t);
      });
    }

    return Array.from(new Set(raw))
      .map((k) => this.normalizeText(k))
      .filter((k) => k.length >= 3);
  }

  /**
   * Verifica si el query hace referencia al conjunto de conocimiento completo.
   * Ej: "qué es el munay ki", "plantas medicinales", "sanaciones populares".
   */
  private matchesWholeDatabase(normalizedQuery: string, file: string): boolean {
    const dbKey = file.replace('.json', '');
    const aliases: Record<string, string[]> = {
      munay_ki: [
        'munay ki',
        'munay-ki',
        'ritos del inca',
        'iniciaciones andinas',
        'karpay',
      ],
      plantas_medicinales: [
        'planta medicinal',
        'plantas medicinales',
        'hierbas medicinales',
        'herbolaria',
        'fitoterapia',
      ],
      sanaciones_populares: [
        'sanacion popular',
        'sanaciones populares',
        'curas populares',
        'remedios populares',
      ],
    };
    const terms = [
      this.normalizeText(dbKey.replace(/[-_]/g, ' ')),
      ...(aliases[dbKey] ?? []),
    ];
    return terms.some((t) => normalizedQuery.includes(t));
  }

  /**
   * Formatea un item para mostrar en el contexto del LLM.
   */
  private formatItem(item: any): string {
    const title = item.nombre || item.title || item.titulo || 'Elemento';
    const skipFields = new Set(['nombre', 'title', 'titulo', 'slug', 'numero']);
    const lines: string[] = [];

    for (const key of Object.keys(item)) {
      if (skipFields.has(key)) continue;
      const val = item[key];
      if (val === null || val === undefined) continue;
      if (Array.isArray(val) && val.length === 0) continue;
      if (typeof val === 'boolean') continue;

      const label =
        key.charAt(0).toUpperCase() +
        key
          .slice(1)
          .replace(/([A-Z])/g, ' $1')
          .trim();

      if (Array.isArray(val)) {
        lines.push(`  - **${label}**: ${val.join(', ')}`);
      } else if (typeof val === 'object') {
        const sub = Object.entries(val)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        if (sub) lines.push(`  - **${label}**: ${sub}`);
      } else if (String(val).trim()) {
        lines.push(`  - **${label}**: ${val}`);
      }
    }

    return `• **${title}**:\n${lines.join('\n')}`;
  }

  // ── API pública ──────────────────────────────────────────────────────────────

  async handleListCommand(message: string): Promise<string | null> {
    const normalizedQuery = this.normalizeText(message);
    const isListQuery =
      /(lista|cuales|que|que clase|que tipo|mostrar|tenemos registradas?|hay registradas?|guardadas?|guardados?)/i.test(
        normalizedQuery,
      );
    if (!isListQuery) return null;

    for (const file of this.getFiles()) {
      if (!this.matchesWholeDatabase(normalizedQuery, file)) continue;

      const data = this.loadFile(file);
      if (!data) continue;

      const arrays = this.getAllItemArrays(data);
      if (arrays.length === 0) continue;

      const main = arrays.sort((a, b) => b.items.length - a.items.length)[0];
      const names = main.items
        .map((item: any) => item.nombre || item.title || item.titulo)
        .filter(Boolean);

      const dbName =
        data.metadata?.nombre ||
        file.replace('.json', '').replace(/[-_]/g, ' ');

      return [
        `🗃️ **Conocimiento Registrado: ${dbName}**`,
        `Tenemos ${names.length} elementos registrados:`,
        '',
        names.map((n: string) => `• ${n}`).join('\n'),
        '',
        `💡 Consultá detalles sobre cualquiera de ellos.`,
      ].join('\n');
    }

    return null;
  }

  /**
   * Escanea todos los JSONs buscando coincidencias con la query.
   * Estrategia 1: match por nombre/keywords de item específico.
   * Estrategia 2: si el query refiere a toda la base, devuelve introducción + resumen.
   */
  async extractRelevantContext(message: string): Promise<string | null> {
    const normalizedQuery = this.normalizeText(message);
    const files = this.getFiles();
    const matches: string[] = [];

    for (const file of files) {
      const data = this.loadFile(file);
      if (!data) continue;

      const dbName =
        data.metadata?.nombre ||
        file.replace('.json', '').replace(/[-_]/g, ' ');
      const arrays = this.getAllItemArrays(data);

      // Estrategia 1: match por item específico
      const matchingItems: any[] = [];

      for (const { items } of arrays) {
        for (const item of items) {
          const keywords = this.getItemKeywords(item);

          for (const keyword of keywords) {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let matched = false;
            try {
              matched = new RegExp(`\\b${escaped}\\b`, 'i').test(
                normalizedQuery,
              );
            } catch {
              matched = normalizedQuery.includes(keyword);
            }

            if (matched) {
              matchingItems.push(item);
              break;
            }
          }
        }
      }

      if (matchingItems.length > 0) {
        const itemsText = matchingItems
          .map((item) => this.formatItem(item))
          .join('\n\n');
        matches.push(
          [`### BASE DE CONOCIMIENTO LOCAL: ${dbName}`, itemsText].join('\n'),
        );
        this.logger.log(
          `[knowledge] "${file}": ${matchingItems.length} item(s) para query "${message.slice(0, 50)}"`,
        );
        continue;
      }

      // Estrategia 2: el query pregunta sobre la base entera
      if (this.matchesWholeDatabase(normalizedQuery, file)) {
        const intro = data.metadata?.descripcion || data.introduccion || '';
        const allArrays = this.getAllItemArrays(data);
        const main = allArrays.sort(
          (a, b) => b.items.length - a.items.length,
        )[0];

        if (main) {
          const names = main.items
            .map((item: any) => item.nombre || item.title || item.titulo)
            .filter(Boolean)
            .slice(0, 15);

          matches.push(
            [
              `### BASE DE CONOCIMIENTO LOCAL: ${dbName}`,
              intro ? `${intro}\n` : '',
              `Contiene ${main.items.length} elementos. Ejemplos: ${names.join(', ')}${main.items.length > 15 ? '...' : ''}.`,
              `Para detalles sobre uno específico, mencioná su nombre.`,
            ]
              .filter(Boolean)
              .join('\n'),
          );

          this.logger.log(
            `[knowledge] "${file}": match de base completa para query "${message.slice(0, 50)}"`,
          );
        }
      }

      // Estrategia 3: búsqueda por propiedades terapéuticas o características
      // Ej: "plantas para la digestión", "sanaciones para la ansiedad"
      if (matches.length === 0 && file.includes('plantas')) {
        const therapeuticTerms = [
          'digestión',
          'digestion',
          'indigestion',
          'stomach',
          'sueño',
          'sueno',
          'sleep',
          'ansiedad',
          'anxiety',
          'inflamación',
          'inflamacion',
          'stress',
        ];
        const isTherapeuticQuery = therapeuticTerms.some((term) =>
          normalizedQuery.includes(term),
        );

        if (isTherapeuticQuery) {
          const allArrays = this.getAllItemArrays(data);
          const main = allArrays.sort(
            (a, b) => b.items.length - a.items.length,
          )[0];

          if (main) {
            const names = main.items
              .map((item: any) => item.nombre || item.title || item.titulo)
              .filter(Boolean)
              .slice(0, 15);

            matches.push(
              [
                `### BASE DE CONOCIMIENTO LOCAL: ${dbName}`,
                `Búsqueda por propiedad terapéutica detectada.`,
                `Contiene ${main.items.length} plantas registradas. Ejemplos: ${names.join(', ')}${main.items.length > 15 ? '...' : ''}.`,
                `Para detalles sobre plantas específicas, mencioná su nombre.`,
              ]
                .filter(Boolean)
                .join('\n'),
            );

            this.logger.log(
              `[knowledge] "${file}": therapeutic property search para query "${message.slice(0, 50)}"`,
            );
          }
        }
      }
    }

    return matches.length > 0 ? matches.join('\n\n') : null;
  }
}
