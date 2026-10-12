import { PaletteSpec } from '../poster.types';

export class SceneBuilder {
  /**
   * Generador de números pseudo-aleatorios determinista (Mulberry32)
   */
  static createRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Genera el campo estelar procedural con estrellas de diferentes magnitudes
   */
  static generateStarfield(width: number, height: number, count: number, rng: () => number): string {
    const stars: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(rng() * width);
      const y = Math.round(rng() * (height * 0.75)); // concentradas en la parte superior
      const r = (rng() * 1.6 + 0.4).toFixed(1);
      const opacity = (rng() * 0.7 + 0.3).toFixed(2);
      const isSparkle = rng() > 0.92;
      
      if (isSparkle) {
        stars.push(
          `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" opacity="${opacity}" filter="url(#glow-soft)" />` +
          `<path d="M ${x - 3} ${y} L ${x + 3} ${y} M ${x} ${y - 3} L ${x} ${y + 3}" stroke="#A0E8FF" stroke-width="0.8" opacity="${opacity}" />`
        );
      } else {
        stars.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#E8F4FF" opacity="${opacity}" />`);
      }
    }
    return stars.join('\n    ');
  }

  /**
   * Genera una retícula en perspectiva retro de 16 bits (Perspective Grid)
   */
  static generatePerspectiveGrid(width: number, height: number, gridColor: string): string {
    const horizonY = Math.round(height * 0.62);
    const bottomY = height;
    const lines: string[] = [];

    // Líneas horizontales con compresión de perspectiva
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = Math.pow(i / steps, 2.2);
      const y = Math.round(horizonY + t * (bottomY - horizonY));
      const opacity = (0.15 + t * 0.6).toFixed(2);
      lines.push(
        `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${gridColor}" stroke-width="${1 + t * 1.5}" opacity="${opacity}" />`
      );
    }

    // Líneas longitudinales convergentes hacia el centro del horizonte
    const vX = width / 2;
    const vY = horizonY;
    const rays = 18;
    for (let i = -rays / 2; i <= rays / 2; i++) {
      const startX = vX + (i / (rays / 2)) * (width * 0.7);
      lines.push(
        `<line x1="${vX}" y1="${vY}" x2="${startX}" y2="${bottomY}" stroke="${gridColor}" stroke-width="1.2" opacity="0.35" />`
      );
    }

    return `
    <!-- Perspective Grid (Genesis Horizon) -->
    <g id="perspective-grid">
      <line x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}" stroke="#00E5FF" stroke-width="2" opacity="0.8" filter="url(#glow-sharp)" />
      ${lines.join('\n      ')}
    </g>`;
  }

  /**
   * Genera el sujeto central estilizado (Armadura Heroica con Reactor de Arco y Rim Lighting)
   */
  static generateArmoredHero(
    cx: number,
    cy: number,
    scale: number,
    palette: PaletteSpec,
    rng: () => number,
  ): string {
    // Definición vectorial de la armadura (pecho, casco, hombreras, reactor y casco)
    return `
    <!-- Central Subject: Armored Hero / Genesis Protocol Hero -->
    <g id="armored-hero" transform="translate(${cx}, ${cy}) scale(${scale})">
      <!-- Glow del núcleo dorsal / Aura de energía -->
      <circle cx="0" cy="-60" r="140" fill="${palette.accent}" opacity="0.18" filter="url(#glow-huge)" />
      <circle cx="0" cy="-40" r="80" fill="${palette.secondary}" opacity="0.22" filter="url(#glow-soft)" />

      <!-- Silueta base sombreada (Doble capa para volumen) -->
      <!-- Capa 1: Capa Dorsal y Sombra exterior -->
      <path d="M -110 40 L -90 -40 L -60 -110 L 0 -130 L 60 -110 L 90 -40 L 110 40 L 70 120 L -70 120 Z"
            fill="#120505" stroke="#000000" stroke-width="4" />

      <!-- Hombrera Izquierda (Pauldrons) con gradiente metálico rojo y borde dorado -->
      <path d="M -60 -60 L -125 -35 L -135 15 L -95 30 L -55 -15 Z"
            fill="url(#armor-red-grad)" stroke="${palette.secondary}" stroke-width="3" filter="url(#drop-shadow)" />
      <path d="M -125 -35 L -60 -60 L -65 -45 L -115 -20 Z"
            fill="url(#armor-gold-grad)" opacity="0.9" />

      <!-- Hombrera Derecha con Rim Light cian en el contorno -->
      <path d="M 60 -60 L 125 -35 L 135 15 L 95 30 L 55 -15 Z"
            fill="url(#armor-red-grad)" stroke="${palette.secondary}" stroke-width="3" filter="url(#drop-shadow)" />
      <path d="M 125 -35 L 60 -60 L 65 -45 L 115 -20 Z"
            fill="url(#armor-gold-grad)" opacity="0.9" />
      <!-- Rim light en hombro derecho -->
      <path d="M 125 -35 L 135 15 L 120 28"
            stroke="#00FFFF" stroke-width="2.5" fill="none" opacity="0.8" filter="url(#glow-sharp)" />

      <!-- Placas Pectorales (Pectoral Chassis) -->
      <path d="M -65 -35 L -10 -45 L -5 30 L -55 35 Z"
            fill="url(#armor-red-dark)" stroke="${palette.secondary}" stroke-width="2.5" />
      <path d="M 65 -35 L 10 -45 L 5 30 L 55 35 Z"
            fill="url(#armor-red-dark)" stroke="${palette.secondary}" stroke-width="2.5" />

      <!-- Placas abdominales / Cintura tecnológica -->
      <path d="M -45 42 L 45 42 L 35 75 L -35 75 Z"
            fill="url(#armor-gold-grad)" stroke="#111" stroke-width="2" />
      <path d="M -30 80 L 30 80 L 25 110 L -25 110 Z"
            fill="url(#armor-red-dark)" stroke="${palette.secondary}" stroke-width="2" />

      <!-- Casco / Yelmo (Angular Mecha Helmet) -->
      <g id="helmet" transform="translate(0, -95)">
        <!-- Cráneo superior rojo metálico -->
        <path d="M -42 -20 L -30 -60 L 0 -72 L 30 -60 L 42 -20 L 35 15 L 0 25 L -35 15 Z"
              fill="url(#armor-red-grad)" stroke="#220000" stroke-width="3" filter="url(#drop-shadow)" />
        <!-- Cresta y alerones dorados -->
        <path d="M -10 -72 L 0 -85 L 10 -72 L 6 -35 L -6 -35 Z"
              fill="url(#armor-gold-grad)" stroke="#4A3400" stroke-width="1.5" />
        <!-- Placas de mandíbula y pómulos -->
        <path d="M -38 -15 L -20 -15 L -25 12 L -35 10 Z" fill="url(#armor-gold-grad)" />
        <path d="M 38 -15 L 20 -15 L 25 12 L 35 10 Z" fill="url(#armor-gold-grad)" />

        <!-- Máscara facial dorada central -->
        <path d="M -22 -30 L 0 -38 L 22 -30 L 18 10 L 0 22 L -18 10 Z"
              fill="url(#armor-gold-grad)" stroke="#3D2900" stroke-width="2" />

        <!-- Visor / Ojos de Energía Cian con Glow resplandeciente -->
        <polygon points="-24,-12 -8,-10 -10,-4 -22,-6" fill="#00FFFF" filter="url(#glow-sharp)" />
        <polygon points="-24,-12 -8,-10 -10,-4 -22,-6" fill="#FFFFFF" opacity="0.9" />
        <polygon points="24,-12 8,-10 10,-4 22,-6" fill="#00FFFF" filter="url(#glow-sharp)" />
        <polygon points="24,-12 8,-10 10,-4 22,-6" fill="#FFFFFF" opacity="0.9" />
      </g>

      <!-- REACTOR DE ARCO CENTRAL (Unibeam Core) -->
      <g id="arc-reactor" transform="translate(0, -5)">
        <!-- Halo expansivo exterior -->
        <circle cx="0" cy="0" r="32" fill="${palette.accent}" opacity="0.4" filter="url(#glow-huge)" />
        <circle cx="0" cy="0" r="22" fill="#003545" stroke="${palette.secondary}" stroke-width="3" />
        <!-- Anillo segmental con muescas tecnológicas -->
        <circle cx="0" cy="0" r="15" fill="#002230" stroke="#00FFFF" stroke-width="2" filter="url(#glow-soft)" />
        <polygon points="0,-12 11,7 -11,7" fill="#00E5FF" opacity="0.9" />
        <polygon points="0,12 11,-7 -11,-7" fill="#00FFFF" opacity="0.75" />
        <circle cx="0" cy="0" r="6" fill="#FFFFFF" filter="url(#glow-sharp)" />
      </g>

      <!-- Rayos / Partículas de energía emanando del reactor -->
      <line x1="-35" y1="0" x2="-80" y2="40" stroke="#00FFFF" stroke-width="1.5" opacity="0.5" filter="url(#glow-sharp)" />
      <line x1="35" y1="0" x2="80" y2="40" stroke="#00FFFF" stroke-width="1.5" opacity="0.5" filter="url(#glow-sharp)" />
      <circle cx="-60" cy="25" r="2" fill="#FFFFFF" opacity="0.8" filter="url(#glow-sharp)" />
      <circle cx="65" cy="20" r="2.5" fill="#FFFFFF" opacity="0.8" filter="url(#glow-sharp)" />
      <circle cx="45" cy="-70" r="1.5" fill="#FFFFFF" opacity="0.9" filter="url(#glow-sharp)" />
    </g>`;
  }

  /**
   * Genera el marco de packaging auténtico de Sega Genesis / Mega Drive (16-Bit Grid Paper)
   */
  static generateGenesisPackaging(
    width: number,
    height: number,
    brandText = 'SEGA GENESIS',
    badgeText = '16-BIT CARTRIDGE',
    qualitySeal = 'OFFICIAL SEGA SEAL OF QUALITY',
  ): string {
    const borderWidth = 24;
    const headerHeight = 56;

    return `
    <!-- Sega Genesis Authentic 16-Bit Packaging Frame -->
    <g id="genesis-packaging">
      <!-- Banda Superior Negro/Plateado con Cuadrícula Clásica -->
      <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="#0A0A0E" />
      <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="url(#genesis-grid-pattern)" opacity="0.7" />
      
      <!-- Franja separadora dorada y roja -->
      <line x1="0" y1="${headerHeight - 4}" x2="${width}" y2="${headerHeight - 4}" stroke="#E62429" stroke-width="3" />
      <line x1="0" y1="${headerHeight}" x2="${width}" y2="${headerHeight}" stroke="#FFD700" stroke-width="2" />

      <!-- Logo de Consola Header (SEGA GENESIS) -->
      <g id="header-brand" transform="translate(36, 38)">
        <!-- Oval Sega Icon -->
        <rect x="-14" y="-22" width="48" height="26" rx="6" fill="#002D80" stroke="#FFFFFF" stroke-width="1.8" />
        <text x="10" y="-4" font-family="'Impact', 'Arial Black', sans-serif" font-size="16" font-style="italic" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">SEGA</text>
        
        <!-- Nombre Genesis en tipografía estilizada -->
        <text x="60" y="-3" font-family="'Arial Black', 'Impact', sans-serif" font-size="24" font-weight="900" fill="#FFFFFF" letter-spacing="3" filter="url(#drop-shadow)">GENESIS</text>
        <text x="210" y="-4" font-family="'Arial', sans-serif" font-size="11" font-weight="bold" fill="#FFD700" letter-spacing="2">[ 16-BIT ]</text>
      </g>

      <!-- Badge Superior Derecho: Formato de Cartucho -->
      <g transform="translate(${width - 40}, 36)" text-anchor="end">
        <rect x="-140" y="-20" width="140" height="22" rx="3" fill="#1C1C24" stroke="#444" stroke-width="1" />
        <text x="-70" y="-4" font-family="'Arial Black', sans-serif" font-size="10" font-weight="bold" fill="#00E5FF" text-anchor="middle" letter-spacing="1.5">${badgeText}</text>
      </g>

      <!-- Marcos Laterales con Cuadrícula Clásica de Sega -->
      <!-- Marco Izquierdo -->
      <rect x="0" y="${headerHeight}" width="${borderWidth}" height="${height - headerHeight}" fill="#0A0A0E" />
      <rect x="0" y="${headerHeight}" width="${borderWidth}" height="${height - headerHeight}" fill="url(#genesis-grid-pattern)" opacity="0.6" />
      <line x1="${borderWidth}" y1="${headerHeight}" x2="${borderWidth}" y2="${height}" stroke="#333" stroke-width="1.5" />

      <!-- Marco Derecho -->
      <rect x="${width - borderWidth}" y="${headerHeight}" width="${borderWidth}" height="${height - headerHeight}" fill="#0A0A0E" />
      <rect x="${width - borderWidth}" y="${headerHeight}" width="${borderWidth}" height="${height - headerHeight}" fill="url(#genesis-grid-pattern)" opacity="0.6" />
      <line x1="${width - borderWidth}" y1="${headerHeight}" x2="${width - borderWidth}" y2="${height}" stroke="#333" stroke-width="1.5" />

      <!-- Marco Inferior con Sello de Calidad y Barcode -->
      <rect x="0" y="${height - 48}" width="${width}" height="48" fill="#0A0A0E" />
      <rect x="0" y="${height - 48}" width="${width}" height="48" fill="url(#genesis-grid-pattern)" opacity="0.6" />
      <line x1="0" y1="${height - 48}" x2="${width}" y2="${height - 48}" stroke="#FFD700" stroke-width="2" />

      <!-- Sello Dorado Oval Oficial de Calidad -->
      <g id="quality-seal" transform="translate(68, ${height - 24})">
        <ellipse cx="0" cy="0" rx="32" ry="16" fill="#1A1500" stroke="#FFD700" stroke-width="1.8" />
        <ellipse cx="0" cy="0" rx="28" ry="13" fill="none" stroke="#FFD700" stroke-dasharray="2,2" stroke-width="0.8" />
        <text x="0" y="-3" font-family="'Arial', sans-serif" font-size="6.5" font-weight="900" fill="#FFD700" text-anchor="middle" letter-spacing="0.5">OFFICIAL</text>
        <text x="0" y="4" font-family="'Arial', sans-serif" font-size="7.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">SEGA</text>
        <text x="0" y="10" font-family="'Arial', sans-serif" font-size="5" font-weight="bold" fill="#FFD700" text-anchor="middle">SEAL OF QUALITY</text>
      </g>

      <!-- Código de Barras Decorativo (Bottom Right) -->
      <g id="barcode" transform="translate(${width - 110}, ${height - 38})">
        <rect x="0" y="0" width="85" height="28" fill="#FFFFFF" rx="2" />
        <!-- Barras verticales simuladas -->
        <line x1="6" y1="3" x2="6" y2="23" stroke="#000" stroke-width="2" />
        <line x1="11" y1="3" x2="11" y2="23" stroke="#000" stroke-width="1" />
        <line x1="14" y1="3" x2="14" y2="23" stroke="#000" stroke-width="3" />
        <line x1="20" y1="3" x2="20" y2="23" stroke="#000" stroke-width="1.5" />
        <line x1="24" y1="3" x2="24" y2="23" stroke="#000" stroke-width="2" />
        <line x1="30" y1="3" x2="30" y2="23" stroke="#000" stroke-width="1" />
        <line x1="34" y1="3" x2="34" y2="23" stroke="#000" stroke-width="3.5" />
        <line x1="42" y1="3" x2="42" y2="23" stroke="#000" stroke-width="1" />
        <line x1="46" y1="3" x2="46" y2="23" stroke="#000" stroke-width="2" />
        <line x1="52" y1="3" x2="52" y2="23" stroke="#000" stroke-width="2.5" />
        <line x1="58" y1="3" x2="58" y2="23" stroke="#000" stroke-width="1" />
        <line x1="62" y1="3" x2="62" y2="23" stroke="#000" stroke-width="3" />
        <line x1="68" y1="3" x2="68" y2="23" stroke="#000" stroke-width="1.5" />
        <line x1="74" y1="3" x2="74" y2="23" stroke="#000" stroke-width="2" />
        <line x1="78" y1="3" x2="78" y2="23" stroke="#000" stroke-width="1" />
        <text x="42" y="27" font-family="'Courier New', monospace" font-size="4" font-weight="bold" fill="#000" text-anchor="middle">0 10072 19940 3</text>
      </g>
    </g>`;
  }

  /**
   * Genera el bloque de tipografía principal (Título con bisel e inclinación 16-bit + Subtítulo)
   */
  static generateTypographyBlock(
    cx: number,
    y: number,
    title: string,
    subtitle?: string,
  ): string {
    return `
    <!-- Typography Block: Title & Subtitle with 16-Bit Metallic Extrusion -->
    <g id="typography-block" transform="translate(${cx}, ${y})">
      <!-- Sombra profunda del título principal -->
      <text x="0" y="4" font-family="'Impact', 'Arial Black', sans-serif" font-size="62" font-style="italic" font-weight="900"
            fill="#050000" text-anchor="middle" letter-spacing="4" opacity="0.95">${title.toUpperCase()}</text>
      <text x="2" y="2" font-family="'Impact', 'Arial Black', sans-serif" font-size="62" font-style="italic" font-weight="900"
            fill="#4A0505" text-anchor="middle" letter-spacing="4" opacity="0.85">${title.toUpperCase()}</text>

      <!-- Trazo exterior dorado y relleno metálico rojo/fuego -->
      <text x="0" y="0" font-family="'Impact', 'Arial Black', sans-serif" font-size="62" font-style="italic" font-weight="900"
            fill="url(#title-fire-grad)" stroke="#FFD700" stroke-width="3.5" text-anchor="middle" letter-spacing="4"
            filter="url(#drop-shadow)">${title.toUpperCase()}</text>

      <!-- Núcleo interior brillante con gradiente dorado -->
      <text x="0" y="0" font-family="'Impact', 'Arial Black', sans-serif" font-size="62" font-style="italic" font-weight="900"
            fill="url(#title-fire-grad)" text-anchor="middle" letter-spacing="4">${title.toUpperCase()}</text>

      ${
        subtitle
          ? `
      <!-- Subtítulo en badge tecnológico cian -->
      <g transform="translate(0, 36)">
        <rect x="-180" y="-14" width="360" height="26" rx="4" fill="#05121E" stroke="#00E5FF" stroke-width="1.8" filter="url(#drop-shadow)" />
        <line x1="-180" y1="-1" x2="180" y2="-1" stroke="#00FFFF" stroke-width="0.8" opacity="0.3" />
        <text x="0" y="4" font-family="'Arial Black', 'Impact', sans-serif" font-size="14" font-weight="bold"
              fill="#FFFFFF" text-anchor="middle" letter-spacing="5">${subtitle.toUpperCase()}</text>
      </g>`
          : ''
      }
    </g>`;
  }
}
