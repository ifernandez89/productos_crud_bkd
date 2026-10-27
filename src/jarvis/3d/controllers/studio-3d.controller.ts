import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BlenderService } from '../blender.service';
import { AssetSecurityService } from '../services/asset-security.service';
import { Game3DRosterService } from '../services/game-3d-roster.service';
import { ObjectLabService } from '../services/object-lab.service';
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
 */
@Controller('jarvis/3d/studio')
export class Studio3DController {
  private readonly logger = new Logger(Studio3DController.name);

  constructor(
    private readonly blenderService: BlenderService,
    private readonly assetSecurityService: AssetSecurityService,
    private readonly rosterService: Game3DRosterService,
    private readonly objectLabService: ObjectLabService,
  ) {}

  /**
   * 🩺 GET /jarvis/3d/studio/health
   * Estado y disponibilidad del motor 3D de Blender y capacidades del sistema
   */
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
  @Post('security/validate')
  async validateContainer(@Body() body: { filePath?: string; base64?: string }) {
    try {
      let buffer: Buffer;
      if (body.filePath) {
        const abs = path.resolve(body.filePath);
        if (!fs.existsSync(abs)) {
          throw new HttpException(`Archivo no encontrado: ${abs}`, HttpStatus.NOT_FOUND);
        }
        buffer = await fs.promises.readFile(abs);
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
  @Post('security/pack')
  async packModel(@Body() body: { sourceGlbPath: string; targetJb3dPath?: string }) {
    if (!body.sourceGlbPath) {
      throw new HttpException('Falta parámetro obligatorio: sourceGlbPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const targetPath =
        body.targetJb3dPath ||
        body.sourceGlbPath.replace(/\.glb$/i, '.jb3d');

      const result = await this.assetSecurityService.packFile(body.sourceGlbPath, targetPath);
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      this.logger.error(`Error empaquetando modelo: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🔓 POST /jarvis/3d/studio/security/unpack
   * Desempaqueta y descifra un contenedor .jb3d a formato GLB estándar
   */
  @Post('security/unpack')
  async unpackModel(@Body() body: { sourceJb3dPath: string; targetGlbPath?: string }) {
    if (!body.sourceJb3dPath) {
      throw new HttpException('Falta parámetro obligatorio: sourceJb3dPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const targetPath =
        body.targetGlbPath ||
        body.sourceJb3dPath.replace(/\.jb3d$/i, '_unpacked.glb');

      const result = await this.assetSecurityService.unpackFile(body.sourceJb3dPath, targetPath);
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      this.logger.error(`Error desempaquetando modelo: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Object Lab Paramétrico ───────────────────────────────────────────────

  /**
   * 📐 POST /jarvis/3d/studio/object-lab/validate
   * Valida un esquema paramétrico de Object Lab
   */
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
  @Post('object-lab/build')
  async buildParametricObject(@Body() body: { spec?: any; specPath?: string; outGlb?: string; outBlend?: string }) {
    try {
      let specPath = body.specPath;
      if (!specPath && body.spec) {
        specPath = await this.objectLabService.saveSpecToDisk(body.spec);
      }

      if (!specPath) {
        throw new HttpException('Se requiere spec o specPath', HttpStatus.BAD_REQUEST);
      }

      const result = await this.blenderService.generateParametricObject({
        specPath,
        outGlb: body.outGlb,
        outBlend: body.outBlend,
      });

      return {
        success: true,
        result,
      };
    } catch (err: any) {
      this.logger.error(`Error construyendo objeto paramétrico: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Blender Headless Services (Diorama, Desgaste, Inspección) ─────────────

  /**
   * 🔍 POST /jarvis/3d/studio/inspect
   * Inspecciona propiedades geométricas, materiales y vértices de un modelo
   */
  @Post('inspect')
  async inspectModel(@Body() body: { modelPath: string }) {
    if (!body.modelPath) {
      throw new HttpException('Falta parámetro modelPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.blenderService.inspectModel(body.modelPath);
      return {
        success: true,
        inspection: result,
      };
    } catch (err: any) {
      this.logger.error(`Error inspeccionando modelo: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🌿 POST /jarvis/3d/studio/weathering
   * Aplica desgaste PBR procedural con musgo, suciedad y mapa de normales
   */
  @Post('weathering')
  async applyWeathering(@Body() options: any) {
    if (!options.inputGlbPath) {
      throw new HttpException('Falta parámetro inputGlbPath', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.blenderService.applyWeathering(options);
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      this.logger.error(`Error aplicando desgaste: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 🎬 POST /jarvis/3d/studio/render/diorama
   * Renderiza una escena cinematográfica 3D completa (DoF, pedestal, mood)
   */
  @Post('render/diorama')
  async renderDiorama(@Body() options: any) {
    try {
      const result = await this.blenderService.renderCinematicDiorama(options || {});
      return {
        success: true,
        result,
      };
    } catch (err: any) {
      this.logger.error(`Error renderizando diorama: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
