import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpException,
  ForbiddenException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { BlenderService } from '../blender.service';
import { AssetSecurityService } from '../services/asset-security.service';
import { Game3DRosterService } from '../services/game-3d-roster.service';
import { ObjectLabService } from '../services/object-lab.service';
import {
  SecurityKernelAuthGuard,
  RequireSecurityPermission,
} from '../../security/security-kernel-auth.guard';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 🎬 JarBees Studio 3D Controller
 *
 * API REST de alto rendimiento para el motor 3D de JarBees y el ecosistema Jarbees_the_game:
 * - Telemetría de Personajes y Hall of Armors (PBR, métricas reales, Three.js)
 * - Seguridad y Protección de Contenedores .jb3d (AES-256-CTR)
 * - Object Lab Paramétrico y Ensamblaje Cinemático
 * - Renders Cinemáticos Headless (Dioramas, Desgaste PBR, Inspección de Malla)
 *
 * Endurecido en DEV-001-B1.1 (F-B1-10):
 * - Protegido por defecto con SecurityKernelAuthGuard y scopes jarbees:3d:read / jarbees:3d:mutate.
 * - Confinamiento canónico de rutas de modelos/renders a storage/assets.
 */
@UseGuards(SecurityKernelAuthGuard)
@Controller('jarvis/3d/studio')
export class Studio3DController {
  private readonly logger = new Logger(Studio3DController.name);
  private readonly assetsRootDir = path.resolve(process.cwd(), 'storage', 'assets');

  constructor(
    private readonly blenderService: BlenderService,
    private readonly assetSecurityService: AssetSecurityService,
    private readonly rosterService: Game3DRosterService,
    private readonly objectLabService: ObjectLabService,
  ) {}

  /**
   * Valida y confina canónicamente cualquier ruta de archivo 3D dentro de storage/assets (F-B1-10).
   */
  validateAuthorized3DPath(
    rawFilePath: string,
    allowedExtensions: string[],
    mustExist = true,
  ): string {
    if (!rawFilePath || typeof rawFilePath !== 'string') {
      throw new ForbiddenException('SecurityKernel: ruta de asset 3D inválida o vacía.');
    }

    const trimmed = rawFilePath.trim();
    if (
      trimmed.length === 0 ||
      trimmed.includes('\0') ||
      /^(\\\\|\/\/)/.test(trimmed) ||
      /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(trimmed)
    ) {
      throw new ForbiddenException(
        'SecurityKernel: acceso 3D denegado. Se detectó traversal, ruta UNC o formato prohibido.',
      );
    }

    const ext = path.extname(trimmed).toLowerCase();
    const allowedSet = new Set(allowedExtensions.map((e) => e.toLowerCase()));
    if (!allowedSet.has(ext)) {
      throw new ForbiddenException(
        `SecurityKernel: extensión "${ext}" no autorizada para operación 3D.`,
      );
    }

    const canonicalRoot = path.resolve(this.assetsRootDir);
    const resolvedCandidate = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(canonicalRoot, trimmed);

    if (!this.isSubPath(canonicalRoot, resolvedCandidate)) {
      throw new ForbiddenException(
        'SecurityKernel: acceso 3D denegado. La ruta solicitada está fuera del directorio autorizado (storage/assets).',
      );
    }

    // F-B1-10: Inspección exhaustiva de cada segmento intermedio contra symlinks y junctions
    this.ensureNoSymlinksInPath(canonicalRoot, resolvedCandidate, mustExist);

    if (mustExist) {
      let realRoot: string;
      let realTarget: string;
      try {
        realRoot = fs.existsSync(canonicalRoot)
          ? fs.realpathSync(canonicalRoot)
          : canonicalRoot;
        realTarget = fs.realpathSync(resolvedCandidate);
      } catch {
        throw new ForbiddenException(
          'SecurityKernel: acceso 3D denegado. El archivo solicitado no existe o no es accesible dentro de storage/assets.',
        );
      }

      if (!this.isSubPath(realRoot, realTarget)) {
        throw new ForbiddenException(
          'SecurityKernel: acceso 3D denegado. La ruta canónica real escapa de storage/assets.',
        );
      }

      const lstat = fs.lstatSync(resolvedCandidate);
      if (lstat.isSymbolicLink() || !lstat.isFile()) {
        throw new ForbiddenException(
          'SecurityKernel: acceso 3D denegado. Se rechazan enlaces simbólicos, junctions o directorios.',
        );
      }
      return realTarget;
    } else {
      const parentDir = path.dirname(resolvedCandidate);
      if (fs.existsSync(parentDir)) {
        const realRoot = fs.existsSync(canonicalRoot)
          ? fs.realpathSync(canonicalRoot)
          : canonicalRoot;
        const realParent = fs.realpathSync(parentDir);
        if (
          realParent.toLowerCase() !== realRoot.toLowerCase() &&
          !this.isSubPath(realRoot, realParent)
        ) {
          throw new ForbiddenException(
            'SecurityKernel: directorio destino fuera de storage/assets.',
          );
        }
      }
      if (fs.existsSync(resolvedCandidate)) {
        const destLstat = fs.lstatSync(resolvedCandidate);
        if (destLstat.isSymbolicLink() || !destLstat.isFile()) {
          throw new ForbiddenException(
            'SecurityKernel: el destino de escritura 3D es un enlace simbólico, junction o directorio no permitido.',
          );
        }
      }
      return resolvedCandidate;
    }
  }

