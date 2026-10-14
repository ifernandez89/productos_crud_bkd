import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface BoundingBoxInfo {
  width: number;
  depth: number;
  height: number;
  center: [number, number, number];
}

export interface MaterialInfo {
  name: string;
  has_texture: boolean;
  nodes_count: number;
}

export interface ModelInspectionResult {
  status: 'success' | 'error';
  file: string;
  mesh_count: number;
  meshes: string[];
  total_vertices: number;
  total_triangles: number;
  materials: MaterialInfo[];
  bounding_box: BoundingBoxInfo;
  message?: string;
}

export interface WeatheringOptions {
  inputGlbPath: string;
  outputGlbPath?: string;
  renderBeforePath?: string;
  renderAfterPath?: string;
  mossCoverage?: number;    // 0.0 a 1.0 (default 0.40)
  dirtIntensity?: number;   // 0.0 a 1.0 (default 0.50)
  normalStrength?: number;  // 0.0 a 1.0 (default 0.65)
  resolution?: number;      // pixels, default 1024
}

export interface WeatheringResult {
  status: 'success' | 'error';
  input: string;
  output: string;
  render_before?: string;
  render_after?: string;
  materials_modified: number;
  total_vertices: number;
  total_triangles: number;
  parameters: {
    moss_coverage: number;
    dirt_intensity: number;
    normal_strength: number;
  };
  durationMs: number;
  message?: string;
}

@Injectable()
export class BlenderService {
  private readonly logger = new Logger(BlenderService.name);
  private blenderPath: string | null = null;

  constructor() {
    this.blenderPath = this.resolveBlenderPath();
  }

  /**
   * Resuelve la ruta del ejecutable de Blender
   */
  private resolveBlenderPath(): string | null {
    const custom = process.env.BLENDER_PATH?.trim();
    if (custom && fs.existsSync(custom)) {
      return custom;
    }

    const standardPaths = [
      'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    ];

    for (const p of standardPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /** Indica si Blender está instalado y disponible en el sistema */
  isAvailable(): boolean {
    return this.blenderPath !== null && fs.existsSync(this.blenderPath);
  }

  /** Devuelve la ruta configurada de Blender */
  getBlenderPath(): string | null {
    return this.blenderPath;
  }

  /**
   * Inspecciona las propiedades geométricas y materiales de un archivo GLB
   */
  async inspectModel(glbPath: string): Promise<ModelInspectionResult> {
    if (!this.isAvailable()) {
      throw new Error('Blender no está instalado o no se encuentra la ruta en BLENDER_PATH');
    }

    const absGlb = path.resolve(glbPath);
    if (!fs.existsSync(absGlb)) {
      throw new Error(`El archivo GLB no existe: ${absGlb}`);
    }

    const scriptPath = path.resolve('scripts/blender/inspect_glb.py');
    const args = [
      '-b',
      '--python-exit-code', '1',
      '-P', scriptPath,
      '--',
      '--input', absGlb,
    ];

    const { stdout } = await execFileAsync(this.blenderPath!, args, { timeout: 30000 });

    const startTag = '>>> INSPECTION_REPORT_START >>>';
    const endTag = '<<< INSPECTION_REPORT_END <<<';

    const startIndex = stdout.indexOf(startTag);
    const endIndex = stdout.indexOf(endTag);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error('No se pudo extraer el reporte JSON de la salida de Blender');
    }

    const jsonStr = stdout.slice(startIndex + startTag.length, endIndex).trim();
    return JSON.parse(jsonStr) as ModelInspectionResult;
  }

  /**
   * Aplica desgaste PBR, musgo procedural y genera renders comparativos
   */
  async applyWeathering(options: WeatheringOptions): Promise<WeatheringResult> {
    if (!this.isAvailable()) {
      throw new Error('Blender no está disponible en este entorno');
    }

    const startTime = Date.now();
    const absInput = path.resolve(options.inputGlbPath);
    if (!fs.existsSync(absInput)) {
      throw new Error(`Archivo de entrada no existe: ${absInput}`);
    }

    const parsedPath = path.parse(absInput);
    const absOutput = options.outputGlbPath 
      ? path.resolve(options.outputGlbPath)
      : path.join(parsedPath.dir, `${parsedPath.name}_weathered.glb`);

    const renderBefore = options.renderBeforePath 
      ? path.resolve(options.renderBeforePath)
      : path.resolve('storage/assets/renders', `${parsedPath.name}_before.png`);

    const renderAfter = options.renderAfterPath
      ? path.resolve(options.renderAfterPath)
      : path.resolve('storage/assets/renders', `${parsedPath.name}_after.png`);

    const scriptPath = path.resolve('scripts/blender/apply_weathering.py');
    const args = [
      '-b',
      '--python-exit-code', '1',
      '-P', scriptPath,
      '--',
      '--input', absInput,
      '--output', absOutput,
      '--render-before', renderBefore,
      '--render-after', renderAfter,
      '--moss-coverage', String(options.mossCoverage ?? 0.40),
      '--dirt-intensity', String(options.dirtIntensity ?? 0.50),
      '--normal-strength', String(options.normalStrength ?? 0.65),
      '--resolution', String(options.resolution ?? 1024),
    ];

    this.logger.log(`[BlenderService] Ejecutando desgaste procedural sobre ${parsedPath.name}...`);
    const { stdout } = await execFileAsync(this.blenderPath!, args, { timeout: 60000 });

    const startTag = '>>> WEATHERING_RESULT_START >>>';
    const endTag = '<<< WEATHERING_RESULT_END <<<';

    const startIndex = stdout.indexOf(startTag);
    const endIndex = stdout.indexOf(endTag);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error('No se pudo extraer el reporte de desgaste de Blender');
    }

    const jsonStr = stdout.slice(startIndex + startTag.length, endIndex).trim();
    const result = JSON.parse(jsonStr) as WeatheringResult;
    result.durationMs = Date.now() - startTime;

    this.logger.log(
      `[BlenderService] Desgaste completado en ${result.durationMs}ms: ` +
      `${result.materials_modified} materiales, ${result.total_vertices} vértices preservados.`
    );

    return result;
  }
}
