import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 🛠️ JarBees Object Lab Service
 *
 * Motor de validación, diseño paramétrico y generación de objetos geométricos 3D
 * con piezas cinemáticas, anclajes semánticos de interacción y cálculo de despiece (exploded view).
 */

export type ObjectCategory = 'furniture' | 'appliance' | 'fixture' | 'prop' | 'structural';
export type Axis3D = 'x' | 'y' | 'z';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface ObjectPartDefinition {
  id: string;
  name: string;
  role: 'structure' | 'surface' | 'kinetic' | 'trim' | 'hardware' | 'fastener';
  primitive: 'box' | 'cylinder' | 'extrusion' | 'composite';
  dimensions: Vector3D;
  localOffset: Vector3D;
  rotation?: Vector3D;
  explosionVector: Vector3D; // Vector unitario de separación en modo despiece
  materialSlot: string;
  bevelRadius?: number;
  parentPartId?: string;
  kinematic?: {
    type: 'hinge' | 'slide' | 'fixed';
    axis: Axis3D;
    pivot: Vector3D;
    limits: [number, number];
    current?: number;
  };
}

export interface InteractionAnchor {
  id: string;
  type: 'chair_slot' | 'item_placement' | 'grab_handle' | 'door_pull' | 'work_station';
  name: string;
  localPos: [number, number, number];
  normal: [number, number, number];
  clearanceRadius: number; // Margen en metros requerido para el avatar
}

export interface ColliderDefinition {
  id: string;
  type: 'box' | 'convex_hull';
  center: [number, number, number];
  halfExtents: [number, number, number];
  walkable?: boolean;
  navigableUnderneath?: boolean;
}

export interface ParametricObjectSpec<TParams = Record<string, any>> {
  $schema?: string;
  objectId: string;
  name: string;
  category: ObjectCategory;
  version: string;
  author?: string;
  parameters: TParams;
  dimensions: {
    widthX: number;
    depthY: number;
    heightZ: number;
  };
  parts: ObjectPartDefinition[];
  anchors?: InteractionAnchor[];
  colliders?: ColliderDefinition[];
}

export interface SpecValidationResult {
  valid: boolean;
  objectId: string;
  errors: string[];
  warnings: string[];
  partCount: number;
  anchorCount: number;
  colliderCount: number;
}

@Injectable()
export class ObjectLabService {
  private readonly logger = new Logger(ObjectLabService.name);

