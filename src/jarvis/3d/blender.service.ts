import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
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

export interface CinematicDioramaOptions {
  heroModel?: string;           // 'character' | ruta GLB relativa o absoluta
  action?: 'jump' | 'walk' | 'idle' | 'static' | 'none';
  frame?: number;               // frame de animación (default 6 para jump)
  pedestal?: 'grass-round' | 'large' | 'none';
  mood?: 'golden_hour' | 'cyberpunk' | 'daylight' | 'studio';
  width?: number;               // default 2048
  height?: number;              // default 1536
  samples?: number;             // default 64
  outputRenderPath?: string;
  includeProps?: boolean;       // default true
}

export interface CinematicDioramaResult {
  status: 'success' | 'error';
  output: string;
  width: number;
  height: number;
  hero: string;
  action: string;
  frame: number;
  pedestal: string;
  mood: string;
  props: string[];
  objects_in_scene: number;
  materials_in_scene: number;
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
   * Inspecciona las propiedades geométricas y materiales de un archivo GLB o contenedor .jb3d
   */
  async inspectModel(modelPath: string): Promise<ModelInspectionResult> {
    if (!this.isAvailable()) {
      throw new Error('Blender no está instalado o no se encuentra la ruta en BLENDER_PATH');
    }

    const absPath = path.resolve(modelPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`El archivo de modelo no existe: ${absPath}`);
    }

    let targetGlb = absPath;
    let tempGlbCreated = false;

    // Si es un contenedor protegido .jb3d, descifrar temporalmente para inspección
    if (absPath.toLowerCase().endsWith('.jb3d')) {
      const buffer = fs.readFileSync(absPath);
      if (
        buffer.length >= 30 &&
        buffer[0] === 0x4a &&
        buffer[1] === 0x42 &&
        buffer[2] === 0x33 &&
        buffer[3] === 0x44
      ) {
        const key = crypto
          .createHash('sha256')
          .update('JarbeesFlightSim_BeeMesh_SecureSignature_v1Jarbees:TheGame:ProtectedAsset:2026')
          .digest();
        const iv = buffer.subarray(6, 22);
        const ciphertext = buffer.subarray(30);
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

        const tempDir = path.resolve('storage/trials');
        fs.mkdirSync(tempDir, { recursive: true });
        targetGlb = path.join(tempDir, `inspect_temp_${Date.now()}.glb`);
        fs.writeFileSync(targetGlb, decrypted);
        tempGlbCreated = true;
      }
    }

    try {
      const scriptPath = path.resolve('scripts/blender/inspect_glb.py');
      const args = [
        '-b',
        '--python-exit-code', '1',
        '-P', scriptPath,
        '--',
        '--input', targetGlb,
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
      const report = JSON.parse(jsonStr) as ModelInspectionResult;
      report.file = absPath;
      return report;
    } finally {
      if (tempGlbCreated && fs.existsSync(targetGlb)) {
        try {
          fs.unlinkSync(targetGlb);
        } catch {
          // Ignore temp cleanup error
        }
      }
    }
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

  /**
   * Genera un render cinematográfico 3D de diorama con pedestal, sujeto hero, props y DoF
   */
  async renderCinematicDiorama(options: CinematicDioramaOptions = {}): Promise<CinematicDioramaResult> {
    if (!this.isAvailable()) {
      throw new Error('Blender no está disponible en este entorno');
    }

    const startTime = Date.now();
    const hero = options.heroModel ?? 'character';
    const action = options.action ?? 'jump';
    const frame = options.frame ?? 6;
    const pedestal = options.pedestal ?? 'grass-round';
    const mood = options.mood ?? 'golden_hour';
    const width = options.width ?? 2048;
    const height = options.height ?? 1536;
    const samples = options.samples ?? 64;
    const outputPath = options.outputRenderPath 
      ? path.resolve(options.outputRenderPath)
      : path.resolve('storage/assets/renders', `diorama_${action}_${mood}_${Date.now()}.png`);

    const scriptPath = path.resolve('scripts/blender/render_cinematic_diorama.py');
    const args = [
      '-b',
      '--python-exit-code', '1',
      '-P', scriptPath,
      '--',
      '--hero', hero,
      '--action', action,
      '--frame', String(frame),
      '--pedestal', pedestal,
      '--mood', mood,
      '--width', String(width),
      '--height', String(height),
      '--samples', String(samples),
      '--output', outputPath,
    ];

    if (options.includeProps === false) {
      // Por defecto el script incluye props
    }

    this.logger.log(`[BlenderService] Generando diorama cinematográfico (Hero: ${hero}, Mood: ${mood})...`);
    const { stdout } = await execFileAsync(this.blenderPath!, args, { timeout: 60000 });

    const startTag = '>>> DIORAMA_RENDER_START >>>';
    const endTag = '<<< DIORAMA_RENDER_END <<<';

    const startIndex = stdout.indexOf(startTag);
    const endIndex = stdout.indexOf(endTag);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error('No se pudo extraer el reporte del diorama de Blender');
    }

    const jsonStr = stdout.slice(startIndex + startTag.length, endIndex).trim();
    const result = JSON.parse(jsonStr) as CinematicDioramaResult;
    result.durationMs = Date.now() - startTime;

    this.logger.log(
      `[BlenderService] Diorama cinematográfico renderizado en ${result.durationMs}ms: ` +
      `${result.objects_in_scene} objetos, salida: ${result.output}`
    );

    return result;
  }

  /**
   * Construye un objeto paramétrico en Blender a partir de una especificación JSON de Object Lab
   */
  async generateParametricObject(options: {
    specPath: string;
    outBlend?: string;
    outGlb?: string;
  }): Promise<{ status: string; glb: string; blend: string; durationMs: number }> {
    if (!this.isAvailable()) {
      throw new Error('Blender no está disponible en este entorno');
    }

    const startTime = Date.now();
    const absSpec = path.resolve(options.specPath);
    if (!fs.existsSync(absSpec)) {
      throw new Error(`Especificación de objeto no encontrada: ${absSpec}`);
    }

    const parsed = path.parse(absSpec);
    const baseName = parsed.name.replace(/\.object$/, '');
    const outBlend = options.outBlend
      ? path.resolve(options.outBlend)
      : path.resolve('storage/assets/models', `${baseName}.blend`);
    const outGlb = options.outGlb
      ? path.resolve(options.outGlb)
      : path.resolve('storage/assets/models', `${baseName}.glb`);

    await fs.promises.mkdir(path.dirname(outBlend), { recursive: true });
    await fs.promises.mkdir(path.dirname(outGlb), { recursive: true });

    const scriptPath = path.resolve('scripts/blender/generate_jarbees_object.py');
    const args = [
      '-b',
      '--python-exit-code', '1',
      '-P', scriptPath,
      '--',
      '--spec', absSpec,
      '--out', outBlend,
      '--glb', outGlb,
    ];

    this.logger.log(`[BlenderService] Generando objeto paramétrico ${baseName}...`);
    await execFileAsync(this.blenderPath!, args, { timeout: 60000 });

    const durationMs = Date.now() - startTime;
    return {
      status: 'success',
      glb: outGlb,
      blend: outBlend,
      durationMs,
    };
  }
}
