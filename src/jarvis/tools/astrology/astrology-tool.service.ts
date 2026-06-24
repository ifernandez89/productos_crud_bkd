import { Injectable, Logger } from '@nestjs/common';
import * as Astronomy from 'astronomy-engine';

/**
 * AstrologyTool — Cálculos astrológicos en tiempo real usando astronomy-engine.
 * 
 * ✅ VENTAJAS sobre scraping:
 * - Respuesta instantánea (<100ms vs 15-30s)
 * - Sin dependencias externas (0 API keys)
 * - Datos precisos basados en VSOP87
 * - Sin riesgo de bloqueo o timeout
 * 
 * Basado en: Archeoscope — Módulos astronómicos/astrológicos calculados
 */
@Injectable()
export class AstrologyTool {
  private readonly logger = new Logger(AstrologyTool.name);

  private readonly SIGNS = [
    'Aries', 'Tauro', 'Géminis', 'Cáncer', 'Leo', 'Virgo',
    'Libra', 'Escorpio', 'Sagitario', 'Capricornio', 'Acuario', 'Piscis',
  ];

  private readonly GLYPHS = [
    '♈', '♉', '♊', '♋', '♌', '♍',
    '♎', '♏', '♐', '♑', '♒', '♓',
  ];

  private readonly ELEMENTS = {
    Aries: 'Fuego', Tauro: 'Tierra', Géminis: 'Aire', Cáncer: 'Agua',
    Leo: 'Fuego', Virgo: 'Tierra', Libra: 'Aire', Escorpio: 'Agua',
    Sagitario: 'Fuego', Capricornio: 'Tierra', Acuario: 'Aire', Piscis: 'Agua',
  };

  private readonly PHASE_NAMES: Array<[number, string, string]> = [
    [11.25, 'Luna Nueva', '🌑'],
    [78.75, 'Creciente', '🌒'],
    [101.25, 'Cuarto Creciente', '🌓'],
    [168.75, 'Gibosa Creciente', '🌔'],
    [191.25, 'Luna Llena', '🌕'],
    [258.75, 'Gibosa Menguante', '🌖'],
    [281.25, 'Cuarto Menguante', '🌗'],
    [348.75, 'Menguante', '🌘'],
  ];