  /**
   * Valida exhaustivamente una especificación paramétrica de Object Lab
   */
  validateSpec(spec: any): SpecValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!spec || typeof spec !== 'object') {
      return {
        valid: false,
        objectId: 'unknown',
        errors: ['La especificación debe ser un objeto JSON válido'],
        warnings: [],
        partCount: 0,
        anchorCount: 0,
        colliderCount: 0,
      };
    }

    const objectId = spec.objectId || 'unnamed_object';

    if (!spec.objectId) errors.push('Falta campo obligatorio: objectId');
    if (!spec.name) errors.push('Falta campo obligatorio: name');
    if (!spec.category) errors.push('Falta campo obligatorio: category');
    if (!spec.dimensions) {
      errors.push('Falta campo obligatorio: dimensions');
    } else {
      const { widthX, depthY, heightZ } = spec.dimensions;
      if (widthX <= 0 || depthY <= 0 || heightZ <= 0) {
        errors.push('Las dimensiones métricas (widthX, depthY, heightZ) deben ser mayores a 0');
      }
    }

    const parts = Array.isArray(spec.parts) ? spec.parts : [];
    if (parts.length === 0) {
      errors.push('El objeto debe contener al menos una pieza (parts) en su ensamblaje');
    }

    const partIds = new Set<string>();
    parts.forEach((part: ObjectPartDefinition, index: number) => {
      if (!part.id) {
        errors.push(`Parte [${index}] no tiene 'id' asignado`);
      } else {
        if (partIds.has(part.id)) {
          errors.push(`Identificador de parte duplicado: '${part.id}'`);
        }
        partIds.add(part.id);
      }

      if (!part.dimensions || part.dimensions.x <= 0 || part.dimensions.y <= 0 || part.dimensions.z <= 0) {
        errors.push(`Parte '${part.id || index}' tiene dimensiones nulas o negativas`);
      }

      if (!part.explosionVector) {
        warnings.push(`Parte '${part.id || index}' no tiene 'explosionVector'; el modo despiece usará vector neutro`);
      }

      if (part.parentPartId && !partIds.has(part.parentPartId)) {
        // Puede declararse luego o no existir
      }
    });

    const anchors = Array.isArray(spec.anchors) ? spec.anchors : [];
    anchors.forEach((anchor: InteractionAnchor, index: number) => {
      if (!anchor.id || !anchor.type || !anchor.localPos) {
        errors.push(`Anclaje [${index}] incompleto: requiere 'id', 'type' y 'localPos'`);
      }
    });

    const colliders = Array.isArray(spec.colliders) ? spec.colliders : [];

    return {
      valid: errors.length === 0,
      objectId,
      errors,
      warnings,
      partCount: parts.length,
      anchorCount: anchors.length,
      colliderCount: colliders.length,
    };
  }

  /**
   * Genera una plantilla paramétrica de mesa de taller NEXO
   */
  createWorkshopTableTemplate(options: {
    objectId?: string;
    width?: number;
    depth?: number;
    height?: number;
  } = {}): ParametricObjectSpec {
    const w = options.width ?? 1.8;
    const d = options.depth ?? 0.9;
    const h = options.height ?? 0.85;
    const legThickness = 0.08;
    const topThickness = 0.05;

    return {
      objectId: options.objectId ?? 'table_nexo_workshop_01',
      name: 'Mesa de Trabajo NEXO-01',
      category: 'furniture',
      version: '1.0.0',
      dimensions: {
        widthX: w,
        depthY: d,
        heightZ: h,
      },
      parameters: {
        legThickness,
        topThickness,
        apronHeight: 0.1,
      },
      parts: [
        {
          id: 'tabletop',
          name: 'Tablero Superior Roble & Acero',
          role: 'surface',
          primitive: 'box',
          dimensions: { x: w, y: d, z: topThickness },
          localOffset: { x: 0, y: 0, z: h - topThickness / 2 },
          explosionVector: { x: 0, y: 0, z: 1.0 },
          materialSlot: 'OakVarnish_Dark',
          bevelRadius: 0.005,
        },
        {
          id: 'leg_front_left',
          name: 'Pata Frontal Izquierda Reforzada',
          role: 'structure',
          primitive: 'box',
          dimensions: { x: legThickness, y: legThickness, z: h - topThickness },
          localOffset: {
            x: -w / 2 + legThickness,
            y: -d / 2 + legThickness,
            z: (h - topThickness) / 2,
          },
          explosionVector: { x: -0.7, y: -0.7, z: -0.2 },
          materialSlot: 'CastIron_Black',
        },
        {
          id: 'leg_front_right',
          name: 'Pata Frontal Derecha Reforzada',
          role: 'structure',
          primitive: 'box',
          dimensions: { x: legThickness, y: legThickness, z: h - topThickness },
          localOffset: {
            x: w / 2 - legThickness,
            y: -d / 2 + legThickness,
            z: (h - topThickness) / 2,
          },
          explosionVector: { x: 0.7, y: -0.7, z: -0.2 },
          materialSlot: 'CastIron_Black',
        },
        {
          id: 'leg_rear_left',
          name: 'Pata Trasera Izquierda Reforzada',
          role: 'structure',
          primitive: 'box',
          dimensions: { x: legThickness, y: legThickness, z: h - topThickness },
          localOffset: {
            x: -w / 2 + legThickness,
            y: d / 2 - legThickness,
            z: (h - topThickness) / 2,
          },
          explosionVector: { x: -0.7, y: 0.7, z: -0.2 },
          materialSlot: 'CastIron_Black',
        },
        {
          id: 'leg_rear_right',
          name: 'Pata Trasera Derecha Reforzada',
          role: 'structure',
          primitive: 'box',
          dimensions: { x: legThickness, y: legThickness, z: h - topThickness },
          localOffset: {
            x: w / 2 - legThickness,
            y: d / 2 - legThickness,
            z: (h - topThickness) / 2,
          },
          explosionVector: { x: 0.7, y: 0.7, z: -0.2 },
          materialSlot: 'CastIron_Black',
        },
      ],
      anchors: [
        {
          id: 'seat_front',
          type: 'chair_slot',
          name: 'Puesto Principal de Ensamblaje',
          localPos: [0, -d / 2 - 0.45, 0],
          normal: [0, 1, 0],
          clearanceRadius: 0.75,
        },
        {
          id: 'surface_tools',
          type: 'item_placement',
          name: 'Bandeja de Herramientas y Telemetría',
          localPos: [0, 0, h],
          normal: [0, 0, 1],
          clearanceRadius: 0.35,
        },
      ],
      colliders: [
        {
          id: 'col_top',
          type: 'box',
          center: [0, 0, h - topThickness / 2],
          halfExtents: [w / 2, d / 2, topThickness / 2],
          walkable: true,
          navigableUnderneath: true,
        },
      ],
    };
  }

  /**
   * Guarda una especificación en disco para ser consumida por Blender
   */
  async saveSpecToDisk(spec: ParametricObjectSpec, targetPath?: string): Promise<string> {
    const validation = this.validateSpec(spec);
    if (!validation.valid) {
      throw new Error(`Especificación inválida: ${validation.errors.join('; ')}`);
    }

    const defaultPath = path.resolve('storage/assets/models', `${spec.objectId}.object.json`);
    const outPath = targetPath ? path.resolve(targetPath) : defaultPath;

    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await fs.promises.writeFile(outPath, JSON.stringify(spec, null, 2), 'utf-8');

    return outPath;
  }
}
