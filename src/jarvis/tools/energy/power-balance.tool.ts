import { Injectable, Logger } from '@nestjs/common';

export interface PowerBalanceResult {
  handled: boolean;
  operation?: 'battery_autonomy' | 'solar_sizing' | 'power_efficiency' | 'unit_conversion';
  result?: string;
  details?: Record<string, any>;
}

@Injectable()
export class PowerBalanceTool {
  private readonly logger = new Logger(PowerBalanceTool.name);

  /**
   * Resuelve consultas deterministas de balance de potencia, autonomía de baterías,
   * eficiencia de conversión y dimensionamiento de energía.
   */
  resolve(query: string): PowerBalanceResult {
    const clean = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // 1. Autonomía de batería con/sin inversor
    const batteryRes = this.matchBatteryAutonomy(clean);
    if (batteryRes.handled) return batteryRes;

    // 2. Dimensionamiento de instalación solar / consumo diario
    const solarRes = this.matchSolarSizing(clean);
    if (solarRes.handled) return solarRes;

    return { handled: false };
  }

  /**
   * Calcula autonomía ideal de batería considerando potencia de carga y eficiencia del inversor.
   * Fórmula física correcta:
   * P_in = P_carga / eta
   * t = E_nom / P_in = (E_nom * eta) / P_carga
   */
  private matchBatteryAutonomy(clean: string): PowerBalanceResult {
    // Patrones:
    // "bateria tiene 600 wh de capacidad nominal y alimenta una carga de 120 w mediante un inversor con eficiencia del 90%"
    // "bateria de 600 wh, carga 120 w, inversor 90%"
    const isAutonomyQuery =
      /(?:autonomia|cuanto tiempo|duracion|cuanto dura)/i.test(clean) &&
      /(?:bateria|baterias|acumulador)/i.test(clean);

    if (!isAutonomyQuery) return { handled: false };

    // Extraer capacidad de batería (Wh o kWh o Ah con V)
    let capacityWh: number | null = null;
    const whMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(wh|kwh)/i);
    if (whMatch) {
      const val = parseFloat(whMatch[1].replace(',', '.'));
      capacityWh = whMatch[2].toLowerCase() === 'kwh' ? val * 1000 : val;
    } else {
      // Buscar Ah y V: "12 v y 60 ah"
      const ahMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*ah/i);
      const vMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*v(?:oltios|olts)?\b/i);
      if (ahMatch && vMatch) {
        const ah = parseFloat(ahMatch[1].replace(',', '.'));
        const v = parseFloat(vMatch[1].replace(',', '.'));
        capacityWh = ah * v;
      }
    }

    // Extraer potencia de carga (W o kW)
    let loadPowerW: number | null = null;
    const loadMatch = clean.match(/(?:carga|consumo|dispositivo|equipo|aparato)?.*?(\d+(?:[.,]\d+)?)\s*(w|kw)\b/i);
    if (loadMatch) {
      const val = parseFloat(loadMatch[1].replace(',', '.'));
      loadPowerW = loadMatch[2].toLowerCase() === 'kw' ? val * 1000 : val;
    }

    if (!capacityWh || !loadPowerW) {
      return { handled: false };
    }

    // Extraer eficiencia de inversor (ej: 90%, 0.90, eficiencia del 85%)
    let efficiency = 1.0;
    const effMatch = clean.match(/(?:eficiencia|rendimiento).*?(\d{1,3}(?:[.,]\d+)?)\s*%/i) ||
      clean.match(/inversor.*?(?:al|con)?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i);
    if (effMatch) {
      const effVal = parseFloat(effMatch[1].replace(',', '.'));
      if (effVal > 0 && effVal <= 100) {
        efficiency = effVal / 100;
      }
    }

    // Cálculos físicos:
    // Potencia extraída de la batería hacia el inversor:
    const batteryDrawPowerW = loadPowerW / efficiency;
    const lossesW = batteryDrawPowerW - loadPowerW;
    const usefulEnergyWh = capacityWh * efficiency;
    const autonomyHours = capacityWh / batteryDrawPowerW;

    const hoursInt = Math.floor(autonomyHours);
    const minutesInt = Math.round((autonomyHours - hoursInt) * 60);

    const timeFormatted =
      minutesInt === 0
        ? `${hoursInt} horas exactas`
        : `${hoursInt} horas y ${minutesInt} minutos (${autonomyHours.toFixed(2)} h)`;

    const explanation = [
      `### Cálculo de Autonomía de Batería con Inversor`,
      ``,
      `**1. Parámetros del sistema:**`,
      `- Capacidad nominal de la batería: **${capacityWh} Wh**`,
      `- Potencia de la carga (lado AC): **${loadPowerW} W**`,
      `- Eficiencia del inversor ($\eta$): **${(efficiency * 100).toFixed(0)}%** ($${efficiency}$)`,
      ``,
      `**2. Fórmulas físicas aplicadas:**`,
      `El inversor requiere disipar pérdidas térmicas de conmutación y transformación. Por lo tanto, la potencia real extraída de la batería es superior a la potencia de la carga:`,
      `$$P_{\\text{entrada}} = \\frac{P_{\\text{carga}}}{\\eta} = \\frac{${loadPowerW}\\text{ W}}{${efficiency}} = ${batteryDrawPowerW.toFixed(2)}\\text{ W}$$`,
      ``,
      `Pérdidas disipadas por el inversor en calor:`,
      `$$P_{\\text{pérdidas}} = P_{\\text{entrada}} - P_{\\text{carga}} = ${lossesW.toFixed(2)}\\text{ W}$$`,
      ``,
      `La autonomía ideal aproximada es la capacidad nominal dividida por la potencia total de entrada:`,
      `$$t = \\frac{E_{\\text{nom}}}{P_{\\text{entrada}}} = \\frac{${capacityWh}\\text{ Wh}}{${batteryDrawPowerW.toFixed(2)}\\text{ W}} = \\mathbf{${autonomyHours.toFixed(2)}\\text{ horas}}$$`,
      `*(O equivalentemente: energía útil en AC $E_{\\text{útil}} = ${capacityWh} \\times ${efficiency} = ${usefulEnergyWh.toFixed(1)}\\text{ Wh}$; luego $t = ${usefulEnergyWh.toFixed(1)} / ${loadPowerW} = ${autonomyHours.toFixed(2)}\\text{ h}$).*`,
      ``,
      `**3. Resultado ideal:**`,
      `La autonomía ideal aproximada es de **${timeFormatted}** (**${autonomyHours.toFixed(1)} horas**).`,
      ``,
      `**4. Supuestos y limitaciones físicas (factores reales de ingeniería):**`,
      `- **Profundidad de Descarga (DoD):** En baterías reales no se recomienda descargar el 100%. Con plomo-ácido (50% DoD) la autonomía útil sería de ~${(autonomyHours * 0.5).toFixed(1)} h; con litio LiFePO4 (80% DoD) sería de ~${(autonomyHours * 0.8).toFixed(1)} h.`,
      `- **Consumo en reposo (No-load draw):** Los inversores consumen entre 5W y 25W por el solo hecho de estar encendidos, lo que reduce ligeramente el tiempo total.`,
      `- **Factor de potencia:** Se asume carga puramente resistiva ($\\cos\\phi = 1.0$). Cargas inductivas reducen la eficiencia efectiva.`,
    ].join('\n');

    return {
      handled: true,
      operation: 'battery_autonomy',
      result: explanation,
      details: {
        capacityWh,
        loadPowerW,
        efficiency,
        batteryDrawPowerW,
        lossesW,
        usefulEnergyWh,
        autonomyHours,
      },
    };
  }

  /**
   * Dimensionamiento aproximado de instalación solar.
   * Calcula consumo diario e indica variables geográficas requeridas.
   */
  private matchSolarSizing(clean: string): PowerBalanceResult {
    // "calcular el tamano aproximado de una instalacion solar para alimentar un dispositivo que consume 200 w durante 8 horas diarias"
    const isSolarQuery =
      /(?:instalacion solar|tamano.*?solar|dimensionar.*?solar|panel solar|paneles solares)/i.test(clean) &&
      /(?:consum[oe]|alimentar|dispositivo)/i.test(clean);

    if (!isSolarQuery) return { handled: false };

    // Extraer potencia en W
    const powerMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(w|kw)\b/i);
    // Extraer horas de uso diario
    const hoursMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:horas|h|hs)\s*(?:diarias|por dia|al dia)?/i);

    if (!powerMatch || !hoursMatch) {
      return { handled: false };
    }

    const powerVal = parseFloat(powerMatch[1].replace(',', '.'));
    const powerW = powerMatch[2].toLowerCase() === 'kw' ? powerVal * 1000 : powerVal;
    const hours = parseFloat(hoursMatch[1].replace(',', '.'));

    const dailyEnergyWh = powerW * hours;
    const dailyEnergyKwh = dailyEnergyWh / 1000;

    const explanation = [
      `### Dimensionamiento de Instalación Solar Fotovoltaica`,
      ``,
      `**1. Demanda energética diaria conocida:**`,
      `- Consumo del dispositivo: **${powerW} W**`,
      `- Horas de funcionamiento diario: **${hours} horas/día**`,
      `- Energía requerida por día:`,
      `$$E_{\text{día}} = P \times t = ${powerW}\text{ W} \times ${hours}\text{ h} = \mathbf{${dailyEnergyWh}\text{ Wh/día}} \text{ (${dailyEnergyKwh.toFixed(2)}\text{ kWh/día})}$$`,
      ``,
      `**2. Variables indispensables que se necesitan conocer:**`,
      `Para calcular el tamaño exacto de paneles y baterías se requieren los siguientes datos del sitio y requerimientos:`,
      `- **Ubicación geográfica / Horas de Sol Pico (HSP):** En Entre Ríos/Argentina el promedio anual es de aproximadamente **4.0 a 4.5 HSP** (menor en invierno ~3.0 HSP, mayor en verano ~5.5 HSP).`,
      `- **Días de autonomía requeridos:** Si la instalación es aislada (off-grid), cuántos días consecutivos nublados debe soportar sin sol (típicamente 2 a 3 días).`,
      `- **Rendimiento global del sistema (Performance Ratio - PR):** Pérdidas por temperatura en paneles, polvo, cableado e inversor (típicamente $PR \approx 0.75$).`,
      ``,
      `**3. Estimación técnica preliminar (Escenario de referencia: 4.0 HSP, PR = 0.75):**`,
      `- **Potencia pico de paneles solares necesaria:**`,
      `$$P_{\text{paneles}} = \frac{E_{\text{día}}}{\text{HSP} \times PR} = \frac{${dailyEnergyWh}\text{ Wh}}{4.0 \times 0.75} \approx \mathbf{${Math.round(dailyEnergyWh / (4.0 * 0.75))}\text{ Wp}}$$`,
      `*(Se necesitaría por ejemplo 1 panel de 550 Wp o 2 paneles de 280 Wp).*`,
      `- **Capacidad de banco de baterías (para 1 día de autonomía con 50% DoD en plomo o 80% en litio):**`,
      `  * En litio (80% DoD): $${dailyEnergyWh} / 0.80 \approx \mathbf{${Math.round(dailyEnergyWh / 0.80)}\text{ Wh}}$ (ej. batería 12V 170Ah o 24V 85Ah).`,
      `  * En plomo de ciclo profundo (50% DoD): $${dailyEnergyWh} / 0.50 \approx \mathbf{${Math.round(dailyEnergyWh / 0.50)}\text{ Wh}}$ (ej. batería 12V 270Ah o 24V 135Ah).`,
    ].join('\n');

    return {
      handled: true,
      operation: 'solar_sizing',
      result: explanation,
      details: {
        powerW,
        hours,
        dailyEnergyWh,
        dailyEnergyKwh,
      },
    };
  }
}
