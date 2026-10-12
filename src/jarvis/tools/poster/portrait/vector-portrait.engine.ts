import { Injectable, Logger } from '@nestjs/common';
import { PortraitDesignSpec } from './portrait.types';

@Injectable()
export class VectorPortraitEngine {
  private readonly logger = new Logger(VectorPortraitEngine.name);

  /**
   * Genera SVG vectorial maestro de alta resolución para el retrato paramétrico
   */
  renderSvg(spec: PortraitDesignSpec): string {
    const { width, height } = spec.dimensions;
    const cx = width / 2;
    const cy = height * 0.46; // Centro del cráneo

    // Dimensiones de cabeza
    const headW = width * 0.42;
    const headH = headW * spec.proportions.faceRatio;

    // Puntos anatómicos clave (relativos al centro de la cabeza)
    const eyeY = cy - headH * 0.5 + headH * spec.proportions.eyeLevelY;
    const eyeDist = (headW * spec.proportions.eyeSpacing) / 2;
    const eyeW = headW * spec.proportions.eyeWidth;
    const eyeH = headW * spec.proportions.eyeHeight;

    const noseY = cy - headH * 0.5 + headH * spec.proportions.noseBaseY;
    const noseW = (headW * spec.proportions.noseWidth) / 2;

    const mouthY = cy - headH * 0.5 + headH * spec.proportions.mouthLevelY;
    const mouthW = (headW * spec.proportions.mouthWidth) / 2;

    const chinY = cy + headH * 0.5;
    const jawW = headW * (0.8 - spec.proportions.jawTaper * 0.35);

    // Defs & Gradients
    const defs = this.buildDefs(spec);

    // 1. Fondo atmosférico
    const backgroundSvg = `
      <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
      <circle cx="${cx}" cy="${cy - headH * 0.1}" r="${headW * 1.3}" fill="url(#haloGrad)" opacity="0.4" />
    `;

    // 2. Partículas o Halftone si aplica
    const ambientEffectSvg = this.buildAmbientEffects(spec, width, height);

    // 3. Cuello y Clavícula / Torso
    const neckW = headW * 0.44;
    const neckTopY = mouthY + headH * 0.05;
    const neckBottomY = height * 1.05;
    const neckSvg = `
      <g id="neck-group">
        <!-- Cuello base -->
        <path d="M ${cx - neckW} ${neckTopY} 
                 Q ${cx - neckW * 1.1} ${neckBottomY * 0.75} ${cx - width * 0.35} ${neckBottomY} 
                 L ${cx + width * 0.35} ${neckBottomY} 
                 Q ${cx + neckW * 1.1} ${neckBottomY * 0.75} ${cx + neckW} ${neckTopY} Z" 
              fill="${spec.palette.skinShadow}" />
        <!-- Sombra proyectada del mentón sobre cuello -->
        <path d="M ${cx - neckW * 0.85} ${neckTopY} 
                 Q ${cx} ${chinY + headH * 0.06} ${cx + neckW * 0.85} ${neckTopY} 
                 Q ${cx} ${chinY + headH * 0.16} ${cx - neckW * 0.85} ${neckTopY} Z" 
              fill="#000000" opacity="0.35" />
        <!-- Músculos esternocleidomastoideos -->
        <path d="M ${cx - neckW * 0.5} ${chinY + headH * 0.12} Q ${cx - neckW * 0.25} ${height * 0.85} ${cx - neckW * 0.1} ${height * 0.95}" 
              stroke="${spec.palette.skinHighlight}" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.25" />
        <path d="M ${cx + neckW * 0.5} ${chinY + headH * 0.12} Q ${cx + neckW * 0.25} ${height * 0.85} ${cx + neckW * 0.1} ${height * 0.95}" 
              stroke="${spec.palette.skinHighlight}" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.25" />
      </g>
    `;

    // 4. Orejas
    const earTopY = eyeY - eyeH * 0.8;
    const earBottomY = noseY;
    const earW = headW * 0.16;
    const earsSvg = `
      <g id="ears-group">
        <!-- Oreja Izquierda -->
        <path d="M ${cx - headW * 0.5} ${earTopY} 
                 C ${cx - headW * 0.5 - earW} ${earTopY - 10} ${cx - headW * 0.5 - earW} ${earBottomY} ${cx - headW * 0.48} ${earBottomY + 10} 
                 Q ${cx - headW * 0.46} ${earBottomY - 10} ${cx - headW * 0.48} ${earTopY} Z" 
              fill="${spec.palette.skinShadow}" />
        <!-- Concha interna oreja izquierda -->
        <path d="M ${cx - headW * 0.5 - earW * 0.5} ${earTopY + 20} Q ${cx - headW * 0.5 - earW * 0.6} ${earBottomY - 15} ${cx - headW * 0.49} ${earBottomY} " 
              stroke="${spec.palette.skinSubsurface}" stroke-width="3" fill="none" opacity="0.6" />

        <!-- Oreja Derecha -->
        <path d="M ${cx + headW * 0.5} ${earTopY} 
                 C ${cx + headW * 0.5 + earW} ${earTopY - 10} ${cx + headW * 0.5 + earW} ${earBottomY} ${cx + headW * 0.48} ${earBottomY + 10} 
                 Q ${cx + headW * 0.46} ${earBottomY - 10} ${cx + headW * 0.48} ${earTopY} Z" 
              fill="${spec.palette.skinShadow}" />
        <!-- Concha interna oreja derecha -->
        <path d="M ${cx + headW * 0.5 + earW * 0.5} ${earTopY + 20} Q ${cx + headW * 0.5 + earW * 0.6} ${earBottomY - 15} ${cx + headW * 0.49} ${earBottomY} " 
              stroke="${spec.palette.skinSubsurface}" stroke-width="3" fill="none" opacity="0.6" />
      </g>
    `;

    // 5. Rostro / Mandíbula (Cráneo anatómico)
    const craniumTopY = cy - headH * 0.5;
    const templeY = eyeY - headH * 0.12;
    const cheekY = noseY;
    const headOutline = `
      M ${cx} ${craniumTopY}
      C ${cx + headW * 0.52} ${craniumTopY} ${cx + headW * 0.54} ${templeY} ${cx + headW * 0.5} ${eyeY}
      C ${cx + headW * 0.48} ${cheekY} ${cx + jawW * 0.55} ${mouthY + 10} ${cx + jawW * 0.3} ${chinY - 10}
      Q ${cx} ${chinY + 8} ${cx - jawW * 0.3} ${chinY - 10}
      C ${cx - jawW * 0.55} ${mouthY + 10} ${cx - headW * 0.48} ${cheekY} ${cx - headW * 0.5} ${eyeY}
      C ${cx - headW * 0.54} ${templeY} ${cx - headW * 0.52} ${craniumTopY} ${cx} ${craniumTopY} Z
    `;

    const faceBaseSvg = `
      <g id="face-base-group">
        <path d="${headOutline}" fill="url(#faceBaseGrad)" filter="url(#subtleGlow)" />
        <!-- Volumen y sombra del lado opuesto a la key light -->
        <path d="M ${cx} ${craniumTopY} 
                 C ${cx + headW * 0.52} ${craniumTopY} ${cx + headW * 0.54} ${templeY} ${cx + headW * 0.5} ${eyeY} 
                 C ${cx + headW * 0.48} ${cheekY} ${cx + jawW * 0.55} ${mouthY + 10} ${cx + jawW * 0.3} ${chinY - 10} 
                 Q ${cx} ${chinY + 8} ${cx} ${noseY} 
                 Q ${cx + headW * 0.1} ${eyeY} ${cx} ${craniumTopY} Z" 
              fill="${spec.palette.skinShadow}" opacity="0.45" />
        <!-- Borde cálido de Sub-surface scattering -->
        <path d="M ${cx} ${craniumTopY + 15} Q ${cx + headW * 0.12} ${eyeY} ${cx} ${noseY}" 
              stroke="${spec.palette.skinSubsurface}" stroke-width="5" fill="none" opacity="0.3" filter="url(#subtleGlow)" />
      </g>
    `;

    // 6. Ojos (Esclerótica, Iris multicolor, Pupila, Brillo corneal, Párpados)
    const eyesSvg = this.buildEyes(cx, eyeY, eyeDist, eyeW, eyeH, spec);

    // 7. Cejas (Expresión según ángulo browAngleDeg)
    const browsSvg = this.buildEyebrows(cx, eyeY, eyeDist, eyeW, spec);

    // 8. Nariz (Puente, Alar base, Fosas, Volumen de luz)
    const noseSvg = this.buildNose(cx, eyeY, noseY, noseW, spec);

    // 9. Boca y Labios (Arco de Cupido, labio superior e inferior con volumen)
    const mouthSvg = this.buildMouth(cx, mouthY, mouthW, spec);

    // 10. Cabello estilizado paramétrico
    const hairSvg = this.buildHair(cx, craniumTopY, cy, headW, headH, spec);

    // 11. Rim light (Contraluz dramático de recorte)
    const rimLightSvg = `
      <path d="${headOutline}" fill="none" stroke="${spec.palette.accent}" stroke-width="4" opacity="${spec.lighting.rimIntensity * 0.6}" filter="url(#subtleGlow)" />
    `;

    // 12. Marcas Cyberpunk / Tatuajes o Decoraciones si aplica
    const markingsSvg = spec.features.addCyberMarkings ? this.buildCyberMarkings(cx, eyeY, cheekY, headW, spec) : '';

    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${defs}
  ${backgroundSvg}
  ${ambientEffectSvg}
  ${neckSvg}
  ${earsSvg}
  ${faceBaseSvg}
  ${markingsSvg}
  ${noseSvg}
  ${mouthSvg}
  ${eyesSvg}
  ${browsSvg}
  ${hairSvg}
  ${rimLightSvg}
</svg>
`.trim();
  }

  private buildDefs(spec: PortraitDesignSpec): string {
    return `
    <defs>
      <!-- Gradiente de Fondo -->
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${spec.palette.backgroundGradient[0]}" />
        <stop offset="100%" stop-color="${spec.palette.backgroundGradient[1]}" />
      </linearGradient>

      <!-- Halo Central -->
      <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${spec.palette.accent}" stop-opacity="0.3" />
        <stop offset="100%" stop-color="${spec.palette.backgroundGradient[0]}" stop-opacity="0" />
      </radialGradient>

      <!-- Gradiente Base de Rostro (Key light a sombra) -->
      <linearGradient id="faceBaseGrad" x1="20%" y1="20%" x2="80%" y2="80%">
        <stop offset="0%" stop-color="${spec.palette.skinHighlight}" />
        <stop offset="45%" stop-color="${spec.palette.skinBase}" />
        <stop offset="85%" stop-color="${spec.palette.skinShadow}" />
      </linearGradient>

      <!-- Gradiente Iris Izquierdo/Derecho -->
      <radialGradient id="irisGrad" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stop-color="${spec.palette.irisSecondary}" />
        <stop offset="70%" stop-color="${spec.palette.irisPrimary}" />
        <stop offset="100%" stop-color="#0a0a14" />
      </radialGradient>

      <!-- Filtro de Resplandor Suave -->
      <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    `;
  }

  private buildEyes(
    cx: number,
    eyeY: number,
    eyeDist: number,
    eyeW: number,
    eyeH: number,
    spec: PortraitDesignSpec,
  ): string {
    const renderSingleEye = (ex: number, isRight: boolean) => {
      const dir = isRight ? 1 : -1;
      return `
        <!-- Cuenca y sombra superior del párpado -->
        <ellipse cx="${ex}" cy="${eyeY}" rx="${eyeW * 1.1}" ry="${eyeH * 1.3}" fill="${spec.palette.skinShadow}" opacity="0.35" />
        <!-- Esclerótica (blanco del ojo con sombra esférica) -->
        <path d="M ${ex - eyeW} ${eyeY} 
                 Q ${ex} ${eyeY - eyeH} ${ex + eyeW} ${eyeY} 
                 Q ${ex} ${eyeY + eyeH * 0.8} ${ex - eyeW} ${eyeY} Z" 
              fill="#f0ede9" />
        <!-- Iris -->
        <circle cx="${ex}" cy="${eyeY}" r="${eyeH * 0.8}" fill="url(#irisGrad)" />
        <!-- Pupila -->
        <circle cx="${ex}" cy="${eyeY}" r="${eyeH * 0.4}" fill="#08080c" />
        <!-- Brillo corneal / Catchlight especular -->
        <circle cx="${ex - eyeH * 0.25 * dir}" cy="${eyeY - eyeH * 0.25}" r="${eyeH * 0.18}" fill="#ffffff" />
        <circle cx="${ex + eyeH * 0.2 * dir}" cy="${eyeY + eyeH * 0.15}" r="${eyeH * 0.08}" fill="#ffffff" opacity="0.7" />
        <!-- Línea del párpado superior / Pestañas principales -->
        <path d="M ${ex - eyeW * 1.08} ${eyeY + 2} 
                 Q ${ex} ${eyeY - eyeH * 1.15} ${ex + eyeW * 1.08} ${eyeY + 2}" 
              stroke="#1a1418" stroke-width="4.5" stroke-linecap="round" fill="none" />
        <!-- Eyeliner felino cat-eye rasgado hacia el extremo exterior -->
        <path d="M ${ex + dir * eyeW * 0.8} ${eyeY - 2} 
                 Q ${ex + dir * eyeW * 1.15} ${eyeY - eyeH * 0.8} ${ex + dir * eyeW * 1.3} ${eyeY - eyeH * 1.2}" 
              stroke="#1a1418" stroke-width="3.5" stroke-linecap="round" fill="none" />
        <!-- Pliegue palpebral superior -->
        <path d="M ${ex - eyeW * 0.9} ${eyeY - eyeH * 1.1} 
                 Q ${ex} ${eyeY - eyeH * 1.55} ${ex + eyeW * 0.85} ${eyeY - eyeH * 1.1}" 
              stroke="${spec.palette.skinShadow}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6" />
      `;
    };

    return `
      <g id="eyes-group">
        ${renderSingleEye(cx - eyeDist, false)}
        ${renderSingleEye(cx + eyeDist, true)}
      </g>
    `;
  }

  private buildEyebrows(
    cx: number,
    eyeY: number,
    eyeDist: number,
    eyeW: number,
    spec: PortraitDesignSpec,
  ): string {
    const browY = eyeY - eyeW * 0.45;
    const tilt = spec.proportions.browAngleDeg * 1.8;

    const renderBrow = (bx: number, isRight: boolean) => {
      const mult = isRight ? 1 : -1;
      return `
        <path d="M ${bx - eyeW * 0.95 * mult} ${browY + tilt * 0.3} 
                 Q ${bx} ${browY - 8 - tilt * 0.5} ${bx + eyeW * 1.05 * mult} ${browY + tilt} 
                 Q ${bx} ${browY - 2 - tilt * 0.5} ${bx - eyeW * 0.95 * mult} ${browY + tilt * 0.3} Z" 
              fill="${spec.palette.hairBase}" opacity="0.9" />
      `;
    };

    return `
      <g id="eyebrows-group">
        ${renderBrow(cx - eyeDist, false)}
        ${renderBrow(cx + eyeDist, true)}
      </g>
    `;
  }

  private buildNose(
    cx: number,
    eyeY: number,
    noseY: number,
    noseW: number,
    spec: PortraitDesignSpec,
  ): string {
    return `
      <g id="nose-group">
        <!-- Sombra lateral del puente nasal (Key light en un lado) -->
        <path d="M ${cx + 3} ${eyeY + 5} 
                 L ${cx + noseW * 0.5} ${noseY - 10} 
                 L ${cx + noseW} ${noseY + 2} 
                 Q ${cx} ${noseY + 8} ${cx - noseW} ${noseY + 2} 
                 L ${cx - 4} ${eyeY + 5} Z" 
              fill="${spec.palette.skinShadow}" opacity="0.32" />
        <!-- Punta de la nariz y aletas nasales -->
        <!-- Fosa izquierda -->
        <ellipse cx="${cx - noseW * 0.6}" cy="${noseY}" rx="${noseW * 0.28}" ry="${noseW * 0.16}" fill="#1a1012" opacity="0.65" />
        <!-- Fosa derecha -->
        <ellipse cx="${cx + noseW * 0.6}" cy="${noseY}" rx="${noseW * 0.28}" ry="${noseW * 0.16}" fill="#1a1012" opacity="0.65" />
        <!-- Lóbulo central de la nariz con brillo -->
        <ellipse cx="${cx}" cy="${noseY - 3}" rx="${noseW * 0.45}" ry="${noseW * 0.35}" fill="${spec.palette.skinBase}" />
        <circle cx="${cx - 2}" cy="${noseY - 5}" r="${noseW * 0.18}" fill="${spec.palette.skinHighlight}" opacity="0.75" />
        <!-- Arco inferior del septum nasal -->
        <path d="M ${cx - noseW * 0.7} ${noseY + 1} Q ${cx} ${noseY + 6} ${cx + noseW * 0.7} ${noseY + 1}" 
              stroke="${spec.palette.skinShadow}" stroke-width="2.5" fill="none" opacity="0.8" />
      </g>
    `;
  }

  private buildMouth(
    cx: number,
    mouthY: number,
    mouthW: number,
    spec: PortraitDesignSpec,
  ): string {
    const philtrumH = 14;
    return `
      <g id="mouth-group">
        <!-- Surco del filtrum debajo de la nariz -->
        <path d="M ${cx - 6} ${mouthY - philtrumH} L ${cx - 4} ${mouthY - 4}" stroke="${spec.palette.skinShadow}" stroke-width="2" fill="none" opacity="0.4" />
        <path d="M ${cx + 6} ${mouthY - philtrumH} L ${cx + 4} ${mouthY - 4}" stroke="${spec.palette.skinShadow}" stroke-width="2" fill="none" opacity="0.4" />

        <!-- Labio superior con Arco de Cupido -->
        <path d="M ${cx - mouthW} ${mouthY} 
                 Q ${cx - mouthW * 0.4} ${mouthY - 9} ${cx} ${mouthY - 5} 
                 Q ${cx + mouthW * 0.4} ${mouthY - 9} ${cx + mouthW} ${mouthY} 
                 Q ${cx} ${mouthY + 3} ${cx - mouthW} ${mouthY} Z" 
              fill="${spec.palette.skinSubsurface}" opacity="0.85" />

        <!-- Hendidura / Comisura labial oscura -->
        <path d="M ${cx - mouthW} ${mouthY} 
                 Q ${cx - mouthW * 0.3} ${mouthY + 1} ${cx} ${mouthY + 3} 
                 Q ${cx + mouthW * 0.3} ${mouthY + 1} ${cx + mouthW} ${mouthY}" 
              stroke="#1a0d10" stroke-width="3" stroke-linecap="round" fill="none" />

        <!-- Labio inferior con volumen y luz especular -->
        <path d="M ${cx - mouthW * 0.9} ${mouthY + 1} 
                 Q ${cx} ${mouthY + 18} ${cx + mouthW * 0.9} ${mouthY + 1} 
                 Q ${cx} ${mouthY + 4} ${cx - mouthW * 0.9} ${mouthY + 1} Z" 
              fill="${spec.palette.skinBase}" />
        <!-- Brillos de volumen en lóbulos de labio inferior -->
        <ellipse cx="${cx - mouthW * 0.28}" cy="${mouthY + 9}" rx="${mouthW * 0.22}" ry="3.5" fill="${spec.palette.skinHighlight}" opacity="0.75" />
        <ellipse cx="${cx + mouthW * 0.28}" cy="${mouthY + 9}" rx="${mouthW * 0.22}" ry="3.5" fill="${spec.palette.skinHighlight}" opacity="0.65" />
        <circle cx="${cx - mouthW * 0.15}" cy="${mouthY + 8}" r="2" fill="#ffffff" opacity="0.8" />
        <circle cx="${cx + mouthW * 0.15}" cy="${mouthY + 8}" r="2" fill="#ffffff" opacity="0.8" />

        <!-- Sombra debajo del labio inferior (mentón) -->
        <path d="M ${cx - mouthW * 0.6} ${mouthY + 22} Q ${cx} ${mouthY + 28} ${cx + mouthW * 0.6} ${mouthY + 22}" 
              stroke="${spec.palette.skinShadow}" stroke-width="3.5" fill="none" opacity="0.5" />
      </g>
    `;
  }

  private buildHair(
    cx: number,
    craniumTopY: number,
    cy: number,
    headW: number,
    headH: number,
    spec: PortraitDesignSpec,
  ): string {
    const hairVol = spec.hair.volume;
    const hairTopY = craniumTopY - headH * 0.12 * hairVol;
    const strandCol = spec.palette.hairBase;
    const highCol = spec.palette.hairHighlight;

    if (spec.hair.style === 'undercut' || spec.hair.style === 'short_textured') {
      return `
        <g id="hair-group">
          <!-- Masa principal de cabello corto -->
          <path d="M ${cx - headW * 0.52} ${cy - headH * 0.15} 
                   C ${cx - headW * 0.58} ${hairTopY} ${cx + headW * 0.58} ${hairTopY} ${cx + headW * 0.52} ${cy - headH * 0.15} 
                   L ${cx + headW * 0.48} ${cy - headH * 0.28} 
                   C ${cx + headW * 0.3} ${craniumTopY + 30} ${cx - headW * 0.3} ${craniumTopY + 30} ${cx - headW * 0.48} ${cy - headH * 0.28} Z" 
                fill="${strandCol}" />
          <!-- Mechones de brillo angular -->
          <path d="M ${cx - headW * 0.3} ${hairTopY + 25} Q ${cx} ${hairTopY + 10} ${cx + headW * 0.3} ${hairTopY + 30}" 
                stroke="${highCol}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.75" />
        </g>
      `;
    }

    // Default: 'flowing' / 'cosmic_ethereal' / 'braided'
    return `
      <g id="hair-group">
        <!-- Masa de cabello posterior y volumen -->
        <path d="M ${cx - headW * 0.62} ${cy + headH * 0.45} 
                 C ${cx - headW * 0.75} ${hairTopY} ${cx + headW * 0.75} ${hairTopY} ${cx + headW * 0.62} ${cy + headH * 0.45} 
                 Q ${cx + headW * 0.5} ${cy + headH * 0.2} ${cx + headW * 0.48} ${cy - headH * 0.1} 
                 C ${cx + headW * 0.3} ${craniumTopY + 40} ${cx - headW * 0.3} ${craniumTopY + 40} ${cx - headW * 0.48} ${cy - headH * 0.1} 
                 Q ${cx - headW * 0.5} ${cy + headH * 0.2} ${cx - headW * 0.62} ${cy + headH * 0.45} Z" 
              fill="${strandCol}" />

        <!-- Flequillo / mechones frontales -->
        <path d="M ${cx - headW * 0.45} ${craniumTopY + 20} 
                 Q ${cx - headW * 0.1} ${craniumTopY + 80} ${cx + headW * 0.2} ${craniumTopY + 50} 
                 Q ${cx + headW * 0.4} ${craniumTopY + 75} ${cx + headW * 0.45} ${craniumTopY + 25}" 
              stroke="${strandCol}" stroke-width="12" fill="none" stroke-linecap="round" />

        <!-- Luces y reflejos de cabello (Halo / Sheen) -->
        <path d="M ${cx - headW * 0.4} ${hairTopY + 40} 
                 Q ${cx} ${hairTopY + 25} ${cx + headW * 0.4} ${hairTopY + 45}" 
              stroke="${highCol}" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.8" />
        <path d="M ${cx - headW * 0.35} ${hairTopY + 55} 
                 Q ${cx} ${hairTopY + 40} ${cx + headW * 0.35} ${hairTopY + 60}" 
              stroke="${highCol}" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.5" />
      </g>
    `;
  }

  private buildCyberMarkings(
    cx: number,
    eyeY: number,
    cheekY: number,
    headW: number,
    spec: PortraitDesignSpec,
  ): string {
    const col = spec.palette.accent;
    return `
      <g id="cyber-markings" filter="url(#subtleGlow)">
        <!-- Circuito en pómulo derecho -->
        <path d="M ${cx + headW * 0.28} ${eyeY + 20} 
                 L ${cx + headW * 0.38} ${cheekY} 
                 L ${cx + headW * 0.34} ${cheekY + 25}" 
              stroke="${col}" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.85" />
        <circle cx="${cx + headW * 0.28}" cy="${eyeY + 20}" r="3" fill="${col}" />
        <circle cx="${cx + headW * 0.34}" cy="${cheekY + 25}" r="3" fill="${col}" />

        <!-- Circuito en sien izquierda -->
        <path d="M ${cx - headW * 0.42} ${eyeY - 25} 
                 L ${cx - headW * 0.32} ${eyeY - 15} 
                 L ${cx - headW * 0.32} ${eyeY + 5}" 
              stroke="${col}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.75" />
        <circle cx="${cx - headW * 0.42}" cy="${eyeY - 25}" r="2.5" fill="${col}" />
      </g>
    `;
  }

  private buildAmbientEffects(
    spec: PortraitDesignSpec,
    width: number,
    height: number,
  ): string {
    if (!spec.features.ambientParticles) return '';

    const particles: string[] = [];
    const count = 28;
    for (let i = 0; i < count; i++) {
      const px = ((i * 137.5) % width);
      const py = ((i * 219.3) % height);
      const pr = 1.5 + (i % 4);
      const pop = 0.2 + (i % 5) * 0.12;
      particles.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${pr}" fill="${spec.palette.accent}" opacity="${pop}" />`);
    }

    return `<g id="ambient-particles" filter="url(#subtleGlow)">${particles.join('')}</g>`;
  }
}