  private isSubPath(parentDir: string, targetPath: string): boolean {
    const normParent =
      process.platform === 'win32'
        ? path.resolve(parentDir).toLowerCase()
        : path.resolve(parentDir);
    const normTarget =
      process.platform === 'win32'
        ? path.resolve(targetPath).toLowerCase()
        : path.resolve(targetPath);
    const rel = path.relative(normParent, normTarget);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  /**
   * F-B1-10: Inspecciona cada componente intermedio entre la raíz autorizada y el destino
   * para detectar y abortar ante cualquier symlink, junction NTFS o enlace blando.
   */
  private ensureNoSymlinksInPath(canonicalRoot: string, targetPath: string, mustExist: boolean): void {
    const normRoot = path.resolve(canonicalRoot);
    const normTarget = path.resolve(targetPath);
    const rel = path.relative(normRoot, normTarget);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ForbiddenException('SecurityKernel: acceso 3D denegado fuera de storage/assets.');
    }

    const segments = rel.split(/[\\/]/);
    let current = normRoot;

    for (let i = 0; i < segments.length; i++) {
      current = path.join(current, segments[i]);
      const isTargetFile = i === segments.length - 1;

      if (!isTargetFile || mustExist) {
        if (fs.existsSync(current)) {
          const lstat = fs.lstatSync(current);
          if (lstat.isSymbolicLink()) {
            throw new ForbiddenException(
              `SecurityKernel: componente de ruta "${segments[i]}" es un enlace simbólico o junction no autorizado.`,
            );
          }
        } else if (!isTargetFile && mustExist) {
          throw new ForbiddenException(
            `SecurityKernel: directorio intermedio no existe en storage/assets: ${segments[i]}`,
          );
        }
      } else {
        if (fs.existsSync(current)) {
          const lstat = fs.lstatSync(current);
          if (lstat.isSymbolicLink()) {
            throw new ForbiddenException(
              `SecurityKernel: el archivo destino "${segments[i]}" es un enlace simbólico no autorizado.`,
            );
          }
        }
      }
    }
  }

