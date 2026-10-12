import { Injectable } from '@nestjs/common';
import { PosterEngine } from './poster-engine.interface';
import { PosterDesignSpec } from '../poster.types';
import { SceneBuilder } from '../composition/scene-builder';

@Injectable()
export class GenesisPixelArtEngine implements PosterEngine {
  readonly era = 'genesis16';

  generateSvg(spec: PosterDesignSpec): string {
    const { width, height } = spec.dimensions;
    const rng = SceneBuilder.createRng(spec.seed || 1994);

    const cx = width / 2;
    const heroCy = Math.round(height * 0.44);
    const typoY = Math.round(height * 0.76);

    const starfield = SceneBuilder.generateStarfield(width, height, spec.scenery.starCount || 140, rng);
    const perspectiveGrid = SceneBuilder.generatePerspectiveGrid(width, height, spec.palette.grid || '#1F2438');
    const hero = SceneBuilder.generateArmoredHero(cx, heroCy, 1.25, spec.palette, rng);
    const typography = SceneBuilder.generateTypographyBlock(cx, typoY, spec.title, spec.subtitle);
    const packaging = SceneBuilder.generateGenesisPackaging(
      width,
      height,
      spec.packaging.brand || 'SEGA GENESIS',
      spec.packaging.badgeText || '16-BIT CARTRIDGE',
      spec.packaging.qualitySeal || 'OFFICIAL SEGA SEAL OF QUALITY',
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width} ${height}"
     width="${width}"
     height="${height}">
  <defs>
    <!-- Filtros de Glow y Sombras -->
    <filter id="glow-sharp" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="glow-soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="glow-huge" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="25" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="3" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.8"/>
    </filter>

    <!-- Patrón Cuadriculado Clásico de Cartuchos Sega 16-Bit (Grid Paper) -->
    <pattern id="genesis-grid-pattern" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#0C0D12"/>
      <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#232634" stroke-width="0.8"/>
    </pattern>

    <!-- Gradientes Metálicos para Armadura y Textos -->
    <linearGradient id="armor-red-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF512F"/>
      <stop offset="45%" stop-color="#DD2476"/>
      <stop offset="80%" stop-color="#9B0000"/>
      <stop offset="100%" stop-color="#4A0000"/>
    </linearGradient>

    <linearGradient id="armor-red-dark" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#C01025"/>
      <stop offset="50%" stop-color="#800010"/>
      <stop offset="100%" stop-color="#3A0000"/>
    </linearGradient>

    <linearGradient id="armor-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF2A3"/>
      <stop offset="35%" stop-color="#FFD700"/>
      <stop offset="70%" stop-color="#D4AF37"/>
      <stop offset="100%" stop-color="#8A6700"/>
    </linearGradient>

    <linearGradient id="title-fire-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="20%" stop-color="#FFE600"/>
      <stop offset="55%" stop-color="#FF5A00"/>
      <stop offset="85%" stop-color="#C00000"/>
      <stop offset="100%" stop-color="#600000"/>
    </linearGradient>

    <radialGradient id="nebula-center" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#2A0845" stop-opacity="0.85"/>
      <stop offset="45%" stop-color="#0B132B" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#05050A" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="sun-horizon" cx="50%" cy="62%" r="40%">
      <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.45"/>
      <stop offset="50%" stop-color="#005577" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- 1. Fondo Cósmico Base -->
  <rect width="${width}" height="${height}" fill="#06050C" />
  <rect width="${width}" height="${height}" fill="url(#nebula-center)" />
  <rect width="${width}" height="${height}" fill="url(#sun-horizon)" />

  <!-- 2. Campo Estelar Procedural -->
  <g id="starfield">
    ${starfield}
  </g>

  <!-- 3. Retícula en Perspectiva 16-Bit -->
  ${perspectiveGrid}

  <!-- 4. Sujeto Central (Armadura Heroica con Reactor de Arco) -->
  ${hero}

  <!-- 5. Tipografía y Logotipos de Portada -->
  ${typography}

  <!-- 6. Marco de Packaging Auténtico Sega Genesis -->
  ${packaging}
</svg>`;
  }
}
