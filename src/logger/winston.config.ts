import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, errors, json, colorize } = winston.format;

// Formato legible para consola
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  nestWinstonModuleUtilities.format.nestLike('App', {
    prettyPrint: true,
    colors: true,
  }),
);

// Formato JSON para archivos (fácil de parsear con herramientas)
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json(),
);

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'debug',
  transports: [
    // ── Consola ────────────────────────────────────────────────────────────
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // ── Archivo combinado (info + debug) — rotación diaria ─────────────────
    new (winston.transports as any).DailyRotateFile({
      filename:      'logs/app-%DATE%.log',
      datePattern:   'YYYY-MM-DD',
      zippedArchive: true,
      maxSize:       '20m',
      maxFiles:      '14d',      // conserva 14 días
      level:         'debug',
      format:        fileFormat,
    }),

    // ── Archivo de errores exclusivo ───────────────────────────────────────
    new (winston.transports as any).DailyRotateFile({
      filename:      'logs/error-%DATE%.log',
      datePattern:   'YYYY-MM-DD',
      zippedArchive: true,
      maxSize:       '10m',
      maxFiles:      '30d',      // errores se conservan 30 días
      level:         'error',
      format:        fileFormat,
    }),
  ],
};
