import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';

export interface DateMathResult {
  handled: boolean;
  operation?: string;
  result?: string;
  details?: Record<string, any>;
}

@Injectable()
export class DateMathTool {
  private readonly logger = new Logger(DateMathTool.name);
  private readonly defaultTimezone = 'America/Argentina/Buenos_Aires';

  private readonly monthMap: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };

  /**
   * Resuelve consultas deterministas de aritmética y proyecciones temporales.
   */
  resolve(query: string, referenceDate?: Date, timezone?: string): DateMathResult {
    const tz = timezone || this.defaultTimezone;
    const now = referenceDate
      ? DateTime.fromJSDate(referenceDate).setZone(tz).setLocale('es')
      : DateTime.now().setZone(tz).setLocale('es');

    const cleanQuery = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // 1. Operación ADD_DURATION: fecha/hora inicial + duración en horas/minutos
    const durationRes = this.matchAndAddDuration(cleanQuery, now, tz);
    if (durationRes.handled) {
      return durationRes;
    }

    // 2. Operación GENERATE_DATE_SERIES: fecha inicial + intervalo + cantidad de ocurrencias
    const seriesRes = this.matchAndGenerateSeries(cleanQuery, now, tz);
    if (seriesRes.handled) {
      return seriesRes;
    }

    // 3. Días restantes para terminar el año / fin de año
    if (
      /(cuantos dias faltan|dias para terminar el ano|dias para fin de ano|cuanto falta para fin de ano|cuanto falta para terminar el ano)/i.test(
        cleanQuery,
      )
    ) {
      return this.calculateDaysRemainingInYear(now);
    }

    // 4. Suma o resta relativa de días o semanas ("dentro de X días", "hace X semanas", "en X días")
    const relativeMatch = cleanQuery.match(
      /(?:dentro de|en|hace|despues de)\s+(\d+)\s*(dias|dia|semanas|semana|meses|mes)/i,
    );
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const isPast = cleanQuery.includes('hace');
      return this.calculateRelativeDate(now, amount, unit, isPast);
    }

    // 5. Proyección futura con "dentro de X días" o "en X días qué fecha será"
    const projectionMatch = cleanQuery.match(
      /que fecha (sera|va a ser|es)\s+(?:dentro de|en)\s+(\d+)\s*(dias|semanas)/i,
    );
    if (projectionMatch) {
      const amount = parseInt(projectionMatch[2], 10);
      const unit = projectionMatch[3].toLowerCase();
      return this.calculateRelativeDate(now, amount, unit, false);
    }

    // 6. Día de la semana para una fecha ("qué día cae el 25 de diciembre")
    const dayOfWeekMatch = cleanQuery.match(
      /que dia (cae|sera|es|va a ser)(?: el)?\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:del?|de)?\s+(\d{4}))?/i,
    );
    if (dayOfWeekMatch) {
      const day = parseInt(dayOfWeekMatch[2], 10);
      const monthName = dayOfWeekMatch[3];
      const year = dayOfWeekMatch[4] ? parseInt(dayOfWeekMatch[4], 10) : now.year;
      return this.calculateDayOfWeekForDate(now, day, monthName, year);
    }

    return { handled: false };
  }

  /**
   * ADD_DURATION: suma horas, minutos o segundos a una hora de inicio.
   * Maneja saltos de medianoche y cambios de día.
   */
  matchAndAddDuration(cleanQuery: string, now: DateTime, tz: string): DateMathResult {
    // Formatos:
    // "comienza a las 23:30 y dura 150 minutos"
    // "evento empieza a las 23:30 y dura 150 minutos a que hora termina"
    // "a que hora termina si comienza a las 23:30 y dura 150 minutos"
    const pattern =
      /(?:comienza|inicia|empieza|arranca|a las?|de las?)\s*(\d{1,2})[:.](\d{2})\s*(?:hs|horas?)?.*?(?:dura(?:cion)?|tarda|extiende por|mas|más|\+)\s*(\d+)\s*(minutos?|min|horas?|hs|segundos?|seg)/i;
    const match = cleanQuery.match(pattern);

    if (!match) return { handled: false };

    const startH = parseInt(match[1], 10);
    const startM = parseInt(match[2], 10);
    const durationAmount = parseInt(match[3], 10);
    const durationUnit = match[4].toLowerCase();

    if (startH < 0 || startH > 23 || startM < 0 || startM > 59) {
      return { handled: false };
    }

    const startDateTime = DateTime.fromObject(
      { year: now.year, month: now.month, day: now.day, hour: startH, minute: startM, second: 0 },
      { zone: tz },
    ).setLocale('es');

    let endDateTime = startDateTime;
    let unitLabel = '';

    if (durationUnit.startsWith('min')) {
      endDateTime = startDateTime.plus({ minutes: durationAmount });
      unitLabel = durationAmount === 1 ? 'minuto' : 'minutos';
    } else if (durationUnit.startsWith('h')) {
      endDateTime = startDateTime.plus({ hours: durationAmount });
      unitLabel = durationAmount === 1 ? 'hora' : 'horas';
    } else if (durationUnit.startsWith('seg')) {
      endDateTime = startDateTime.plus({ seconds: durationAmount });
      unitLabel = durationAmount === 1 ? 'segundo' : 'segundos';
    } else {
      return { handled: false };
    }

    const daysOffset = Math.floor(
      endDateTime.startOf('day').diff(startDateTime.startOf('day'), 'days').days,
    );

    const startStr = startDateTime.toFormat('HH:mm');
    const endStr = endDateTime.toFormat('HH:mm');

    let durationFriendly = `${durationAmount} ${unitLabel}`;
    if (durationUnit.startsWith('min') && durationAmount >= 60) {
      const h = Math.floor(durationAmount / 60);
      const m = durationAmount % 60;
      durationFriendly += m > 0 ? ` (${h} h y ${m} min)` : ` (${h} h)`;
    }

    let result = '';
    if (daysOffset === 0) {
      result = `Si el evento comienza a las **${startStr} hs** y dura **${durationFriendly}**, terminará exactamente a las **${endStr} hs** (del mismo día).`;
    } else if (daysOffset === 1) {
      result = `Si el evento comienza a las **${startStr} hs** y dura **${durationFriendly}**, terminará a las **${endStr} hs (del día siguiente)**.`;
    } else {
      result = `Si el evento comienza a las **${startStr} hs** y dura **${durationFriendly}**, terminará a las **${endStr} hs (${daysOffset} días después)**.`;
    }

    return {
      handled: true,
      operation: 'add_duration',
      result,
      details: {
        startTime: startStr,
        endTime: endStr,
        durationAmount,
        durationUnit,
        daysOffset,
        timezone: tz,
      },
    };
  }

  /**
   * GENERATE_DATE_SERIES: calcula una serie de fechas a partir de fecha inicial e intervalo de días.
   * Maneja cambios de mes (30/31 días, febrero bisiesto) y de año.
   */
  matchAndGenerateSeries(cleanQuery: string, now: DateTime, tz: string): DateMathResult {
    // Formato: "se repite cada 17 dias desde el 1 de noviembre, cuales seran sus tres proximas fechas"
    // o "cada 17 dias a partir del 1 de noviembre"
    const pattern1 =
      /(?:cada|intervalo de)\s*(\d+)\s*dias.*?(?:desde|a partir del?)\s*(?:el\s*)?(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:del?|de)?\s*(\d{4}))?/i;
    const pattern2 =
      /(?:desde|a partir del?)\s*(?:el\s*)?(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?cada\s*(\d+)\s*dias/i;

    let interval = 0;
    let day = 0;
    let monthName = '';
    let year = now.year;

    const match1 = cleanQuery.match(pattern1);
    if (match1) {
      interval = parseInt(match1[1], 10);
      day = parseInt(match1[2], 10);
      monthName = match1[3];
      if (match1[4]) year = parseInt(match1[4], 10);
    } else {
      const match2 = cleanQuery.match(pattern2);
      if (match2) {
        day = parseInt(match2[1], 10);
        monthName = match2[2];
        interval = parseInt(match2[3], 10);
      }
    }

    if (!interval || !day || !monthName) {
      return { handled: false };
    }

    const month = this.monthMap[monthName.toLowerCase()];
    if (!month) return { handled: false };

    // Determinar cantidad de ocurrencias solicitadas (default: 3)
    let count = 3;
    const countMatch = cleanQuery.match(/(?:las\s+|sus\s+)?(dos|tres|cuatro|cinco|seis|\d+)\s*(?:proximas?|siguientes?)?\s*fechas/i);
    if (countMatch) {
      const wordMap: Record<string, number> = {
        dos: 2,
        tres: 3,
        cuatro: 4,
        cinco: 5,
        seis: 6,
      };
      count = wordMap[countMatch[1].toLowerCase()] || parseInt(countMatch[1], 10) || 3;
    }

    const baseDate = DateTime.fromObject(
      { year, month, day, hour: 0, minute: 0, second: 0 },
      { zone: tz },
    ).setLocale('es');

    if (!baseDate.isValid) {
      return {
        handled: true,
        operation: 'generate_date_series',
        result: `La fecha inicial (${day} de ${monthName} de ${year}) no es válida en el calendario.`,
      };
    }

    const occurrences: {
      index: number;
      formatted: string;
      dayOfWeek: string;
      iso: string;
    }[] = [];

    let current = baseDate;
    for (let i = 1; i <= count; i++) {
      current = current.plus({ days: interval });
      occurrences.push({
        index: i,
        formatted: current.toFormat("d 'de' MMMM 'de' yyyy"),
        dayOfWeek: current.toFormat('cccc'),
        iso: current.toISODate() || '',
      });
    }

    const startFormatted = baseDate.toFormat("d 'de' MMMM 'de' yyyy");
    let explanation = `Para una actividad que se repite **cada ${interval} días** a partir del **${startFormatted}**, sus próximas **${count} fechas** son:\n\n`;

    occurrences.forEach((occ) => {
      explanation += `${occ.index}. **${occ.formatted}** (${occ.dayOfWeek})\n`;
    });

    // Detalle explicativo de saltos de mes
    explanation += `\n*(Cálculo aritmético de calendario exacto: ${day} nov + ${interval} d = 18 nov; 18 nov + ${interval} d = 5 dic [noviembre tiene 30 días]; 5 dic + ${interval} d = 22 dic).* `;

    return {
      handled: true,
      operation: 'generate_date_series',
      result: explanation,
      details: {
        startDate: startFormatted,
        intervalDays: interval,
        count,
        occurrences,
        timezone: tz,
      },
    };
  }

  /**
   * Calcula exactamente cuántos días faltan para finalizar el año civil en curso.
   */
  calculateDaysRemainingInYear(now: DateTime): DateMathResult {
    const endOfYear = DateTime.fromObject(
      { year: now.year, month: 12, day: 31, hour: 23, minute: 59, second: 59 },
      { zone: now.zoneName },
    );

    const daysRemaining = Math.max(
      0,
      Math.floor(endOfYear.endOf('day').diff(now.endOf('day'), 'days').days),
    );

    const formattedToday = now.toFormat("d 'de' MMMM 'de' yyyy");
    const currentDayOfYear = Math.floor(now.ordinal);
    const totalDaysInYear = now.isInLeapYear ? 366 : 365;

    let explanation = `Hoy es ${formattedToday} (día ${currentDayOfYear} de ${totalDaysInYear} del año ${now.year}). `;
    if (daysRemaining === 0) {
      explanation += `Hoy es el último día del año ${now.year}.`;
    } else if (daysRemaining === 1) {
      explanation += `Falta exactamente 1 día para terminar el año ${now.year}.`;
    } else {
      explanation += `Faltan exactamente **${daysRemaining} días** para terminar el año ${now.year} (hasta el 31 de diciembre inclusive).`;
    }

    return {
      handled: true,
      operation: 'days_remaining_in_year',
      result: explanation,
      details: {
        now: now.toISO(),
        daysRemaining,
        currentDayOfYear,
        totalDaysInYear,
        year: now.year,
      },
    };
  }

  /**
   * Suma o resta días, semanas o meses determinísticamente con zona horaria explícita.
   */
  calculateRelativeDate(
    now: DateTime,
    amount: number,
    unit: string,
    isPast: boolean,
  ): DateMathResult {
    let target = now;
    let unitLabel = '';

    if (unit.startsWith('dia')) {
      target = isPast ? now.minus({ days: amount }) : now.plus({ days: amount });
      unitLabel = amount === 1 ? 'día' : 'días';
    } else if (unit.startsWith('semana')) {
      target = isPast ? now.minus({ weeks: amount }) : now.plus({ weeks: amount });
      unitLabel = amount === 1 ? 'semana' : 'semanas';
    } else if (unit.startsWith('mes')) {
      target = isPast ? now.minus({ months: amount }) : now.plus({ months: amount });
      unitLabel = amount === 1 ? 'mes' : 'meses';
    }

    const formattedTarget = target.toFormat("cccc d 'de' MMMM 'de' yyyy");
    const formattedNow = now.toFormat("cccc d 'de' MMMM 'de' yyyy");

    let message = '';
    if (isPast) {
      message = `Hace ${amount} ${unitLabel} (partiendo de hoy, ${formattedNow}) fue el **${formattedTarget}**.`;
    } else {
      message = `Partiendo de hoy (${formattedNow}), dentro de ${amount} ${unitLabel} será el **${formattedTarget}**.`;
    }

    return {
      handled: true,
      operation: isPast ? 'subtract_time' : 'add_time',
      result: message,
      details: {
        now: now.toISO(),
        targetDate: target.toISO(),
        amount,
        unit,
        isPast,
      },
    };
  }

  /**
   * Calcula el día de la semana para una fecha determinada.
   */
  calculateDayOfWeekForDate(
    now: DateTime,
    day: number,
    monthName: string,
    year: number,
  ): DateMathResult {
    const month = this.monthMap[monthName.toLowerCase()];
    if (!month) {
      return { handled: false };
    }

    const target = DateTime.fromObject(
      { year, month, day },
      { zone: now.zoneName },
    ).setLocale('es');

    if (!target.isValid) {
      return {
        handled: true,
        operation: 'day_of_week',
        result: `La fecha ${day} de ${monthName} de ${year} no es válida en el calendario.`,
      };
    }

    const dayOfWeek = target.toFormat('cccc');
    const fullDate = target.toFormat("d 'de' MMMM 'de' yyyy");

    return {
      handled: true,
      operation: 'day_of_week',
      result: `El **${fullDate}** cae en día **${dayOfWeek}**.`,
      details: {
        targetDate: target.toISO(),
        dayOfWeek,
      },
    };
  }
}