  /**
   * F-B1-10: Lectura atómica de assets 3D con protección anti-TOCTOU.
   * Abre un descriptor de archivo exclusivo y valida fstat(fd) contra lstat(safePath)
   * antes de leer el buffer a memoria, impidiendo ataques de reemplazo concurrente de enlaces.
   */
  readConfined3DFileBuffer(safePath: string): Buffer {
    const fd = fs.openSync(safePath, 'r');
    try {
      const fstat = fs.fstatSync(fd);
      const lstat = fs.lstatSync(safePath);

      if (
        fstat.ino !== lstat.ino ||
        fstat.dev !== lstat.dev ||
        lstat.isSymbolicLink() ||
        !fstat.isFile()
      ) {
        throw new ForbiddenException(
          'SecurityKernel: anomalía TOCTOU detectada al leer el asset 3D.',
        );
      }

      const buffer = Buffer.alloc(fstat.size);
      fs.readSync(fd, buffer, 0, fstat.size, 0);
      return buffer;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * 🩺 GET /jarvis/3d/studio/health
   * Estado y disponibilidad del motor 3D de Blender y capacidades del sistema
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:3d:read' })
  @Get('health')
  getStudioHealth() {
    return {
      status: 'operational',
      blender: {
        available: this.blenderService.isAvailable(),
        executablePath: this.blenderService.getBlenderPath(),
      },
      capabilities: [
        'pbr_weathering',
        'cinematic_diorama',
        'jb3d_encryption',
        'mesh_inspection',
        'object_lab_parametric',
        'hall_of_armors_roster',
      ],
      storageDirectories: {
        models: path.resolve('storage/assets/models'),
        renders: path.resolve('storage/assets/renders'),
      },
    };
  }

  // ─── Telemetría de Personajes & Hall of Armors ─────────────────────────────

  /**
   * 🎮 GET /jarvis/3d/studio/characters
   * Obtiene la lista completa de avatares 3D con métricas reales y setup Three.js
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:3d:read' })
  @Get('characters')
  getAllCharacters() {
    return {
      success: true,
      characters: this.rosterService.getAllCharacters(),
    };
  }

  /**
   * 🎮 GET /jarvis/3d/studio/characters/:id
   * Obtiene la especificación detallada de un personaje por ID
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:3d:read' })
  @Get('characters/:id')
  getCharacterById(@Param('id') id: string) {
    const character = this.rosterService.getCharacterById(id);
    if (!character) {
      throw new HttpException(`Personaje no encontrado: ${id}`, HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      character,
    };
  }

  /**
   * 🦾 GET /jarvis/3d/studio/armors
   * Roster del Hall of Armors de Villa Auren (Taller NEXO-01)
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:3d:read' })
  @Get('armors')
  getHallOfArmors() {
    return {
      success: true,
      armors: this.rosterService.getHallOfArmors(),
    };
  }

  /**
   * 🦾 GET /jarvis/3d/studio/armors/:id
   * Especificaciones técnicas y estado de una armadura específica
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:3d:read' })
  @Get('armors/:id')
  getArmorById(@Param('id') id: string) {
    const armor = this.rosterService.getArmorById(id);
    if (!armor) {
      throw new HttpException(`Armadura no encontrada: ${id}`, HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      armor,
    };
  }

  // ─── Seguridad y Cifrado .jb3d ─────────────────────────────────────────────

  /**
   * 🛡️ POST /jarvis/3d/studio/security/validate
   * Valida la firma binaria de un archivo o buffer (GLB o JB3D)
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('security/validate')
  async validateContainer(@Body() body: { filePath?: string; base64?: string }) {
    try {
      let buffer: Buffer;
      if (body.filePath) {
        const safeAbs = this.validateAuthorized3DPath(
          body.filePath,
          ['.glb', '.gltf', '.jb3d'],
          true,
        );
        buffer = this.readConfined3DFileBuffer(safeAbs);
      } else if (body.base64) {
        buffer = Buffer.from(body.base64, 'base64');
      } else {
        throw new HttpException('Se requiere filePath o base64', HttpStatus.BAD_REQUEST);
      }

      const result = this.assetSecurityService.validateBuffer(buffer);
      return {
        success: true,
        validation: result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🔒 POST /jarvis/3d/studio/security/pack
   * Empaqueta y cifra un modelo GLB en contenedor protegido .jb3d
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('security/pack')
  async packModel(@Body() body: { sourceGlbPath: string; targetJb3dPath?: string }) {
    if (!body?.sourceGlbPath) {
      throw new HttpException('Falta parámetro obligatorio: sourceGlbPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const safeSource = this.validateAuthorized3DPath(
        body.sourceGlbPath,
        ['.glb'],
        true,
      );
      const rawTarget =
        body.targetJb3dPath ||
        safeSource.replace(/\.glb$/i, '.jb3d');
      const safeTarget = this.validateAuthorized3DPath(
        rawTarget,
        ['.jb3d'],
        false,
      );

      const result = await this.assetSecurityService.packFile(safeSource, safeTarget);
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Error empaquetando modelo: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🔓 POST /jarvis/3d/studio/security/unpack
   * Desempaqueta y descifra un contenedor .jb3d a formato GLB estándar
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('security/unpack')
  async unpackModel(@Body() body: { sourceJb3dPath: string; targetGlbPath?: string }) {
    if (!body?.sourceJb3dPath) {
      throw new HttpException('Falta parámetro obligatorio: sourceJb3dPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const safeSource = this.validateAuthorized3DPath(
        body.sourceJb3dPath,
        ['.jb3d'],
        true,
      );
      const rawTarget =
        body.targetGlbPath ||
        safeSource.replace(/\.jb3d$/i, '_unpacked.glb');
      const safeTarget = this.validateAuthorized3DPath(
        rawTarget,
        ['.glb'],
        false,
      );

      const result = await this.assetSecurityService.unpackFile(safeSource, safeTarget);
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Error desempaquetando modelo: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Object Lab Paramétrico ───────────────────────────────────────────────

  /**
   * 📐 POST /jarvis/3d/studio/object-lab/validate
   * Valida un esquema paramétrico de Object Lab
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('object-lab/validate')
  validateObjectSpec(@Body() spec: any) {
    const result = this.objectLabService.validateSpec(spec);
    return {
      success: result.valid,
      validation: result,
    };
  }

  /**
   * 📐 GET /jarvis/3d/studio/object-lab/templates/table
   * Obtiene la plantilla paramétrica de mesa de trabajo NEXO
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:3d:read' })
  @Get('object-lab/templates/table')
  getTableTemplate() {
    const template = this.objectLabService.createWorkshopTableTemplate();
    return {
      success: true,
      template,
    };
  }

  /**
   * 🔨 POST /jarvis/3d/studio/object-lab/build
   * Construye un objeto paramétrico en Blender y exporta GLB / .blend
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('object-lab/build')
  async buildParametricObject(@Body() body: { spec?: any; specPath?: string; outGlb?: string; outBlend?: string }) {
    try {
      let specPath = body?.specPath
        ? this.validateAuthorized3DPath(body.specPath, ['.json'], true)
        : undefined;
      if (!specPath && body?.spec) {
        specPath = await this.objectLabService.saveSpecToDisk(body.spec);
      }

      if (!specPath) {
        throw new HttpException('Se requiere spec o specPath', HttpStatus.BAD_REQUEST);
      }

      const safeOutGlb = body?.outGlb
        ? this.validateAuthorized3DPath(body.outGlb, ['.glb'], false)
        : undefined;
      const safeOutBlend = body?.outBlend
        ? this.validateAuthorized3DPath(body.outBlend, ['.blend'], false)
        : undefined;

      const result = await this.blenderService.generateParametricObject({
        specPath,
        outGlb: safeOutGlb,
        outBlend: safeOutBlend,
      });

      return {
        success: true,
        result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Error construyendo objeto paramétrico: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Blender Headless Services (Diorama, Desgaste, Inspección) ─────────────

  /**
   * 🔍 POST /jarvis/3d/studio/inspect
   * Inspecciona propiedades geométricas, materiales y vértices de un modelo
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('inspect')
  async inspectModel(@Body() body: { modelPath: string }) {
    if (!body?.modelPath) {
      throw new HttpException('Falta parámetro modelPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const safeModelPath = this.validateAuthorized3DPath(
        body.modelPath,
        ['.glb', '.gltf', '.blend', '.obj', '.fbx'],
        true,
      );
      const result = await this.blenderService.inspectModel(safeModelPath);
      return {
        success: true,
        inspection: result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Error inspeccionando modelo: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🌿 POST /jarvis/3d/studio/weathering
   * Aplica desgaste PBR procedural con musgo, suciedad y mapa de normales
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('weathering')
  async applyWeathering(@Body() options: any) {
    if (!options?.inputGlbPath) {
      throw new HttpException('Falta parámetro inputGlbPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const safeInput = this.validateAuthorized3DPath(
        options.inputGlbPath,
        ['.glb', '.gltf'],
        true,
      );
      const safeOutputGlb = options.outputGlbPath
        ? this.validateAuthorized3DPath(options.outputGlbPath, ['.glb'], false)
        : undefined;
      const safeOutputPng = options.outputPreviewPng
        ? this.validateAuthorized3DPath(options.outputPreviewPng, ['.png'], false)
        : undefined;

      const result = await this.blenderService.applyWeathering({
        ...options,
        inputGlbPath: safeInput,
        outputGlbPath: safeOutputGlb,
        outputPreviewPng: safeOutputPng,
      });
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Error aplicando desgaste: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🎬 POST /jarvis/3d/studio/render/diorama
   * Renderiza una escena cinematográfica 3D completa (DoF, pedestal, mood)
   */
  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:3d:mutate' })
  @Post('render/diorama')
  async renderDiorama(@Body() options: any) {
    try {
      const safeOptions = { ...(options || {}) };
      if (safeOptions.modelPath) {
        safeOptions.modelPath = this.validateAuthorized3DPath(
          safeOptions.modelPath,
          ['.glb', '.gltf', '.blend', '.obj', '.fbx'],
          true,
        );
      }
      if (safeOptions.outputPng) {
        safeOptions.outputPng = this.validateAuthorized3DPath(
          safeOptions.outputPng,
          ['.png'],
          false,
        );
      }
      const result = await this.blenderService.renderCinematicDiorama(safeOptions);
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Error renderizando diorama: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
