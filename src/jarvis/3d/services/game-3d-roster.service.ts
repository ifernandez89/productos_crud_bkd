import { Injectable, Logger } from '@nestjs/common';

/**
 * 🎮 Game 3D Roster Service
 *
 * Módulo de catálogo, telemetría y especificaciones de personajes 3D y armaduras PBR
 * para JarBees Studio y el ecosistema Jarbees_the_game.
 */

export interface RealWorldMetrics {
  heightOrLength: string;
  wingspanOrWidth: string;
  weight: string;
  scaleRatio: string;
  propulsion: string;
  maxSpeedKmh: string;
  flightAcrobatics: string;
}

export interface ThreeJsRenderConfig {
  scale: number;
  rotation: [number, number, number];
  positionOffset: [number, number, number];
  pitchMultiplier: number;
  rollMultiplier: number;
  hoverBobbingAmplitude: number;
  hasThrusterFX: boolean;
}

export interface CharacterCameraConfig {
  offset: [number, number, number];
  lookOffset: [number, number, number];
}

export interface CharacterAudioConfig {
  soundKey: string;
  baseVolume: number;
  maxVolume: number;
  basePitch: number;
  pitchRange: number;
}

export interface CharacterProfileSpec {
  id: string;
  name: string;
  title: string;
  category: 'Fauna Silvestre' | 'Vengador Acorazado' | 'Exoesqueleto Enjambre' | 'Exoesqueleto NEXO';
  icon: string;
  badge: string;
  badgeColor: string;
  modelPath: string;
  fallbackKind: string;
  realMetrics: RealWorldMetrics;
  renderConfig: ThreeJsRenderConfig;
  camera: CharacterCameraConfig;
  audio: CharacterAudioConfig;
  description: string;
  highlights: string[];
}

export interface ArmorPodSpec {
  id: string;
  name: string;
  designation: string;
  modelFile: string;
  position: [number, number, number];
  colorAccent: string;
  reactorType: string;
  specialization: string;
  machRating: string;
  status: string;
}

@Injectable()
export class Game3DRosterService {
  private readonly logger = new Logger(Game3DRosterService.name);