  private readonly QUARTER_NAMES = [
    'Luna Nueva',
    'Cuarto Creciente',
    'Luna Llena',
    'Cuarto Menguante',
  ];

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Obtiene el "clima astrológico" del día actual o una fecha específica.
   * Equivalente al módulo "HOY" de Archeoscope.
   */
  getTodaySkyData(date: Date = new Date()): string {
    const startTime = Date.now();

    try {
      const t = Astronomy.MakeTime(date);

      // ── LUNA ──────────────────────────────────────────────────────────────
      const moonLon = Astronomy.EclipticLongitude(Astronomy.Body.Moon, t);
      const phaseAngle = Astronomy.MoonPhase(t);
      const illumination = Math.round(((1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2) * 100);

      let phaseName = 'Luna Nueva';
      let phaseEmoji = '🌑';
      for (const [limit, name, emoji] of this.PHASE_NAMES) {
        if (phaseAngle < limit) {
          phaseName = name;
          phaseEmoji = emoji;
          break;
        }
      }

      const moonSign = this.SIGNS[Math.floor(moonLon / 30) % 12];
      const moonGlyph = this.GLYPHS[Math.floor(moonLon / 30) % 12];
      const moonDegrees = (moonLon % 30).toFixed(1);

      // Próxima fase lunar
      const nextQuarter = Astronomy.SearchMoonQuarter(t);
      const nextPhase = this.QUARTER_NAMES[nextQuarter.quarter];
      const nextDate = nextQuarter.time.date;

      // ── SOL ───────────────────────────────────────────────────────────────
      const sunLon = Astronomy.SunPosition(t).elon;
      const sunSign = this.SIGNS[Math.floor(sunLon / 30) % 12];
      const sunGlyph = this.GLYPHS[Math.floor(sunLon / 30) % 12];
      const sunDegrees = (sunLon % 30).toFixed(1);

      // ── PLANETAS VISIBLES (elongación >20° del Sol) ───────────────────────
      const PLANETS = [
        { body: Astronomy.Body.Mercury, name: 'Mercurio', emoji: '☿' },
        { body: Astronomy.Body.Venus, name: 'Venus', emoji: '♀' },
        { body: Astronomy.Body.Mars, name: 'Marte', emoji: '♂' },
        { body: Astronomy.Body.Jupiter, name: 'Júpiter', emoji: '♃' },
        { body: Astronomy.Body.Saturn, name: 'Saturno', emoji: '♄' },
      ];

      const visiblePlanets = PLANETS.map((p) => {
        const lon = Astronomy.EclipticLongitude(p.body, t);
        let diff = Math.abs(lon - sunLon);
        if (diff > 180) diff = 360 - diff;
        return {
          ...p,
          visible: diff > 20,
          sign: this.SIGNS[Math.floor(lon / 30) % 12],
          deg: (lon % 30).toFixed(1),
        };
      }).filter((p) => p.visible);

      // ── FORMATEO PARA EL USUARIO ──────────────────────────────────────────
      const dateStr = date.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const lines: string[] = [
        `🌌 **Clima Astrológico para ${dateStr}**`,
        '',
        `**Luna ${phaseEmoji} (${illumination}% iluminada)**`,
        `- Fase: ${phaseName}`,
        `- Posición: ${moonGlyph} ${moonSign} ${moonDegrees}°`,
        `- Próxima fase: ${nextPhase} el ${nextDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`,
        '',
        `**Sol ☀️**`,
        `- Posición: ${sunGlyph} ${sunSign} ${sunDegrees}°`,
        '',
      ];

      if (visiblePlanets.length > 0) {
        lines.push(`**Planetas visibles esta noche:**`);
        for (const p of visiblePlanets) {
          lines.push(`- ${p.emoji} **${p.name}** en ${p.sign} ${p.deg}°`);
        }
      } else {
        lines.push(`**Planetas visibles esta noche:** Ninguno (todos muy cerca del Sol)`);
      }

      // ── INTERPRETACIÓN ASTROLÓGICA BÁSICA ─────────────────────────────────
      lines.push('', '**Energías del día:**');

      // Elemento lunar
      const moonElement = this.ELEMENTS[moonSign];
      lines.push(`- Luna en ${moonSign} (${moonElement}): ${this.getMoonSignInterpretation(moonSign)}`);

      // Fase lunar
      lines.push(`- ${phaseName}: ${this.getPhaseInterpretation(phaseName)}`);

      const elapsed = Date.now() - startTime;
      this.logger.log(`[astrology] clima calculado en ${elapsed}ms`);

      return lines.join('\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[astrology] error calculando: ${msg}`);
      return '⚠️ No pude calcular el clima astrológico en este momento. Intentá de nuevo.';
    }
  }

  /**
   * Obtiene posiciones planetarias completas (carta astral básica).
   * Equivalente al módulo "ASTROLOGÍA" de Archeoscope.
   */
  getPlanetaryPositions(date: Date = new Date()): string {
    const startTime = Date.now();

    try {
      const t = Astronomy.MakeTime(date);

      const BODIES: Array<{ id: string; body: Astronomy.Body | null; name: string; emoji: string }> = [
        { id: 'sun', body: null, name: 'Sol', emoji: '☀️' },
        { id: 'moon', body: Astronomy.Body.Moon, name: 'Luna', emoji: '🌙' },
        { id: 'mercury', body: Astronomy.Body.Mercury, name: 'Mercurio', emoji: '☿' },
        { id: 'venus', body: Astronomy.Body.Venus, name: 'Venus', emoji: '♀' },
        { id: 'mars', body: Astronomy.Body.Mars, name: 'Marte', emoji: '♂' },
        { id: 'jupiter', body: Astronomy.Body.Jupiter, name: 'Júpiter', emoji: '♃' },
        { id: 'saturn', body: Astronomy.Body.Saturn, name: 'Saturno', emoji: '♄' },
        { id: 'uranus', body: Astronomy.Body.Uranus, name: 'Urano', emoji: '♅' },
        { id: 'neptune', body: Astronomy.Body.Neptune, name: 'Neptuno', emoji: '♆' },
        { id: 'pluto', body: Astronomy.Body.Pluto, name: 'Plutón', emoji: '♇' },
      ];

      const positions: Array<{ name: string; emoji: string; sign: string; deg: string; retrograde: boolean }> = [];

      for (const b of BODIES) {
        let lon: number;
        let retrograde = false;

        if (b.id === 'sun') {
          lon = Astronomy.SunPosition(t).elon;
        } else if (b.body) {
          lon = Astronomy.EclipticLongitude(b.body, t);

          // Detectar movimiento retrógrado (Δλ negativo en 1 hora)
          const tNext = Astronomy.MakeTime(new Date(date.getTime() + 3600000));
          let dlon = Astronomy.EclipticLongitude(b.body, tNext) - lon;
          if (dlon > 180) dlon -= 360;
          if (dlon < -180) dlon += 360;
          retrograde = dlon * 24 < 0; // velocidad diaria negativa
        } else {
          continue;
        }

        const sign = this.SIGNS[Math.floor(lon / 30) % 12];
        const deg = (lon % 30).toFixed(1);

        positions.push({
          name: b.name,
          emoji: b.emoji,
          sign,
          deg,
          retrograde,
        });
      }

      // ── BALANCE DE ELEMENTOS ──────────────────────────────────────────────
      const elementCount = { Fuego: 0, Tierra: 0, Aire: 0, Agua: 0 };
      for (const p of positions) {
        const element = this.ELEMENTS[p.sign];
        elementCount[element]++;
      }

      // ── FORMATEO ──────────────────────────────────────────────────────────
      const dateStr = date.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const lines: string[] = [
        `🪐 **Posiciones Planetarias — ${dateStr}**`,
        '',
        '**Planetas:**',
      ];

      for (const p of positions) {
        const r = p.retrograde ? ' ℞ (retrógrado)' : '';
        lines.push(`- ${p.emoji} **${p.name}**: ${p.sign} ${p.deg}°${r}`);
      }

      lines.push('', '**Balance de Elementos:**');
      for (const [elem, count] of Object.entries(elementCount)) {
        const pct = Math.round((count / positions.length) * 100);
        lines.push(`- ${elem}: ${count} planetas (${pct}%)`);
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(`[astrology] posiciones calculadas en ${elapsed}ms`);

      return lines.join('\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[astrology] error calculando posiciones: ${msg}`);
      return '⚠️ No pude calcular las posiciones planetarias en este momento.';
    }
  }

  // ── Interpretaciones astrológicas básicas ───────────────────────────────────

  private getMoonSignInterpretation(sign: string): string {
    const interpretations: Record<string, string> = {
      Aries: 'impulso emocional, acción directa',
      Tauro: 'estabilidad emocional, conexión con lo material',
      Géminis: 'curiosidad mental, comunicación fluida',
      Cáncer: 'sensibilidad aumentada, enfoque en el hogar',
      Leo: 'expresión creativa, calidez emocional',
      Virgo: 'análisis detallado, búsqueda de orden',
      Libra: 'armonía en relaciones, búsqueda de equilibrio',
      Escorpio: 'intensidad emocional, transformación',
      Sagitario: 'optimismo, expansión mental',
      Capricornio: 'disciplina emocional, enfoque en metas',
      Acuario: 'innovación, conexión comunitaria',
      Piscis: 'intuición elevada, empatía profunda',
    };
    return interpretations[sign] || 'energía particular del signo';
  }

  private getPhaseInterpretation(phase: string): string {
    const interpretations: Record<string, string> = {
      'Luna Nueva': 'momento ideal para nuevos comienzos e intenciones',
      'Creciente': 'tiempo de acción y construcción',
      'Cuarto Creciente': 'superar obstáculos y tomar decisiones',
      'Gibosa Creciente': 'refinamiento y preparación',
      'Luna Llena': 'culminación, revelaciones y liberación emocional',
      'Gibosa Menguante': 'compartir sabiduría y gratitud',
      'Cuarto Menguante': 'soltar lo que ya no sirve',
      'Menguante': 'descanso, reflexión interior y cierre de ciclos',
    };
    return interpretations[phase] || 'fase de transición lunar';
  }
}
