const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Generador especializado de Retrato de Alta Fidelidad para Angelina Jolie
 * Calibración antropométrica:
 * - Pómulos altos prominentes y mandíbula angular definida.
 * - Labios voluminosos con arco de Cupido pronunciado.
 * - Ojos felinos almendrados color verde-avellana con delineado oscuro.
 * - Cejas arqueadas y elevadas.
 * - Cabello castaño oscuro espresso con reflejos caoba y volumen cinematográfico.
 * - Iluminación de estudio estilo Rembrandt / Chiaroscuro con rim light dorado.
 */
async function generateAngelinaPortrait() {
  console.log('=== Generando Retrato de Alta Fidelidad en JarBees: Angelina Jolie ===');

  const width = 2048;
  const height = 2048;
  const cx = width / 2;
  const cy = height * 0.46;

  // Calibraciones antropométricas de Angelina Jolie
  const headW = width * 0.43;
  const headH = headW * 1.36; // Proporción facial equilibrada
  const eyeY = cy - headH * 0.015;
  const eyeDist = headW * 0.225; // Separación interpupilar
  const eyeW = headW * 0.13;    // Ojos rasgados almendrados
  const eyeH = headW * 0.052;
  const noseY = cy + headH * 0.165;
  const noseW = headW * 0.092;  // Nariz fina y puente recto
  const mouthY = cy + headH * 0.335;
  const mouthW = headW * 0.235; // Labios voluptuosos icónicos
  const chinY = cy + headH * 0.51;
  const jawW = headW * 0.72;    // Mandíbula angular elegante

  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Fondo Atmosférico Cinematográfico -->
    <radialGradient id="bgStudioGrad" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#2a1824" />
      <stop offset="50%" stop-color="#140b12" />
      <stop offset="100%" stop-color="#060305" />
    </radialGradient>

    <!-- Halo de Retrato -->
    <radialGradient id="haloGrad" cx="50%" cy="42%" r="45%">
      <stop offset="0%" stop-color="#ffccaa" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- Piel Base con Modelado Volumétrico (Key Light a 45°) -->
    <linearGradient id="skinModelGrad" x1="25%" y1="20%" x2="85%" y2="80%">
      <stop offset="0%" stop-color="#fff0e6" />
      <stop offset="35%" stop-color="#edd0be" />
      <stop offset="70%" stop-color="#d4aa94" />
      <stop offset="100%" stop-color="#8a5e4a" />
    </linearGradient>

    <!-- Pómulo Zygomático Derecho con Sombra Rembrandt -->
    <linearGradient id="cheekShadowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#96614b" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#6e402e" stop-opacity="0" />
    </linearGradient>

    <!-- Iris Verde / Avellana Radiante -->
    <radialGradient id="irisHazelGrad" cx="42%" cy="38%" r="60%">
      <stop offset="0%" stop-color="#a4c974" />
      <stop offset="45%" stop-color="#558348" />
      <stop offset="85%" stop-color="#2a4522" />
      <stop offset="100%" stop-color="#121e10" />
    </radialGradient>

    <!-- Labios Voluminosos con Brillo Especular -->
    <linearGradient id="lipGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b85252" />
      <stop offset="50%" stop-color="#cf6565" />
      <stop offset="100%" stop-color="#8c3232" />
    </linearGradient>

    <!-- Cabello Castaño Oscuro Sedoso con Reflejos -->
    <linearGradient id="hairSheenGrad" x1="0%" y1="0%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#1b110e" />
      <stop offset="40%" stop-color="#4d2e24" />
      <stop offset="60%" stop-color="#2a1813" />
      <stop offset="100%" stop-color="#100a08" />
    </linearGradient>

    <filter id="beautyGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="softSkinBlur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.5" />
    </filter>
  </defs>

  <!-- 1. Fondo de Estudio -->
  <rect width="${width}" height="${height}" fill="url(#bgStudioGrad)" />
  <circle cx="${cx}" cy="${cy}" r="${headW * 1.5}" fill="url(#haloGrad)" />

  <!-- 2. Cabello Posterior (Masa de volumen detrás de hombros) -->
  <g id="hair-back">
    <path d="M ${cx - headW * 0.72} ${height} 
             C ${cx - headW * 0.85} ${cy + headH * 0.2} ${cx - headW * 0.78} ${cy - headH * 0.45} ${cx} ${cy - headH * 0.62} 
             C ${cx + headW * 0.78} ${cy - headH * 0.45} ${cx + headW * 0.85} ${cy + headH * 0.2} ${cx + headW * 0.72} ${height} Z" 
          fill="#100a08" />
    <!-- Mechones oscuros de profundidad -->
    <path d="M ${cx - headW * 0.65} ${height} Q ${cx - headW * 0.75} ${cy + headH * 0.1} ${cx - headW * 0.55} ${cy - headH * 0.3}" 
          stroke="#080504" stroke-width="24" fill="none" opacity="0.8" />
    <path d="M ${cx + headW * 0.65} ${height} Q ${cx + headW * 0.75} ${cy + headH * 0.1} ${cx + headW * 0.55} ${cy - headH * 0.3}" 
          stroke="#080504" stroke-width="24" fill="none" opacity="0.8" />
  </g>

  <!-- 3. Cuello Estilizado y Clavículas -->
  <g id="neck-torso">
    <path d="M ${cx - headW * 0.32} ${mouthY + 40} 
             C ${cx - headW * 0.36} ${height * 0.75} ${cx - width * 0.38} ${height * 0.95} ${cx - width * 0.45} ${height} 
             L ${cx + width * 0.45} ${height} 
             C ${cx + width * 0.38} ${height * 0.95} ${cx + headW * 0.36} ${height * 0.75} ${cx + headW * 0.32} ${mouthY + 40} Z" 
          fill="#c99e89" />
    <!-- Sombra de barbilla sobre cuello -->
    <path d="M ${cx - headW * 0.3} ${mouthY + 45} 
             Q ${cx} ${chinY + headH * 0.16} ${cx + headW * 0.3} ${mouthY + 45} 
             Q ${cx} ${chinY + headH * 0.24} ${cx - headW * 0.3} ${mouthY + 45} Z" 
          fill="#4a2b1f" opacity="0.45" />
    <!-- Clavículas anatómicas elegantes -->
    <path d="M ${cx - width * 0.28} ${height * 0.89} Q ${cx - width * 0.12} ${height * 0.91} ${cx - 20} ${height * 0.86}" 
          stroke="#ffd8c2" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="0.4" />
    <path d="M ${cx + 20} ${height * 0.86} Q ${cx + width * 0.12} ${height * 0.91} ${cx + width * 0.28} ${height * 0.89}" 
          stroke="#ffd8c2" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="0.3" />
  </g>

  <!-- 4. Contorno Facial Esculpido (Pómulos altos y mandíbula angular) -->
  <g id="face-sculpt">
    <!-- Base craneal -->
    <path d="M ${cx} ${cy - headH * 0.52} 
             C ${cx + headW * 0.54} ${cy - headH * 0.52} ${cx + headW * 0.53} ${eyeY - headH * 0.15} ${cx + headW * 0.50} ${eyeY} 
             C ${cx + headW * 0.49} ${eyeY + headH * 0.12} ${cx + jawW * 0.56} ${mouthY} ${cx + jawW * 0.36} ${chinY} 
             Q ${cx} ${chinY + 12} ${cx - jawW * 0.36} ${chinY} 
             C ${cx - jawW * 0.56} ${mouthY} ${cx - headW * 0.49} ${eyeY + headH * 0.12} ${cx - headW * 0.50} ${eyeY} 
             C ${cx - headW * 0.53} ${eyeY - headH * 0.15} ${cx - headW * 0.54} ${cy - headH * 0.52} ${cx} ${cy - headH * 0.52} Z" 
          fill="url(#skinModelGrad)" filter="url(#softSkinBlur)" />

    <!-- Pómulo Izquierdo Alto (Key Light Highlight) -->
    <path d="M ${cx - headW * 0.46} ${eyeY + 20} 
             Q ${cx - headW * 0.25} ${eyeY + 35} ${cx - headW * 0.18} ${noseY - 10} 
             Q ${cx - headW * 0.32} ${noseY + 25} ${cx - headW * 0.42} ${eyeY + 45} Z" 
          fill="#fff3eb" opacity="0.4" filter="url(#beautyGlow)" />

    <!-- Pómulo Derecho Alto (Sombra de modelado escultórico) -->
    <path d="M ${cx + headW * 0.18} ${noseY - 10} 
             Q ${cx + headW * 0.32} ${eyeY + 30} ${cx + headW * 0.47} ${eyeY + 15} 
             Q ${cx + headW * 0.44} ${noseY + 45} ${cx + headW * 0.24} ${noseY + 30} Z" 
          fill="url(#cheekShadowGrad)" />

    <!-- Sub-surface Scattering cálido en transición de mandíbula -->
    <path d="M ${cx + jawW * 0.36} ${chinY} Q ${cx + jawW * 0.54} ${mouthY} ${cx + headW * 0.48} ${eyeY + headH * 0.12}" 
          stroke="#d95d43" stroke-width="6" fill="none" opacity="0.35" filter="url(#beautyGlow)" />
  </g>

  <!-- 5. Ojos Felinos Rasgados de Angelina Jolie -->
  <g id="eyes-angelina">
    <!-- Ojo Izquierdo -->
    <g id="eye-left">
      <!-- Sombra de cuenca superior -->
      <ellipse cx="${cx - eyeDist}" cy="${eyeY}" rx="${eyeW * 1.15}" ry="${eyeH * 1.5}" fill="#6b3f2e" opacity="0.3" />
      <!-- Esclerótica -->
      <path d="M ${cx - eyeDist - eyeW} ${eyeY + 2} 
               Q ${cx - eyeDist} ${eyeY - eyeH * 1.05} ${cx - eyeDist + eyeW} ${eyeY - 3} 
               Q ${cx - eyeDist} ${eyeY + eyeH * 0.85} ${cx - eyeDist - eyeW} ${eyeY + 2} Z" 
            fill="#f7f4f0" />
      <!-- Iris Avellana/Esmeralda -->
      <circle cx="${cx - eyeDist + 2}" cy="${eyeY - 1}" r="${eyeH * 0.92}" fill="url(#irisHazelGrad)" />
      <!-- Pupila profunda -->
      <circle cx="${cx - eyeDist + 2}" cy="${eyeY - 1}" r="${eyeH * 0.44}" fill="#08080a" />
      <!-- Brillo Especular Corneal Principal -->
      <circle cx="${cx - eyeDist - 2}" cy="${eyeY - 5}" r="${eyeH * 0.22}" fill="#ffffff" />
      <circle cx="${cx - eyeDist + 5}" cy="${eyeY + 2}" r="${eyeH * 0.10}" fill="#ffffff" opacity="0.75" />
      <!-- Delineado Feline Eyeliner / Cat-eye grueso con colita rasgada -->
      <path d="M ${cx - eyeDist - eyeW * 1.05} ${eyeY + 3} 
               Q ${cx - eyeDist} ${eyeY - eyeH * 1.3} ${cx - eyeDist + eyeW * 1.18} ${eyeY - 8} 
               Q ${cx - eyeDist} ${eyeY - eyeH * 0.95} ${cx - eyeDist - eyeW * 1.05} ${eyeY + 3} Z" 
            fill="#120c0e" />
      <!-- Pestañas dramáticas -->
      <path d="M ${cx - eyeDist + eyeW * 0.8} ${eyeY - 5} L ${cx - eyeDist + eyeW * 1.15} ${eyeY - 12}" stroke="#120c0e" stroke-width="2.5" stroke-linecap="round" />
      <!-- Pliegue de párpado superior -->
      <path d="M ${cx - eyeDist - eyeW * 0.85} ${eyeY - eyeH * 1.15} Q ${cx - eyeDist} ${eyeY - eyeH * 1.65} ${cx - eyeDist + eyeW * 0.85} ${eyeY - eyeH * 1.1}" 
            stroke="#784b39" stroke-width="2.5" fill="none" opacity="0.65" />
    </g>

    <!-- Ojo Derecho -->
    <g id="eye-right">
      <!-- Sombra de cuenca superior -->
      <ellipse cx="${cx + eyeDist}" cy="${eyeY}" rx="${eyeW * 1.15}" ry="${eyeH * 1.5}" fill="#6b3f2e" opacity="0.3" />
      <!-- Esclerótica -->
      <path d="M ${cx + eyeDist - eyeW} ${eyeY - 3} 
               Q ${cx + eyeDist} ${eyeY - eyeH * 1.05} ${cx + eyeDist + eyeW} ${eyeY + 2} 
               Q ${cx + eyeDist} ${eyeY + eyeH * 0.85} ${cx + eyeDist - eyeW} ${eyeY - 3} Z" 
            fill="#f7f4f0" />
      <!-- Iris Avellana/Esmeralda -->
      <circle cx="${cx + eyeDist - 2}" cy="${eyeY - 1}" r="${eyeH * 0.92}" fill="url(#irisHazelGrad)" />
      <!-- Pupila profunda -->
      <circle cx="${cx + eyeDist - 2}" cy="${eyeY - 1}" r="${eyeH * 0.44}" fill="#08080a" />
      <!-- Brillo Especular Corneal Principal -->
      <circle cx="${cx + eyeDist - 6}" cy="${eyeY - 5}" r="${eyeH * 0.22}" fill="#ffffff" />
      <circle cx="${cx + eyeDist + 2}" cy="${eyeY + 2}" r="${eyeH * 0.10}" fill="#ffffff" opacity="0.75" />
      <!-- Delineado Feline Eyeliner / Cat-eye con colita rasgada -->
      <path d="M ${cx + eyeDist - eyeW * 1.18} ${eyeY - 8} 
               Q ${cx + eyeDist} ${eyeY - eyeH * 1.3} ${cx + eyeDist + eyeW * 1.05} ${eyeY + 3} 
               Q ${cx + eyeDist} ${eyeY - eyeH * 0.95} ${cx + eyeDist - eyeW * 1.18} ${eyeY - 8} Z" 
            fill="#120c0e" />
      <!-- Pestañas dramáticas -->
      <path d="M ${cx + eyeDist - eyeW * 0.8} ${eyeY - 5} L ${cx + eyeDist - eyeW * 1.15} ${eyeY - 12}" stroke="#120c0e" stroke-width="2.5" stroke-linecap="round" />
      <!-- Pliegue de párpado superior -->
      <path d="M ${cx + eyeDist - eyeW * 0.85} ${eyeY - eyeH * 1.1} Q ${cx + eyeDist} ${eyeY - eyeH * 1.65} ${cx + eyeDist + eyeW * 0.85} ${eyeY - eyeH * 1.15}" 
            stroke="#784b39" stroke-width="2.5" fill="none" opacity="0.65" />
    </g>
  </g>

  <!-- 6. Cejas Arqueadas Icónicas -->
  <g id="eyebrows-angelina">
    <!-- Ceja Izquierda Arqueada -->
    <path d="M ${cx - eyeDist - eyeW * 1.05} ${eyeY - eyeH * 1.25} 
             Q ${cx - eyeDist - eyeW * 0.2} ${eyeY - eyeH * 2.3} ${cx - eyeDist + eyeW * 0.75} ${eyeY - eyeH * 2.1} 
             Q ${cx - eyeDist + eyeW * 1.15} ${eyeY - eyeH * 1.6} ${cx - eyeDist + eyeW * 1.18} ${eyeY - eyeH * 1.45} 
             Q ${cx - eyeDist + eyeW * 0.65} ${eyeY - eyeH * 1.75} ${cx - eyeDist - eyeW * 1.05} ${eyeY - eyeH * 1.25} Z" 
          fill="#2e1a14" />

    <!-- Ceja Derecha Arqueada -->
    <path d="M ${cx + eyeDist + eyeW * 1.05} ${eyeY - eyeH * 1.25} 
             Q ${cx + eyeDist + eyeW * 0.2} ${eyeY - eyeH * 2.3} ${cx + eyeDist - eyeW * 0.75} ${eyeY - eyeH * 2.1} 
             Q ${cx + eyeDist - eyeW * 1.15} ${eyeY - eyeH * 1.6} ${cx + eyeDist - eyeW * 1.18} ${eyeY - eyeH * 1.45} 
             Q ${cx + eyeDist - eyeW * 0.65} ${eyeY - eyeH * 1.75} ${cx + eyeDist + eyeW * 1.05} ${eyeY - eyeH * 1.25} Z" 
          fill="#2e1a14" />
  </g>

  <!-- 7. Nariz Esculpida y Fina -->
  <g id="nose-angelina">
    <!-- Sombra del puente nasal (perfil derecho) -->
    <path d="M ${cx + 4} ${eyeY - 8} 
             L ${cx + noseW * 0.45} ${noseY - 18} 
             L ${cx + noseW * 0.85} ${noseY + 2} 
             Q ${cx} ${noseY + 12} ${cx - noseW * 0.85} ${noseY + 2} 
             L ${cx - 6} ${eyeY - 8} Z" 
          fill="#874e38" opacity="0.35" />
    <!-- Luz en el dorso de la nariz -->
    <path d="M ${cx - 2} ${eyeY} L ${cx - 2} ${noseY - 8}" stroke="#fff6f0" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="0.55" filter="url(#beautyGlow)" />
    <!-- Punta de nariz delicada -->
    <ellipse cx="${cx}" cy="${noseY - 2}" rx="${noseW * 0.38}" ry="${noseW * 0.28}" fill="#fce4d4" />
    <circle cx="${cx - 2}" cy="${noseY - 4}" r="${noseW * 0.12}" fill="#ffffff" opacity="0.8" />
    <!-- Fosas nasales suaves -->
    <ellipse cx="${cx - noseW * 0.52}" cy="${noseY + 2}" rx="${noseW * 0.24}" ry="${noseW * 0.14}" fill="#241113" opacity="0.75" />
    <ellipse cx="${cx + noseW * 0.52}" cy="${noseY + 2}" rx="${noseW * 0.24}" ry="${noseW * 0.14}" fill="#241113" opacity="0.75" />
  </g>

  <!-- 8. Labios Famosos de Angelina Jolie (Extremadamente Voluminosos con Hendidura Inferior) -->
  <g id="lips-angelina">
    <!-- Filtrum pronunciado -->
    <path d="M ${cx - 7} ${noseY + 10} L ${cx - 5} ${mouthY - 14}" stroke="#784232" stroke-width="2.5" fill="none" opacity="0.35" />
    <path d="M ${cx + 7} ${noseY + 10} L ${cx + 5} ${mouthY - 14}" stroke="#784232" stroke-width="2.5" fill="none" opacity="0.35" />

    <!-- Labio Superior con Arco de Cupido muy marcado -->
    <path d="M ${cx - mouthW} ${mouthY} 
             Q ${cx - mouthW * 0.38} ${mouthY - 18} ${cx} ${mouthY - 9} 
             Q ${cx + mouthW * 0.38} ${mouthY - 18} ${cx + mouthW} ${mouthY} 
             Q ${cx} ${mouthY + 6} ${cx - mouthW} ${mouthY} Z" 
          fill="url(#lipGrad)" />

    <!-- Comisura y hendidura labial sensual -->
    <path d="M ${cx - mouthW * 1.02} ${mouthY} 
             Q ${cx - mouthW * 0.35} ${mouthY + 3} ${cx} ${mouthY + 7} 
             Q ${cx + mouthW * 0.35} ${mouthY + 3} ${cx + mouthW * 1.02} ${mouthY}" 
          stroke="#380e14" stroke-width="4.5" stroke-linecap="round" fill="none" />

    <!-- Labio Inferior Voluminoso con sutil hendidura central (Cleft) -->
    <path d="M ${cx - mouthW * 0.94} ${mouthY + 1} 
             Q ${cx - mouthW * 0.45} ${mouthY + 36} ${cx} ${mouthY + 34} 
             Q ${cx + mouthW * 0.45} ${mouthY + 36} ${cx + mouthW * 0.94} ${mouthY + 1} 
             Q ${cx} ${mouthY + 8} ${cx - mouthW * 0.94} ${mouthY + 1} Z" 
          fill="url(#lipGrad)" />

    <!-- Brillos Especulares de Gloss en labio inferior -->
    <!-- Brillo lado izquierdo -->
    <ellipse cx="${cx - mouthW * 0.28}" cy="${mouthY + 18}" rx="${mouthW * 0.24}" ry="6" fill="#ffd4d4" opacity="0.65" filter="url(#beautyGlow)" />
    <!-- Brillo lado derecho -->
    <ellipse cx="${cx + mouthW * 0.28}" cy="${mouthY + 18}" rx="${mouthW * 0.24}" ry="6" fill="#ffd4d4" opacity="0.55" filter="url(#beautyGlow)" />
    <!-- Puntos de brillo húmedo ultra-realistas -->
    <circle cx="${cx - mouthW * 0.15}" cy="${mouthY + 16}" r="3" fill="#ffffff" opacity="0.9" />
    <circle cx="${cx + mouthW * 0.15}" cy="${mouthY + 16}" r="2.5" fill="#ffffff" opacity="0.8" />

    <!-- Sombra profunda bajo labio inferior en el mentón -->
    <path d="M ${cx - mouthW * 0.55} ${mouthY + 44} Q ${cx} ${mouthY + 52} ${cx + mouthW * 0.55} ${mouthY + 44}" 
          stroke="#422218" stroke-width="6" fill="none" opacity="0.5" />
    <!-- Volumen del mentón -->
    <ellipse cx="${cx}" cy="${chinY - 14}" rx="${headW * 0.16}" ry="9" fill="#fff1e8" opacity="0.3" filter="url(#beautyGlow)" />
  </g>

  <!-- 9. Cabello Caoba / Espresso Frontal y Mechones Voluminosos -->
  <g id="hair-front">
    <!-- Raya lateral y caída de mechón derecho -->
    <path d="M ${cx - headW * 0.25} ${cy - headH * 0.58} 
             C ${cx - headW * 0.55} ${cy - headH * 0.45} ${cx - headW * 0.65} ${cy - headH * 0.1} ${cx - headW * 0.62} ${cy + headH * 0.25} 
             Q ${cx - headW * 0.48} ${cy - headH * 0.15} ${cx - headW * 0.44} ${cy - headH * 0.32} 
             C ${cx - headW * 0.35} ${cy - headH * 0.46} ${cx - headW * 0.15} ${cy - headH * 0.52} ${cx - headW * 0.25} ${cy - headH * 0.58} Z" 
          fill="url(#hairSheenGrad)" />

    <!-- Mechón voluminoso lado derecho cayendo sobre hombro -->
    <path d="M ${cx - headW * 0.25} ${cy - headH * 0.58} 
             C ${cx + headW * 0.35} ${cy - headH * 0.62} ${cx + headW * 0.72} ${cy - headH * 0.35} ${cx + headW * 0.66} ${cy + headH * 0.35} 
             C ${cx + headW * 0.62} ${height * 0.75} ${cx + headW * 0.55} ${height * 0.9} ${cx + headW * 0.45} ${height} 
             L ${cx + headW * 0.32} ${height} 
             C ${cx + headW * 0.45} ${height * 0.85} ${cx + headW * 0.52} ${cy + headH * 0.4} ${cx + headW * 0.48} ${cy + headH * 0.1} 
             Q ${cx + headW * 0.44} ${cy - headH * 0.25} ${cx + headW * 0.32} ${cy - headH * 0.42} 
             C ${cx + headW * 0.15} ${cy - headH * 0.54} ${cx - headW * 0.1} ${cy - headH * 0.56} ${cx - headW * 0.25} ${cy - headH * 0.58} Z" 
          fill="url(#hairSheenGrad)" />

    <!-- Líneas de reflejo de brillo sedoso en cabello -->
    <path d="M ${cx - headW * 0.15} ${cy - headH * 0.53} Q ${cx + headW * 0.25} ${cy - headH * 0.55} ${cx + headW * 0.52} ${cy - headH * 0.32}" 
          stroke="#8c5845" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.65" filter="url(#beautyGlow)" />
    <path d="M ${cx + headW * 0.46} ${cy - headH * 0.25} Q ${cx + headW * 0.58} ${cy + headH * 0.15} ${cx + headW * 0.48} ${cy + headH * 0.45}" 
          stroke="#a36b54" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.55" filter="url(#beautyGlow)" />
    <path d="M ${cx + headW * 0.48} ${cy - headH * 0.22} Q ${cx + headW * 0.60} ${cy + headH * 0.18} ${cx + headW * 0.50} ${cy + headH * 0.48}" 
          stroke="#ffddcc" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.4" />
  </g>

  <!-- 10. Rim Light de Estudio Fotográfico (Contraluz Dorado en Silueta) -->
  <g id="rim-light-studio" filter="url(#beautyGlow)">
    <path d="M ${cx - headW * 0.48} ${cy + headH * 0.05} 
             C ${cx - headW * 0.50} ${eyeY} ${cx - headW * 0.53} ${cy - headH * 0.25} ${cx - headW * 0.46} ${cy - headH * 0.42}" 
          stroke="#ffd6a8" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.75" />
    <path d="M ${cx - jawW * 0.36} ${chinY} Q ${cx - jawW * 0.52} ${mouthY + 15} ${cx - headW * 0.46} ${cy + headH * 0.15}" 
          stroke="#ffd6a8" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.65" />
  </g>
</svg>
`.trim();

  // Guardar SVG en disco
  const outDir = path.join(process.cwd(), 'storage', 'posters');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const svgPath = path.join(outDir, 'angelina_jolie_realistic_portrait.svg');
  const pngPath = path.join(outDir, 'angelina_jolie_realistic_portrait.png');
  fs.writeFileSync(svgPath, svgContent, 'utf-8');

  // Renderizar a PNG usando Playwright + GPU RTX 5070
  console.log('Iniciando renderizado GPU con Playwright en resolución 2048x2048...');
  const t0 = Date.now();
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-gpu',
      '--use-gl=angle',
      '--use-angle=d3d11',
    ],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width, height });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; background: #000; overflow: hidden; }
    svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: pngPath, type: 'png' });
  await browser.close();

  const duration = Date.now() - t0;
  const stats = fs.statSync(pngPath);
  console.log(`✅ Renderizado completado con éxito en ${duration} ms!`);
  console.log(`Archivo PNG guardado: ${pngPath} (${Math.round(stats.size / 1024)} KB)`);

  // Copiar al directorio de artifacts de Gemini
  const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\\antigravity-ide\\brain\\bb2b02ab-1056-4da6-a344-b2bb0f45627f';
  const artifactPng = path.join(artifactDir, 'angelina_jolie_realistic_portrait.png');
  fs.copyFileSync(pngPath, artifactPng);
  console.log(`Copia para visualización guardada en: ${artifactPng}`);
}

generateAngelinaPortrait().catch(console.error);
