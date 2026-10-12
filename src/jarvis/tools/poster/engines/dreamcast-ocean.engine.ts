import { Injectable } from '@nestjs/common';
import { PosterEngine } from './poster-engine.interface';
import { PosterDesignSpec } from '../poster.types';

@Injectable()
export class DreamcastOceanEngine implements PosterEngine {
  readonly era = 'dreamcast-ocean';

  generateSvg(spec: PosterDesignSpec): string {
    const { width, height } = spec.dimensions;
    const vW = 320;
    const vH = 240;

    const title = spec.title || 'ORCA';
    const subtitle = spec.subtitle || 'DEFENDER OF THE SEAS';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${vW} ${vH}"
     width="${width}"
     height="${height}"
     shape-rendering="geometricPrecision">
  <defs>
    <!-- Gradiente de Cielo al Amanecer / Atardecer Dreamcast (Pastel Rose / Lavender) -->
    <linearGradient id="dreamcast-sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#7B93CC"/>
      <stop offset="30%" stop-color="#A5A8DB"/>
      <stop offset="60%" stop-color="#E2B1C2"/>
      <stop offset="85%" stop-color="#F7C9B8"/>
      <stop offset="100%" stop-color="#FCE1C8"/>
    </linearGradient>

    <!-- Gradiente de Océano 128-Bit (Fresnel: Turquesa Caribe a Zafiro Profundo) -->
    <linearGradient id="ocean-surface" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2D92AC"/>
      <stop offset="25%" stop-color="#217A9B"/>
      <stop offset="55%" stop-color="#185E86"/>
      <stop offset="85%" stop-color="#124870"/>
      <stop offset="100%" stop-color="#0A3355"/>
    </linearGradient>

    <!-- Piel de Orca / Cetáceo Satinada (Reflejo 128-bit) -->
    <linearGradient id="orca-skin" x1="25%" y1="0%" x2="75%" y2="100%">
      <stop offset="0%" stop-color="#4E5C6A"/>
      <stop offset="25%" stop-color="#303A44"/>
      <stop offset="60%" stop-color="#1C232A"/>
      <stop offset="100%" stop-color="#0E1217"/>
    </linearGradient>

    <!-- Brillo Especular de Piel Húmeda -->
    <linearGradient id="skin-specular" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="50%" stop-color="#A8D0E8" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <!-- Barras HUD Dreamcast (Cristal Azul Neón) -->
    <linearGradient id="hud-bar-life" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0044CC"/>
      <stop offset="40%" stop-color="#0077FF"/>
      <stop offset="80%" stop-color="#33B5FF"/>
      <stop offset="100%" stop-color="#80E0FF"/>
    </linearGradient>

    <linearGradient id="hud-bar-air" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#006699"/>
      <stop offset="40%" stop-color="#00AAEE"/>
      <stop offset="80%" stop-color="#44DDFF"/>
      <stop offset="100%" stop-color="#CCFFFF"/>
    </linearGradient>

    <!-- Destello Solar / Lens Flare -->
    <radialGradient id="sun-flare" cx="12%" cy="8%" r="35%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="25%" stop-color="#FFF0D0" stop-opacity="0.6"/>
      <stop offset="60%" stop-color="#FFD0B0" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#FFD0B0" stop-opacity="0"/>
    </radialGradient>

    <!-- Filtro de Sombra Suave y Relieve -->
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1.5" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.65"/>
    </filter>

    <filter id="water-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- ============================================================== -->
  <!-- 1. CIELO AL AMANECER Y DESTELLO SOLAR                          -->
  <!-- ============================================================== -->
  <rect x="0" y="0" width="${vW}" height="106" fill="url(#dreamcast-sky)" />
  <rect x="0" y="0" width="${vW}" height="106" fill="url(#sun-flare)" />

  <!-- Nubes suaves en el horizonte pastel -->
  <g id="horizon-clouds" opacity="0.65">
    <ellipse cx="60" cy="98" rx="45" ry="9" fill="#FFF2E8" />
    <ellipse cx="140" cy="100" rx="55" ry="11" fill="#FCE5E0" />
    <ellipse cx="230" cy="96" rx="50" ry="10" fill="#FCE0DA" />
    <ellipse cx="180" cy="92" rx="35" ry="8" fill="#FFFFFF" opacity="0.8" />
  </g>

  <!-- Aves marinas en silueta en la distancia -->
  <g id="distant-seabirds" fill="#283040" opacity="0.75">
    <path d="M 82 78 Q 84 76 86 78 Q 88 76 90 78 Q 86 77 82 78 Z" />
    <path d="M 91 80 Q 92.5 78.5 94 80 Q 95.5 78.5 97 80 Q 94 79 91 80 Z" />
    <path d="M 94 75 Q 95 74 96 75 Q 97 74 98 75 Q 96 74.5 94 75 Z" />
  </g>

  <!-- ============================================================== -->
  <!-- 2. PAISAJE TROPICAL COSTERO (Islotes & Acantilados 128-Bit)     -->
  <!-- ============================================================== -->
  <g id="coastal-islands">
    <!-- Islote Rocoso 1 (Sea-Stack vertical a la izquierda) -->
    <path d="M 52 105 L 54 82 L 58 78 L 63 80 L 67 105 Z" fill="#4A3B2C" />
    <path d="M 54 82 L 57 78 L 61 79 L 58 105 Z" fill="#7D664E" />
    <ellipse cx="58" cy="79" rx="6" ry="2.5" fill="#2E6930" />
    <!-- Palmera estilizada en el islote -->
    <line x1="58" y1="79" x2="55" y2="72" stroke="#4A3820" stroke-width="0.8" />
    <path d="M 55 72 Q 52 69 49 71 M 55 72 Q 58 69 61 71 M 55 72 Q 55 68 55 66" stroke="#2D7A32" stroke-width="0.7" fill="none" />

    <!-- Islote Rocoso 2 (Pequeño promontorio cercano) -->
    <path d="M 87 105 L 89 90 L 96 89 L 101 92 L 103 105 Z" fill="#5A4735" />
    <path d="M 90 90 L 95 89 L 98 105 Z" fill="#8C7358" />
    <ellipse cx="95" cy="89" rx="7" ry="2.5" fill="#327535" />

    <!-- Gran Acantilado Tropical a la Derecha (Costa Montañosa) -->
    <path d="M 240 105 L 260 70 L 285 45 L 320 20 L 320 105 Z" fill="#4B563D" />
    <!-- Estratos rocosos iluminados con tierra ocre y sol -->
    <path d="M 260 70 L 285 45 L 320 30 L 320 75 L 290 85 L 275 105 Z" fill="#8C663D" />
    <path d="M 275 75 L 300 55 L 320 40 L 320 60 L 290 80 Z" fill="#B5864F" />
    <!-- Vegetación costera en las faldas del acantilado -->
    <path d="M 242 105 Q 252 95 260 105" fill="#2B6B2E" />
    <path d="M 258 105 Q 268 92 276 105" fill="#3A8A3E" />
    <line x1="250" y1="98" x2="246" y2="92" stroke="#3D2E1A" stroke-width="0.8" />
    <path d="M 246 92 Q 241 89 238 91 M 246 92 Q 250 89 253 91" stroke="#2B7A2E" stroke-width="0.7" fill="none" />
  </g>

  <!-- ============================================================== -->
  <!-- 3. PLANO OCEÁNICO CON OLAS Y BRILLOS ESPECULARES               -->
  <!-- ============================================================== -->
  <g id="ocean-plane">
    <!-- Superficie marina base con gradiente Fresnel -->
    <rect x="0" y="105" width="${vW}" height="135" fill="url(#ocean-surface)" />

    <!-- Línea nítida del horizonte marino -->
    <line x1="0" y1="105" x2="${vW}" y2="105" stroke="#48B0CA" stroke-width="0.8" opacity="0.75" />

    <!-- Franjas de oleaje estilizado con perspectiva decreciente -->
    <!-- Olas lejanas -->
    <path d="M 0 110 Q 80 108 160 111 Q 240 109 320 110" stroke="#3EB8D2" stroke-width="0.7" fill="none" opacity="0.6" />
    <path d="M 20 115 Q 100 113 180 116 Q 260 114 320 115" stroke="#50C8E2" stroke-width="0.8" fill="none" opacity="0.65" />
    
    <!-- Olas medias con destellos de sol -->
    <path d="M 0 125 Q 70 122 140 126 Q 210 123 290 126" stroke="#40BEE0" stroke-width="1.2" fill="none" opacity="0.7" />
    <path d="M 50 135 Q 120 132 200 136 Q 270 133 320 135" stroke="#66D2EE" stroke-width="1.4" fill="none" opacity="0.75" />
    <line x1="120" y1="134" x2="160" y2="134" stroke="#FFFFFF" stroke-width="0.9" opacity="0.85" />

    <!-- Olas en primer plano con volumen dinámico -->
    <path d="M 0 155 Q 90 151 180 156 Q 260 152 320 155" stroke="#3CAEC8" stroke-width="2" fill="none" opacity="0.8" />
    <path d="M 40 180 Q 140 175 240 181 Q 290 178 320 180" stroke="#258AA4" stroke-width="2.5" fill="none" opacity="0.85" />
    <path d="M 0 210 Q 110 205 220 211 Q 280 207 320 210" stroke="#1D6C85" stroke-width="3" fill="none" opacity="0.9" />

    <!-- Destellos de luz solar concentrados en el agua -->
    <ellipse cx="145" cy="142" rx="35" ry="3.5" fill="#A8ECFF" opacity="0.35" filter="url(#water-glow)" />
    <ellipse cx="150" cy="155" rx="50" ry="4.5" fill="#FFFFFF" opacity="0.25" filter="url(#water-glow)" />
  </g>

  <!-- ============================================================== -->
  <!-- 4. EL HÉROE MARINO: ORCA / CETÁCEO EMERGENTE (Breaching)        -->
  <!-- ============================================================== -->
  <g id="marine-hero">
    <!-- Reflejo subacuático difuso bajo el agua -->
    <ellipse cx="168" cy="202" rx="20" ry="22" fill="#0A3C5C" opacity="0.5" filter="url(#water-glow)" />
    <path d="M 162 175 C 160 195 170 215 174 220 C 165 218 155 210 158 190 Z" fill="#082A44" opacity="0.45" />

    <!-- CUERPO PRINCIPAL DEL CETÁCEO (Orca elegante curvándose en el aire) -->
    <!-- Sombra y silueta base -->
    <path d="M 148 178
             C 142 165 140 148 142 135
             C 144 125 152 112 165 110
             C 178 108 195 118 205 132
             C 215 145 222 160 224 172
             C 214 170 202 165 194 158
             C 186 168 175 175 160 178 Z"
          fill="url(#orca-skin)" filter="url(#soft-shadow)" />

    <!-- Lomo Satinado 3D con reflejo especular -->
    <path d="M 152 130 
             C 156 118 168 112 180 114
             C 192 116 204 126 212 138
             C 202 130 190 122 178 120
             C 166 118 158 124 152 130 Z"
          fill="#5B6D7E" opacity="0.9" />

    <!-- Brillo especular superior del lomo (Highlights tipo Dreamcast) -->
    <path d="M 160 118 Q 175 113 192 122" stroke="#FFFFFF" stroke-width="1.8" fill="none" opacity="0.75" />
    <path d="M 164 116 Q 178 112 188 118" stroke="#D8F0FF" stroke-width="0.9" fill="none" opacity="0.95" />

    <!-- Aleta Dorsal Característica -->
    <path d="M 188 120 L 198 94 Q 199 92 196 95 L 180 115 Z" fill="#182028" />
    <path d="M 188 120 L 196 95 Q 197 97 194 105 L 186 118 Z" fill="#3D4B58" opacity="0.7" />

    <!-- Aleta Pectoral Derecha (Extendida hacia la cámara) -->
    <path d="M 194 148 C 210 152 225 162 224 172 C 218 170 205 162 196 154 Z" fill="#161E26" filter="url(#soft-shadow)" />
    <path d="M 196 150 C 208 154 218 162 216 168 C 212 166 204 160 197 154 Z" fill="#364350" opacity="0.8" />

    <!-- Mancha Blanca Ocular Distintiva (Eye patch característico de orca) -->
    <ellipse cx="172" cy="120" rx="9" ry="4.5" transform="rotate(-18, 172, 120)" fill="#F2F8FC" filter="url(#soft-shadow)" />
    <ellipse cx="171" cy="120" rx="8" ry="3.5" transform="rotate(-18, 171, 120)" fill="#FFFFFF" />

    <!-- Vientre y Garganta Blanco Nieve -->
    <path d="M 148 138 
             C 146 148 148 162 154 175
             C 158 172 162 165 164 158
             C 166 148 164 140 158 135 Z"
          fill="#F5FAFF" opacity="0.95" />

    <!-- Ojo Inteligente y Línea de la Boca -->
    <circle cx="160" cy="125" r="1.8" fill="#0A0E12" />
    <circle cx="159.5" cy="124.5" r="0.6" fill="#FFFFFF" />
    <!-- Línea de boca con sutil sonrisa marina -->
    <path d="M 144 130 Q 152 131 157 129" stroke="#121820" stroke-width="0.9" fill="none" />
  </g>

  <!-- ============================================================== -->
  <!-- 5. ESTELA DE ESPUMA, SALPICADURAS Y ANILLO DE AGUA             -->
  <!-- ============================================================== -->
  <g id="water-wake-and-splash">
    <!-- Anillo de espuma elíptico donde emerge el animal -->
    <ellipse cx="168" cy="178" rx="36" ry="10" fill="#3AA0C4" opacity="0.55" filter="url(#water-glow)" />
    <ellipse cx="168" cy="177" rx="32" ry="7.5" fill="#78D8F8" opacity="0.75" />
    <ellipse cx="168" cy="176" rx="26" ry="5.5" fill="#FFFFFF" opacity="0.95" />

    <!-- Gotas y salpicaduras volumétricas ascendentes -->
    <circle cx="148" cy="168" r="1.8" fill="#FFFFFF" opacity="0.9" />
    <circle cx="154" cy="162" r="1.3" fill="#FFFFFF" opacity="0.85" />
    <circle cx="188" cy="165" r="2.2" fill="#FFFFFF" opacity="0.9" />
    <circle cx="196" cy="170" r="1.6" fill="#E0F8FF" opacity="0.8" />
    <circle cx="180" cy="160" r="1.2" fill="#FFFFFF" opacity="0.95" />
    <circle cx="206" cy="174" r="1.5" fill="#E0F8FF" opacity="0.7" />

    <!-- Ondas concéntricas de perturbación en el agua -->
    <ellipse cx="168" cy="180" rx="48" ry="12" fill="none" stroke="#60D4F0" stroke-width="1.2" opacity="0.6" />
    <ellipse cx="168" cy="183" rx="64" ry="15" fill="none" stroke="#40B4D8" stroke-width="0.9" opacity="0.4" />
  </g>

  <!-- ============================================================== -->
  <!-- 6. HUD AUTÉNTICO DREAMCAST / PS2 (Top-Left Status Display)     -->
  <!-- ============================================================== -->
  <g id="dreamcast-hud" transform="translate(14, 12)">
    <!-- Ícono del Delfín / Cetáceo -->
    <g id="hud-icon" transform="translate(0, 0)">
      <path d="M 6 12 C 4 8 8 2 14 3 C 20 4 22 10 18 16 C 16 18 13 18 11 15 C 8 18 5 16 6 12 Z" fill="#0C2448" filter="url(#soft-shadow)" />
      <path d="M 7 11 C 6 8 9 4 13 4 C 18 5 19 9 16 14 C 14 16 12 15 10 13 C 8 15 6 14 7 11 Z" fill="#2068B8" />
      <circle cx="10" cy="7" r="1" fill="#FFFFFF" />
    </g>

    <!-- Barra Superior: VITALITY / LIFE (Cilíndrica, curvada en 3D) -->
    <g transform="translate(24, 4)">
      <!-- Fondo y bisel de la barra -->
      <rect x="0" y="0" width="68" height="6.5" rx="3.2" fill="#081830" stroke="#002255" stroke-width="0.8" />
      <rect x="1" y="1" width="66" height="4.5" rx="2.2" fill="#051020" />
      <!-- Relleno de energía azul brillante -->
      <rect x="1.5" y="1.5" width="58" height="3.5" rx="1.7" fill="url(#hud-bar-life)" />
      <!-- Brillo tubular superior de la barra 3D -->
      <line x1="3" y1="2" x2="57" y2="2" stroke="#FFFFFF" stroke-width="0.7" opacity="0.85" />
    </g>

    <!-- Esferas nacaradas de oxígeno / burbujas -->
    <g transform="translate(4, 18)">
      <circle cx="5" cy="5" r="4.5" fill="#184068" stroke="#5090C8" stroke-width="0.8" />
      <circle cx="4" cy="4" r="2.5" fill="#A8D8F8" opacity="0.8" />
      <circle cx="3.5" cy="3.5" r="1" fill="#FFFFFF" />

      <circle cx="16" cy="5" r="4.5" fill="#184068" stroke="#5090C8" stroke-width="0.8" />
      <circle cx="15" cy="4" r="2.5" fill="#A8D8F8" opacity="0.8" />
      <circle cx="14.5" cy="3.5" r="1" fill="#FFFFFF" />
    </g>

    <!-- Barra Inferior: SONAR / OXYGEN -->
    <g transform="translate(24, 19)">
      <rect x="0" y="0" width="68" height="6.5" rx="3.2" fill="#081830" stroke="#002255" stroke-width="0.8" />
      <rect x="1" y="1" width="66" height="4.5" rx="2.2" fill="#051020" />
      <rect x="1.5" y="1.5" width="46" height="3.5" rx="1.7" fill="url(#hud-bar-air)" />
      <line x1="3" y1="2" x2="45" y2="2" stroke="#FFFFFF" stroke-width="0.7" opacity="0.85" />
    </g>
  </g>

  <!-- ============================================================== -->
  <!-- 7. TIPOGRAFÍA Y LOGOTIPO LEGENDARIO DREAMCAST (Bottom-Left)    -->
  <!-- ============================================================== -->
  <g id="ecco-style-typography" transform="translate(18, 178)">
    <!-- Título Principal Amarillo Brillante con Lunas Crecientes estilo Ecco -->
    <g id="main-title">
      <!-- Sombra profunda proyectada -->
      <text x="2" y="2" font-family="'Times New Roman', 'Georgia', serif" font-size="44" font-weight="900"
            fill="#081828" letter-spacing="1">${title.toLowerCase()}</text>

      <!-- Trazo y cuerpo en amarillo dorado luminoso -->
      <text x="0" y="0" font-family="'Times New Roman', 'Georgia', serif" font-size="44" font-weight="900"
            fill="#FFF000" stroke="#C49800" stroke-width="1.2" letter-spacing="1" filter="url(#soft-shadow)">${title.toLowerCase()}</text>

      <!-- Motivo de media luna estilizada en el título -->
      <path d="M 12 -22 Q 18 -15 24 -22 Q 18 -8 12 -22 Z" fill="#FFF880" opacity="0.7" />
    </g>

    <!-- Subtítulo Superior: "THE DEFENDER" o "THE OCEAN" -->
    <g transform="translate(2, 14)">
      <!-- Sombra de texto -->
      <text x="1" y="1" font-family="'Times New Roman', 'Georgia', serif" font-size="12" font-weight="bold"
            fill="#06121E" letter-spacing="2.5">THE OCEAN GUARDIAN</text>
      <!-- Texto dorado con serifa -->
      <text x="0" y="0" font-family="'Times New Roman', 'Georgia', serif" font-size="12" font-weight="bold"
            fill="#FFF040" stroke="#A88000" stroke-width="0.4" letter-spacing="2.5">${subtitle.toUpperCase()}</text>
    </g>

    <!-- Subtítulo Inferior: "DEFENDER OF THE FUTURE" / Época 128-Bit -->
    <g transform="translate(2, 26)">
      <text x="1" y="1" font-family="'Arial', 'Helvetica', sans-serif" font-size="7" font-weight="900"
            fill="#040C14" letter-spacing="1.8">SEGA DREAMCAST 128-BIT EDITION</text>
      <text x="0" y="0" font-family="'Arial', 'Helvetica', sans-serif" font-size="7" font-weight="900"
            fill="#E0F4FF" letter-spacing="1.8">SEGA DREAMCAST 128-BIT EDITION</text>
    </g>
  </g>
</svg>`;
  }
}
