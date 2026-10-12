import { Injectable } from '@nestjs/common';
import { PosterEngine } from './poster-engine.interface';
import { PosterDesignSpec } from '../poster.types';
import { SceneBuilder } from '../composition/scene-builder';

@Injectable()
export class GenesisLandscapePixelEngine implements PosterEngine {
  readonly era = 'genesis-landscape';

  generateSvg(spec: PosterDesignSpec): string {
    const { width, height } = spec.dimensions;
    const rng = SceneBuilder.createRng(spec.seed || 1992);

    // Renderizamos a resolución nativa 320x240 con viewBox, escalado nítido a width x height
    const vW = 320;
    const vH = 240;

    const title = spec.title || 'AETHERIA';
    const subtitle = spec.subtitle || 'THE CELESTIAL REALM';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${vW} ${vH}"
     width="${width}"
     height="${height}"
     shape-rendering="crispEdges">
  <defs>
    <!-- Filtros de sombra y texturizado para píxeles -->
    <filter id="pixel-shadow">
      <feDropShadow dx="1" dy="2" stdDeviation="0" flood-color="#000000" flood-opacity="0.9"/>
    </filter>

    <!-- Gradientes de rampa 16-bit Mega Drive -->
    <linearGradient id="sky-16bit" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#102850"/>
      <stop offset="35%" stop-color="#285890"/>
      <stop offset="70%" stop-color="#4888C0"/>
      <stop offset="100%" stop-color="#80B0D8"/>
    </linearGradient>

    <linearGradient id="title-gold-16bit" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="15%" stop-color="#FFF0A0"/>
      <stop offset="45%" stop-color="#E8B030"/>
      <stop offset="75%" stop-color="#A86018"/>
      <stop offset="100%" stop-color="#582808"/>
    </linearGradient>
  </defs>

  <!-- ============================================================== -->
  <!-- 1. CIELO Y MAR DE NUBES DE FONDO                               -->
  <!-- ============================================================== -->
  <rect width="${vW}" height="${vH}" fill="url(#sky-16bit)" />

  <!-- Nubes en el horizonte (mar de nubes infinito) -->
  <g id="cloud-sea-background">
    <!-- Capa lejana de nubes -->
    <rect x="0" y="110" width="${vW}" height="130" fill="#7898B8" opacity="0.35"/>
    <ellipse cx="60" cy="115" rx="55" ry="14" fill="#C0D8E8" />
    <ellipse cx="160" cy="118" rx="75" ry="16" fill="#C0D8E8" />
    <ellipse cx="260" cy="114" rx="60" ry="13" fill="#C0D8E8" />
    
    <!-- Crestas de nubes blancas en el horizonte -->
    <ellipse cx="30" cy="112" rx="35" ry="10" fill="#FFFFFF" />
    <ellipse cx="90" cy="114" rx="40" ry="11" fill="#FFFFFF" />
    <ellipse cx="140" cy="116" rx="35" ry="9" fill="#FFFFFF" />
    <ellipse cx="210" cy="113" rx="45" ry="12" fill="#FFFFFF" />
    <ellipse cx="280" cy="111" rx="40" ry="10" fill="#FFFFFF" />
  </g>

  <!-- ============================================================== -->
  <!-- 2. CORDILLERA DE MONTAÑAS LEJANAS (Fondo norte)                -->
  <!-- ============================================================== -->
  <g id="distant-mountains">
    <!-- Pico Montañoso Oeste -->
    <polygon points="50,110 95,65 140,110" fill="#784820" />
    <polygon points="95,65 105,75 90,85 95,65" fill="#FFFFFF" />
    <polygon points="95,65 65,110 95,110" fill="#B87838" />

    <!-- Gran Pico Central Nevado (Detrás del Palacio) -->
    <polygon points="110,110 160,50 210,110" fill="#583010" />
    <polygon points="160,50 168,68 152,78 160,50" fill="#FFFFFF" />
    <polygon points="160,50 120,110 160,110" fill="#C08040" />
    <polygon points="135,80 150,65 160,82 145,95" fill="#E8D0B0" />

    <!-- Pico Montañoso Este -->
    <polygon points="180,110 225,60 270,110" fill="#683818" />
    <polygon points="225,60 235,72 220,80 225,60" fill="#FFFFFF" />
    <polygon points="225,60 195,110 225,110" fill="#B07030" />
  </g>

  <!-- ============================================================== -->
  <!-- 3. LA ISLA FLOTANTE CELESTIAL (Meseta elíptica y Acantilados)  -->
  <!-- ============================================================== -->
  <g id="floating-island">
    <!-- 3A. Extrusión vertical de Acantilados y Roca Estratificada -->
    <!-- Capa de sombra profunda del acantilado -->
    <path d="M 25 135 
             Q 160 175 295 135
             L 290 178
             Q 250 215 160 222
             Q 70 215 30 178 Z"
          fill="#301808" />

    <!-- Estratos de roca y facetas iluminadas (Tonos ocres y marrones dorados) -->
    <path d="M 30 140 L 45 185 L 60 195 L 75 160 L 55 142 Z" fill="#905820" />
    <path d="M 35 142 L 48 182 L 42 186 L 30 144 Z" fill="#D09040" />

    <!-- Bloque rocoso central izquierdo -->
    <path d="M 70 150 L 95 205 L 125 212 L 140 165 L 85 152 Z" fill="#784818" />
    <path d="M 80 152 L 92 202 L 105 180 L 98 153 Z" fill="#B87830" />
    <path d="M 82 153 L 88 190 L 85 154 Z" fill="#E0A048" />

    <!-- Bloque rocoso central derecho (Debajo de la cascada) -->
    <path d="M 175 165 L 190 220 L 225 210 L 240 155 L 185 156 Z" fill="#683810" />
    <path d="M 200 160 L 215 214 L 228 190 L 220 158 Z" fill="#A86828" />

    <!-- Bloque este del acantilado -->
    <path d="M 235 150 L 260 198 L 285 175 L 290 140 L 250 148 Z" fill="#885020" />
    <path d="M 255 152 L 272 190 L 280 165 L 270 146 Z" fill="#C88838" />

    <!-- Base inferior rocosa en punta flotante -->
    <polygon points="140,212 160,226 180,212 160,205" fill="#402008" />
    <polygon points="152,210 160,224 165,210" fill="#986028" />

    <!-- 3B. CASCADAS GIGANTES (Plunging Waterfalls) -->
    <!-- Cascada Principal Izquierda (Cae al vacío de las nubes) -->
    <g id="main-waterfall">
      <!-- Manto de agua cayendo -->
      <path d="M 98 152 L 94 218 L 132 216 L 128 154 Z" fill="#3878B8" />
      <path d="M 104 152 L 102 217 L 124 216 L 122 154 Z" fill="#68B0F0" />
      <!-- Líneas de corriente rápida y espuma blanca -->
      <line x1="108" y1="153" x2="106" y2="216" stroke="#FFFFFF" stroke-width="2.5" />
      <line x1="116" y1="153" x2="114" y2="216" stroke="#FFFFFF" stroke-width="3" />
      <line x1="122" y1="153" x2="120" y2="216" stroke="#E0F0FF" stroke-width="1.5" />
      <!-- Espuma tumultuosa en el labio superior de la cascada -->
      <ellipse cx="114" cy="153" rx="16" ry="3.5" fill="#FFFFFF" />
      <ellipse cx="114" cy="154" rx="14" ry="2" fill="#A0D8F8" />
      <!-- Nube de rocío y vapor en la base de la cascada -->
      <ellipse cx="112" cy="218" rx="24" ry="9" fill="#FFFFFF" opacity="0.9" />
      <ellipse cx="112" cy="221" rx="30" ry="7" fill="#C8E0F8" opacity="0.7" />
    </g>

    <!-- Cascada Secundaria Derecha -->
    <g id="secondary-waterfall">
      <path d="M 230 148 L 228 195 L 244 194 L 242 149 Z" fill="#4080C0" />
      <line x1="234" y1="149" x2="233" y2="194" stroke="#FFFFFF" stroke-width="2" />
      <line x1="239" y1="149" x2="238" y2="194" stroke="#FFFFFF" stroke-width="1.5" />
      <ellipse cx="236" cy="149" rx="8" ry="2" fill="#FFFFFF" />
      <ellipse cx="235" cy="195" rx="14" ry="5" fill="#FFFFFF" opacity="0.85" />
    </g>

    <!-- 3C. LA MESETA VERDE SUPERIOR (Superficie de la isla) -->
    <!-- Terreno base de pastizales elípticos -->
    <ellipse cx="160" cy="132" rx="135" ry="24" fill="#205818" />
    <ellipse cx="160" cy="131" rx="133" ry="22" fill="#388820" />
    <ellipse cx="160" cy="130" rx="128" ry="19" fill="#50A828" />

    <!-- Colinas y ondulaciones elevadas en la meseta -->
    <ellipse cx="100" cy="126" rx="45" ry="12" fill="#68C030" />
    <ellipse cx="210" cy="125" rx="55" ry="13" fill="#68C030" />
    <ellipse cx="160" cy="124" rx="35" ry="10" fill="#78D038" />

    <!-- 3D. RED FLUVIAL: RÍO Y LAGOS MEANDRIFORMES -->
    <g id="river-system">
      <!-- Lago oriental en las colinas -->
      <ellipse cx="245" cy="124" rx="22" ry="7" fill="#205898" />
      <ellipse cx="245" cy="123" rx="19" ry="5.5" fill="#4898E0" />
      <ellipse cx="244" cy="122" rx="14" ry="3" fill="#90D0F8" />
      <!-- Islote central en el lago -->
      <ellipse cx="245" cy="123" rx="4" ry="2" fill="#408820" />

      <!-- Meandro del río serpenteando hacia el centro y la cascada -->
      <path d="M 230 124 
               Q 200 128 185 133
               Q 160 138 140 138
               Q 120 138 114 153"
            stroke="#2868A8" stroke-width="7" fill="none" />
      <path d="M 230 124 
               Q 200 128 185 133
               Q 160 138 140 138
               Q 120 138 114 153"
            stroke="#58A8F0" stroke-width="4.5" fill="none" />
      <path d="M 230 124 
               Q 200 128 185 133
               Q 160 138 140 138
               Q 120 138 114 153"
            stroke="#FFFFFF" stroke-width="1.8" fill="none" />

      <!-- Caminos rurales de tierra/arena que bordean el río -->
      <path d="M 80 136 Q 110 133 135 132 Q 170 128 195 125"
            stroke="#C89848" stroke-width="1.5" fill="none" stroke-dasharray="3,1" />
    </g>

    <!-- 3E. BOSQUES Y CLÚSTERES DE ÁRBOLES (Estilo Twinkle Tale) -->
    <g id="forest-clusters">
      <!-- Bosque Oeste (Gran masa forestal) -->
      <!-- Árbol 1 -->
      <ellipse cx="55" cy="130" rx="12" ry="7" fill="#184010" />
      <ellipse cx="54" cy="128" rx="10" ry="6" fill="#307818" />
      <ellipse cx="53" cy="127" rx="7" ry="4" fill="#60B028" />
      <!-- Árbol 2 -->
      <ellipse cx="72" cy="132" rx="14" ry="8" fill="#184010" />
      <ellipse cx="71" cy="130" rx="12" ry="7" fill="#307818" />
      <ellipse cx="70" cy="129" rx="8" ry="4.5" fill="#60B028" />
      <!-- Árbol 3 -->
      <ellipse cx="88" cy="135" rx="11" ry="6.5" fill="#184010" />
      <ellipse cx="87" cy="133" rx="9" ry="5" fill="#307818" />
      <ellipse cx="86" cy="132" rx="6" ry="3.5" fill="#60B028" />

      <!-- Bosque Ribereño Central -->
      <ellipse cx="145" cy="136" rx="9" ry="5" fill="#184010" />
      <ellipse cx="144" cy="134" rx="7" ry="4" fill="#307818" />
      <ellipse cx="143" cy="133" rx="5" ry="2.5" fill="#60B028" />

      <ellipse cx="170" cy="137" rx="12" ry="6.5" fill="#184010" />
      <ellipse cx="169" cy="135" rx="10" ry="5.5" fill="#307818" />
      <ellipse cx="168" cy="134" rx="7" ry="3.5" fill="#60B028" />

      <!-- Bosque Este (Alrededor del lago) -->
      <ellipse cx="270" cy="127" rx="14" ry="7.5" fill="#184010" />
      <ellipse cx="269" cy="125" rx="12" ry="6" fill="#307818" />
      <ellipse cx="268" cy="124" rx="8" ry="4" fill="#60B028" />

      <ellipse cx="282" cy="130" rx="10" ry="5.5" fill="#184010" />
      <ellipse cx="281" cy="128" rx="8" ry="4.5" fill="#307818" />
      <ellipse cx="280" cy="127" rx="5" ry="3" fill="#60B028" />
    </g>

    <!-- 3F. LANDMARKS DE FANTASÍA (Castillo de Cristal y Caverna) -->
    <!-- Cueva misteriosa de roca oscura (como en Twinkle Tale) -->
    <g id="cavern" transform="translate(195, 118)">
      <ellipse cx="0" cy="0" rx="8" ry="6" fill="#583010" />
      <ellipse cx="0" cy="1" rx="5.5" ry="4" fill="#100800" />
      <ellipse cx="0" cy="2" rx="3" ry="2" fill="#000000" />
      <path d="M -5 -2 Q 0 -6 5 -2" stroke="#885828" stroke-width="1.5" fill="none" />
    </g>

    <!-- EL GRAN PALACIO DE CRISTAL / SANTUARIO CELESTIAL -->
    <g id="crystal-palace" transform="translate(160, 112)">
      <!-- Sombra base del santuario -->
      <ellipse cx="0" cy="8" rx="18" ry="5" fill="#102840" opacity="0.6"/>

      <!-- Contrafuertes de cristal de hielo inferiores -->
      <polygon points="-16,7 -12,-4 -8,7" fill="#4090D0" />
      <polygon points="-12,-4 -8,7 -4,7" fill="#90D8F8" />
      <polygon points="16,7 12,-4 8,7" fill="#4090D0" />
      <polygon points="12,-4 8,7 4,7" fill="#90D8F8" />

      <!-- Cuerpo central del palacio de cristal -->
      <polygon points="-10,6 -8,-16 0,-24 8,-16 10,6" fill="#68B8E8" />
      <polygon points="0,-24 -8,-16 0,6" fill="#A8E8FF" />
      <polygon points="0,-24 8,-16 0,6" fill="#4088C8" />

      <!-- Gran Aguja Cilíndrica Celestial (Spire) -->
      <polygon points="-4,-20 0,-42 4,-20" fill="#E8F8FF" />
      <polygon points="0,-42 -4,-20 0,-18" fill="#FFFFFF" />
      <polygon points="0,-42 4,-20 0,-18" fill="#78C8F8" />

      <!-- Orbe mágico resplandeciente en la cúspide -->
      <circle cx="0" cy="-44" r="3" fill="#FFFFFF" />
      <circle cx="0" cy="-44" r="1.5" fill="#A0F0FF" />

      <!-- Agujas secundarias laterales -->
      <polygon points="-12,-4 -10,-24 -8,-4" fill="#E0F4FF" />
      <polygon points="12,-4 10,-24 8,-4" fill="#90D0F0" />
    </g>

    <!-- Fortaleza ribereña en el lago -->
    <g id="lake-citadel" transform="translate(245, 120)">
      <rect x="-3" y="-5" width="6" height="5" fill="#C0C8D0" />
      <polygon points="-4,-5 0,-10 4,-5" fill="#C02828" />
      <rect x="-1" y="-2" width="2" height="2" fill="#101828" />
    </g>
  </g>

  <!-- ============================================================== -->
  <!-- 4. BANCO DE NUBES EN PRIMER PLANO (Foreground Fluffy Clouds)   -->
  <!-- ============================================================== -->
  <g id="foreground-clouds">
    <!-- Nubes flotando frente al borde inferior de la isla -->
    <ellipse cx="20" cy="180" rx="30" ry="12" fill="#FFFFFF" opacity="0.95" />
    <ellipse cx="20" cy="184" rx="26" ry="9" fill="#B0D0E8" />
    
    <ellipse cx="280" cy="182" rx="36" ry="14" fill="#FFFFFF" opacity="0.95" />
    <ellipse cx="280" cy="186" rx="32" ry="10" fill="#B0D0E8" />

    <ellipse cx="305" cy="190" rx="25" ry="11" fill="#FFFFFF" />
    <ellipse cx="14" cy="192" rx="22" ry="9" fill="#FFFFFF" />
  </g>

  <!-- ============================================================== -->
  <!-- 5. TIPOGRAFÍA Y UI 16-BIT DE ÉPOCA (Pantalla de Título)        -->
  <!-- ============================================================== -->
  <g id="title-screen-ui">
    <!-- Logotipo de Título Principal (Ornato de Fantasía 16-Bit) -->
    <g id="title-logo" transform="translate(160, 44)">
      <!-- Sombra de píxel negra sólida desplazada -->
      <text x="2" y="3" font-family="'Georgia', 'Times New Roman', serif" font-size="34" font-style="italic" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="3">${title.toUpperCase()}</text>
      <text x="1" y="2" font-family="'Georgia', 'Times New Roman', serif" font-size="34" font-style="italic" font-weight="900"
            fill="#381808" text-anchor="middle" letter-spacing="3">${title.toUpperCase()}</text>

      <!-- Reborde y trazo exterior dorado -->
      <text x="0" y="0" font-family="'Georgia', 'Times New Roman', serif" font-size="34" font-style="italic" font-weight="900"
            fill="url(#title-gold-16bit)" stroke="#000000" stroke-width="2.5" text-anchor="middle" letter-spacing="3">${title.toUpperCase()}</text>

      <!-- Relleno dorado escalonado 16-bit -->
      <text x="0" y="0" font-family="'Georgia', 'Times New Roman', serif" font-size="34" font-style="italic" font-weight="900"
            fill="url(#title-gold-16bit)" text-anchor="middle" letter-spacing="3">${title.toUpperCase()}</text>

      <!-- Subtítulo en cinta de pergamino / cian -->
      <g transform="translate(0, 14)">
        <text x="1" y="1" font-family="'Arial Black', sans-serif" font-size="7" font-weight="bold"
              fill="#000000" text-anchor="middle" letter-spacing="3">${subtitle.toUpperCase()}</text>
        <text x="0" y="0" font-family="'Arial Black', sans-serif" font-size="7" font-weight="bold"
              fill="#FFFFFF" text-anchor="middle" letter-spacing="3">${subtitle.toUpperCase()}</text>
      </g>
    </g>

    <!-- Mítico Texto Arcade "PUSH START BUTTON" -->
    <g id="push-start" transform="translate(160, 160)">
      <!-- Sombra de píxel -->
      <text x="1" y="1" font-family="'Courier New', monospace" font-size="9" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="2">PUSH START BUTTON</text>
      <text x="0" y="0" font-family="'Courier New', monospace" font-size="9" font-weight="900"
            fill="#FFFFFF" text-anchor="middle" letter-spacing="2">PUSH START BUTTON</text>
    </g>

    <!-- Créditos de Copyright y Consola (Bottom Bar) -->
    <g id="copyright-bar" transform="translate(160, 234)">
      <text x="1" y="1" font-family="'Courier New', monospace" font-size="6" font-weight="bold"
            fill="#000000" text-anchor="middle" letter-spacing="1">COPYRIGHT 1992 TOYO / SEGA 16-BIT GRAPHICS</text>
      <text x="0" y="0" font-family="'Courier New', monospace" font-size="6" font-weight="bold"
            fill="#E8F0F8" text-anchor="middle" letter-spacing="1">COPYRIGHT 1992 TOYO / SEGA 16-BIT GRAPHICS</text>
    </g>
  </g>
</svg>`;
  }
}