  private readonly characters: Record<string, CharacterProfileSpec> = {
    bee: {
      id: 'bee',
      name: 'Abeja Guardiana',
      title: 'JarBee Clásica',
      category: 'Fauna Silvestre',
      icon: '🐝',
      badge: 'Polinizador Ágil',
      badgeColor: '#f59e0b',
      modelPath: '/models/bee.jb3d',
      fallbackKind: 'bee',
      realMetrics: {
        heightOrLength: '18 cm (Estilizada) / 1.8 cm real',
        wingspanOrWidth: '22 cm (Envergadura)',
        weight: '0.14 gramos',
        scaleRatio: '1:10 (Micro-Mundo)',
        propulsion: 'Alas membranosas (230 Hz asíncrono)',
        maxSpeedKmh: '32 km/h',
        flightAcrobatics: 'Vuelo estacionario y giro 360° instantáneo',
      },
      renderConfig: {
        scale: 0.85,
        rotation: [0, Math.PI, 0],
        positionOffset: [0, 0, 0],
        pitchMultiplier: 0.35,
        rollMultiplier: 0.55,
        hoverBobbingAmplitude: 0.12,
        hasThrusterFX: false,
      },
      camera: {
        offset: [0, 1.2, 3.8],
        lookOffset: [0, 0.4, 0],
      },
      audio: {
        soundKey: 'bee_buzz',
        baseVolume: 0.28,
        maxVolume: 0.65,
        basePitch: 1.0,
        pitchRange: 0.4,
      },
      description: 'El avatar emblema de JarBees. Capaz de maniobrar a través de cañones polares y oquedades con máxima precisión cinética.',
      highlights: ['Agilidad en espacios cerrados', 'Zumbido bioacústico espacial', 'Inercia mínima'],
    },
    colibri: {
      id: 'colibri',
      name: 'Colibrí Esmeralda',
      title: 'Heliomaster PBR',
      category: 'Fauna Silvestre',
      icon: '🐦',
      badge: 'Velocista Iridiscente',
      badgeColor: '#10b981',
      modelPath: '/models/colibri_pbr.jb3d',
      fallbackKind: 'colibri',
      realMetrics: {
        heightOrLength: '12 cm',
        wingspanOrWidth: '15 cm',
        weight: '0.04 gramos',
        scaleRatio: '1:1 (Realista)',
        propulsion: 'Alas hiper-frecuencia (80 Hz cinemática en ocho)',
        maxSpeedKmh: '78 km/h',
        flightAcrobatics: 'Aceleración lateral súbita y reversa limpia',
      },
      renderConfig: {
        scale: 0.65,
        rotation: [0, Math.PI, 0],
        positionOffset: [0, 0, 0],
        pitchMultiplier: 0.45,
        rollMultiplier: 0.6,
        hoverBobbingAmplitude: 0.08,
        hasThrusterFX: false,
      },
      camera: {
        offset: [0, 1.0, 3.2],
        lookOffset: [0, 0.3, 0],
      },
      audio: {
        soundKey: 'colibri_flutter',
        baseVolume: 0.22,
        maxVolume: 0.55,
        basePitch: 1.2,
        pitchRange: 0.5,
      },
      description: 'Modelo PBR fotorrealista con sombreado de plumas de interferencia iridiscente y vuelo de altísima frecuencia.',
      highlights: ['Shaders de refracción óptica', 'Velocidad de ráfaga superior', 'Excelente para cinemáticas diurnas'],
    },
    iron_man: {
      id: 'iron_man',
      name: 'Iron Man Mark 85',
      title: 'Nanotech Armor MK-LXXXV',
      category: 'Vengador Acorazado',
      icon: '🦾',
      badge: 'Titanio & Oro',
      badgeColor: '#ef4444',
      modelPath: '/models/iron_man.jb3d',
      fallbackKind: 'iron_man',
      realMetrics: {
        heightOrLength: '1.92 m',
        wingspanOrWidth: '0.88 m',
        weight: '98 kg (Nanopartículas compactadas)',
        scaleRatio: '1:1 (Escala Humana)',
        propulsion: 'Repulsores de Plasma Arc en pies y palmas',
        maxSpeedKmh: 'Mach 3.2 (3,900 km/h)',
        flightAcrobatics: 'Vuelo supersónico, frenado por inversión de flujo y giro asistido por IA',
      },
      renderConfig: {
        scale: 1.0,
        rotation: [0, Math.PI, 0],
        positionOffset: [0, -0.95, 0],
        pitchMultiplier: 0.25,
        rollMultiplier: 0.4,
        hoverBobbingAmplitude: 0.04,
        hasThrusterFX: true,
      },
      camera: {
        offset: [0, 1.8, 4.5],
        lookOffset: [0, 0.9, 0],
      },
      audio: {
        soundKey: 'iron_man_thruster',
        baseVolume: 0.35,
        maxVolume: 0.85,
        basePitch: 0.9,
        pitchRange: 0.6,
      },
      description: 'Modelo acorazado con cinemática de esqueleto completo Mixamo y texturas PBR nanotecnológicas metálicas.',
      highlights: ['Efectos FX de propulsión repulsora', 'Shader metálico anisotrópico', 'Rigging óseo para acrobacias'],
    },
    iron_man_cobalt_protocol: {
      id: 'iron_man_cobalt_protocol',
      name: 'Iron Man: Cobalt Protocol',
      title: 'Edición Táctica NEXO-01',
      category: 'Exoesqueleto NEXO',
      icon: '⚡',
      badge: 'Cobalto & Cian Eléctrico',
      badgeColor: '#0ea5e9',
      modelPath: '/models/iron_man_cobalt_protocol.jb3d',
      fallbackKind: 'iron_man',
      realMetrics: {
        heightOrLength: '1.90 m',
        wingspanOrWidth: '0.90 m',
        weight: '105 kg',
        scaleRatio: '1:1 (Escala Real de Juego)',
        propulsion: 'Repulsores iónicos duales con kicker ámbar',
        maxSpeedKmh: 'Mach 3.8',
        flightAcrobatics: 'Maniobras vectoriales de alta sustentación polar',
      },
      renderConfig: {
        scale: 1.0,
        rotation: [0, Math.PI, 0],
        positionOffset: [0, -0.95, 0],
        pitchMultiplier: 0.28,
        rollMultiplier: 0.42,
        hoverBobbingAmplitude: 0.05,
        hasThrusterFX: true,
      },
      camera: {
        offset: [0, 1.85, 4.6],
        lookOffset: [0, 0.92, 0],
      },
      audio: {
        soundKey: 'iron_man_thruster',
        baseVolume: 0.4,
        maxVolume: 0.9,
        basePitch: 1.05,
        pitchRange: 0.6,
      },
      description: 'Variante creada en Blender con paleta fría (#124E96 Cobalt, #72BFFF Cyan, #D9E1E8 Silver) y emisor de plasma azul de alta pureza.',
      highlights: ['Paleta Cobalt exclusiva', 'Optimizado para iluminación polar y nocturna', 'DoF cinematográfico'],
    },
  };

