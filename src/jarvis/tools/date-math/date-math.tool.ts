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

    // 1. Días restantes para terminar el año / fin de año
    if (
      /(cuantos dias faltan|dias para terminar el ano|dias para fin de ano|cuanto falta para fin de ano|cuanto falta para terminar el ano)/i.test(
        cleanQuery,
      )
    ) {
      return this.calculateDaysRemainingInYear(now);
    }

    // 2. Suma o resta relativa de días o semanas ("dentro de X días", "hace X semanas", "en X días")
    const relativeMatch = cleanQuery.match(
      /(?:dentro de|en|hace|despues de)\s+(\d+)\s*(dias|dia|semanas|semana|meses|mes)/i,
    );
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const isPast = cleanQuery.includes('hace');
      return this.calculateRelativeDate(now, amount, unit, isPast);
    }

    // 3. Proyección futura con "dentro de X días" o "en X días qué fecha será"
    const projectionMatch = cleanQuery.match(
      /que fecha (sera|va a ser|es)\s+(?:dentro de|en)\s+(\d+)\s*(dias|semanas)/i,
    );
    if (projectionMatch) {
      const amount = parseInt(projectionMatch[2], 10);
      const unit = projectionMatch[3].toLowerCase();
      return this.calculateRelativeDate(now, amount, unit, false);
    }

    // 4. Día de la semana para una fecha ("qué día cae el 25 de diciembre")
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
   * Calcula exactamente cuántos días faltan para finalizar el año civil en curso.
   */
  calculateDaysRemainingInYear(now: DateTime): DateMathResult {
    const endOfYear = DateTime.fromObject(
      { year: now.year, month: 12, day: 31, hour: 23, minute: 59, second: 59 },
      { zone: now.zoneName },
    );

    // Diferencia entre el final de hoy y el final del año
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
    const monthMap: Record<string, number> = {
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

    const month = monthMap[monthName.toLowerCase()];
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

