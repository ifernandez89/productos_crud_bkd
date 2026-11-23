import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface HerbariumSyncReport {
  synced: boolean;
  sourceDir: string;
  totalPlants: number;
  updatedAt: string;
  reason: string;
}

@Injectable()
export class JarvisKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(JarvisKnowledgeService.name);
  private readonly knowledgeDir = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
  );
  private readonly herbariumRootDir =
    process.env.HERBARIO_SOURCE_DIR || 'G:\\Projects2\\PlantasMedicinales';
  private lastSyncCheckMs = 0;
  private readonly SYNC_CHECK_TTL_MS = 30_000;

  onModuleInit(): void {
    try {
      this.syncHerbariumFromSource(false);
    } catch (err: any) {
      this.logger.warn(
        `[herbario-sync] No se pudo sincronizar al iniciar: ${err.message}`,
      );
    }
  }

  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Sincroniza automáticamente src/jarvis/knowledge/plantas_medicinales.json
   * a partir del repositorio maestro G:\Projects2\PlantasMedicinales\content\plantas\*.md
   */
  syncHerbariumFromSource(force = false): HerbariumSyncReport {
    const contentPlantasDir = path.join(
      this.herbariumRootDir,
      'content',
      'plantas',
    );
    const targetJsonPath = path.join(
      this.knowledgeDir,
      'plantas_medicinales.json',
    );

    if (!fs.existsSync(contentPlantasDir)) {
      return {
        synced: false,
        sourceDir: contentPlantasDir,
        totalPlants: 0,
        updatedAt: new Date().toISOString(),
        reason: 'Directorio fuente de PlantasMedicinales no disponible',
      };
    }

    const mdFiles = fs
      .readdirSync(contentPlantasDir)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'es'));

    if (mdFiles.length === 0) {
      return {
        synced: false,
        sourceDir: contentPlantasDir,
        totalPlants: 0,
        updatedAt: new Date().toISOString(),
        reason: 'No se encontraron archivos .md en el herbario fuente',
      };
    }

    // Verificar si requiere actualización comparando mtime y cantidad de plantas
    if (!force && fs.existsSync(targetJsonPath)) {
      try {
        const targetStat = fs.statSync(targetJsonPath);
        const latestMdMtime = Math.max(
          ...mdFiles.map((f) =>
            fs.statSync(path.join(contentPlantasDir, f)).mtimeMs,
          ),
        );
        const existingJson = JSON.parse(
          fs.readFileSync(targetJsonPath, 'utf8'),
        );
        const existingCount = Array.isArray(existingJson?.plantas)
          ? existingJson.plantas.length
          : 0;
        const hasFullMetadata =
          existingJson?.metadata?.fuenteRepositorio === this.herbariumRootDir;

        if (
          hasFullMetadata &&
          existingCount === mdFiles.length &&
          targetStat.mtimeMs >= latestMdMtime
        ) {
          return {
            synced: false,
            sourceDir: contentPlantasDir,
            totalPlants: existingCount,
            updatedAt: new Date(targetStat.mtimeMs).toISOString(),
            reason: 'El herbario local ya está sincronizado y actualizado',
          };
        }
      } catch {
        // Si falla la lectura del JSON previo, forzar regeneración
      }
    }

    const plantas = mdFiles.map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(contentPlantasDir, file), 'utf8');
      return this.parseHerbariumMarkdown(slug, raw);
    });

    const payload = {
      metadata: {
        nombre: 'Herbario Oficial JarBees — Plantas Medicinales',
        version: 4,
        fuenteRepositorio: this.herbariumRootDir,
        actualizadoEn: new Date().toISOString(),
        totalPlantas: plantas.length,
        nota: 'Sincronizado automáticamente desde G:\\Projects2\\PlantasMedicinales\\content\\plantas.',
      },
      plantas,
    };

    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true });
    }
    fs.writeFileSync(
      targetJsonPath,
      JSON.stringify(payload, null, 2) + '\n',
      'utf8',
    );
    this.logger.log(
      `[herbario-sync] Sincronizadas ${plantas.length} plantas desde ${contentPlantasDir}`,
    );

    return {
      synced: true,
      sourceDir: contentPlantasDir,
      totalPlants: plantas.length,
      updatedAt: payload.metadata.actualizadoEn,
      reason: 'Sincronización completada desde repositorio PlantasMedicinales',
    };
  }

  /**
   * Parser ligero y determinista de frontmatter YAML + cuerpo Markdown de cada planta
   */
  private parseHerbariumMarkdown(slug: string, raw: string): Record<string, any> {
    const normalizedRaw = raw.replace(/\r\n/g, '\n');
    const fmMatch = normalizedRaw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const fmText = fmMatch ? fmMatch[1] : '';
    const bodyText = fmMatch ? fmMatch[2].trim() : normalizedRaw.trim();

    const extractScalar = (key: string): string | null => {
      const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
      const m = fmText.match(regex);
      if (!m) return null;
      const val = m[1].trim().replace(/^["']|["']$/g, '');
      return val === '[]' || val === 'null' || val === '' ? null : val;
    };

    const extractList = (key: string): string[] => {
      const lines = fmText.split('\n');
      const result: string[] = [];
      let inList = false;

      for (const line of lines) {
        if (new RegExp(`^${key}:\\s*\\[\\s*\\]`).test(line)) {
          return [];
        }
        if (new RegExp(`^${key}:\\s*$`).test(line)) {
          inList = true;
          continue;
        }
        if (inList) {
          const itemMatch = line.match(/^\s+-\s+(.+)$/);
          if (itemMatch && !line.match(/^\s+-\s+\w+:/)) {
            result.push(itemMatch[1].trim().replace(/^["']|["']$/g, ''));
          } else if (/^\S/.test(line)) {
            break;
          }
        }
      }
      return result;
    };

    // Extraer secciones clave del cuerpo Markdown (Descripción, Clave Morfológica, Formas de uso)
    const cleanBody = bodyText
      .replace(/^##\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const summaryDescription =
      cleanBody.length > 900 ? `${cleanBody.slice(0, 900)}...` : cleanBody;

    const imagen = extractScalar('imagen');
    const imagenesAdicionales = extractList('imagenes');
    const todasLasImagenes = Array.from(
      new Set([
        ...(imagen ? [imagen] : []),
        ...imagenesAdicionales,
      ]),
    );

    return {
      nombre: extractScalar('nombre') || slug,
      slug: extractScalar('slug') || slug,
      nombreCientifico: extractScalar('nombreCientifico'),
      familia: extractScalar('familia'),
      otrosNombres: extractList('otrosNombres'),
      origen: extractScalar('origen'),
      distribucion: extractList('distribucion'),
      habitat: extractScalar('habitat'),
      acciones: extractList('acciones'),
      sistemas: extractList('sistemas'),
      afecciones: extractList('afecciones'),
      principiosActivos: extractList('principiosActivos'),
      usosEtnobotanicos: extractList('usosEtnobotanicos'),
      precauciones: extractList('precauciones'),
      contraindicaciones: extractList('contraindicaciones'),
      toxicidad: extractScalar('toxicidad'),
      epocaFloracion: extractScalar('epocaFloracion'),
      epocaFructificacion: extractScalar('epocaFructificacion'),
      tipoCiclo: extractScalar('tipoCiclo'),
      imagen,
      imagenes: todasLasImagenes,
      descripcion: summaryDescription || null,
    };
  }

  private ensureHerbariumFresh(): void {
    const now = Date.now();
    if (now - this.lastSyncCheckMs < this.SYNC_CHECK_TTL_MS) return;
    this.lastSyncCheckMs = now;
    try {
      this.syncHerbariumFromSource(false);
    } catch {
      // Silenciar en caso de unidad G: desconectada temporalmente
    }
  }

  private getFiles(): string[] {
    this.ensureHerbariumFresh();
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
   * acciones terapéuticas, afecciones, principios activos, aplicaciones, chakras, efectos.
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
      'familia',
      'categoria',
    ]) {
      if (typeof item[field] === 'string') raw.push(item[field]);
    }

    // Arrays de texto (acciones, otrosNombres, principiosActivos, afecciones, etc.)
    for (const field of [
      'otrosNombres',
      'sinonimos',
      'nombres',
      'aliases',
      'acciones',
      'afecciones',
      'sistemas',
      'principiosActivos',
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

    // Expandir nombre principal y nombre científico por separadores comunes
    for (const compound of [
      item.nombre,
      item.title,
      item.titulo,
      item.nombreCientifico,
    ]) {
      if (typeof compound === 'string') {
        compound.split(/[\(\)\-\—\/,\.]/).forEach((p: string) => {
          const t = p.trim();
          if (t.length >= 3) raw.push(t);
        });
      }
    }

    return Array.from(new Set(raw))
      .map((k) => this.normalizeText(k))
      .filter((k) => k.length >= 3);
  }

  /**
   * Verifica si el query hace referencia al conjunto de conocimiento completo.
   * Ej: "qué es el munay ki", "plantas medicinales", "herbario", "sanaciones populares".
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
        'herbario',
        'boticario',
        'seccion de plantas',
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

    // No secuestrar consultas explicativas, de propiedades, usos o precauciones
    if (
      /\b(?:para\s+que\s+sirv|propiedades|precauciones|contraindicaciones|como\s+se\s+(?:prepara|usa|toma)|dosis|principios\s+activos|beneficios|diferencia|comparar|explica(?:me)?)\b/i.test(
        normalizedQuery,
      )
    ) {
      return null;
    }

    const isListQuery =
      /\b(?:lista(?:r|me)?|listado|mostra(?:r|me)?|ver\s+(?:todas?|el|la|los|las)|todas?\s+(?:las|los)|cuantas?\s+(?:plantas|hierbas|especies|ritos|sanaciones)|cuales\s+(?:son\s+(?:las|los)|plantas|hierbas|especies|ritos|sanaciones|tenemos|hay)|que\s+(?:plantas|hierbas|especies|ritos|sanaciones)\s+(?:tenemos|hay|tenes|tengo|registradas?|guardadas?)|tenemos\s+registrad[ao]s?|hay\s+registrad[ao]s?|catalogo\s+de\s+(?:plantas|hierbas))\b/i.test(
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

      // Si el usuario preguntó por una planta o entidad específica por nombre, dejar pasar al motor RAG/LLM
      const mentionsSpecificItem = main.items.some((item: any) => {
        const itemName = this.normalizeText(
          item.nombre || item.title || item.titulo || '',
        );
        if (itemName.length < 4) return false;
        const escaped = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(normalizedQuery);
      });
      if (mentionsSpecificItem) return null;

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
          .slice(0, 6)
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
          'dolor',
          'epilepsia',
          'convulsiones',
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