  private readonly hallOfArmors: ArmorPodSpec[] = [
    {
      id: 'armor_mark7',
      name: 'Mark VII',
      designation: 'MARK VII · COMBAT HEAVY',
      modelFile: '/models/armor_mark7.glb',
      position: [13.4, 0.0, -2.2],
      colorAccent: '#EF4444',
      reactorType: 'Arc Reactor Cuántico v3',
      specialization: 'Defensa Pesada & Micro-misiles',
      machRating: 'Mach 2.2',
      status: 'EN RESERVA',
    },
    {
      id: 'armor_heartbreaker',
      name: 'Heartbreaker',
      designation: 'MARK XVII · HEARTBREAKER',
      modelFile: '/models/armor_heartbreaker.glb',
      position: [13.4, 0.0, 0.4],
      colorAccent: '#F59E0B',
      reactorType: 'Chest RT Sobredimensionado',
      specialization: 'Escudos Repulsores & Artillería',
      machRating: 'Mach 2.8',
      status: 'CARGA 100%',
    },
    {
      id: 'armor_silver_centurion',
      name: 'Silver Centurion',
      designation: 'MARK XXXIII · SILVER CENTURION',
      modelFile: '/models/armor_silver_centurion.glb',
      position: [13.4, 0.0, 3.0],
      colorAccent: '#E2E8F0',
      reactorType: 'Sub-Vibranio Bifásico',
      specialization: 'Cuchillas de Energía & Pulso IEM',
      machRating: 'Mach 3.1',
      status: 'OPTIMIZADO',
    },
    {
      id: 'armor_mark42',
      name: 'Mark 42',
      designation: 'MARK XLII · AUTONOMOUS PREHENSILE',
      modelFile: '/models/armor_mark42.glb',
      position: [13.4, 0.0, 5.6],
      colorAccent: '#FCD34D',
      reactorType: 'Matriz Neuronal Autónoma',
      specialization: 'Ensamblaje Remoto & Vuelo Autónomo',
      machRating: 'Mach 2.6',
      status: 'ACTIVO',
    },
    {
      id: 'armor_war_machine',
      name: 'War Machine Mk II',
      designation: 'WAR MACHINE · VARIABLE THREAT',
      modelFile: '/models/armor_war_machine.glb',
      position: [13.4, 0.0, 8.2],
      colorAccent: '#6B7280',
      reactorType: 'Arc Militar Reforzado',
      specialization: 'Cañón Gatling & Artillería Balística',
      machRating: 'Mach 2.4',
      status: 'STANDBY',
    },
  ];

  getAllCharacters(): CharacterProfileSpec[] {
    return Object.values(this.characters);
  }

  getCharacterById(id: string): CharacterProfileSpec | null {
    return this.characters[id] || null;
  }

  getCharactersByCategory(category: string): CharacterProfileSpec[] {
    return Object.values(this.characters).filter((c) => c.category === category);
  }

  getHallOfArmors(): ArmorPodSpec[] {
    return [...this.hallOfArmors];
  }

  getArmorById(id: string): ArmorPodSpec | null {
    return this.hallOfArmors.find((a) => a.id === id) || null;
  }
}
