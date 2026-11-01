import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RetrievalDecision, RetrievalDecisionRecord } from './mae2.types';

@Injectable()
export class MemoryDecisionLoggerService {
  private readonly logger = new Logger(MemoryDecisionLoggerService.name);
  private readonly records: RetrievalDecisionRecord[] = [];
  private readonly logFilePath: string;

  constructor() {
    this.logFilePath = path.join(process.cwd(), 'data', 'mae2_decision_log.json');
  }

  /**
   * Registra de forma inmutable una decisión tomada por MAE 2.0.
   */
  logDecision(record: RetrievalDecisionRecord): void {
    // Almacenamiento en memoria (clon inmutable)
    const immutableRecord = Object.freeze({ ...record });
    this.records.push(immutableRecord);

    // Persistencia incremental en disco (.json)
    this.persistIncremental(immutableRecord);
  }

  /**
   * Obtiene todas las decisiones registradas, opcionalmente filtradas por sessionId.
   */
  getDecisions(sessionId?: string): RetrievalDecisionRecord[] {
    if (sessionId) {
      return this.records.filter((r) => r.sessionId === sessionId);
    }
    return [...this.records];
  }

  /**
   * Obtiene decisiones filtradas por tipo de decisión.
   */
  getDecisionsByDecisionType(decision: RetrievalDecision): RetrievalDecisionRecord[] {
    return this.records.filter((r) => r.decision === decision);
  }

  /**
   * Retorna el número total de decisiones registradas en memoria.
   */
  count(): number {
    return this.records.length;
  }

  /**
   * Limpia el registro en memoria (útil para pruebas unitarias).
   */
  clear(): void {
    this.records.length = 0;
  }

  /**
   * Escribe de forma incremental un registro a disco en formato JSONL o array JSON.
   */
  private persistIncremental(record: RetrievalDecisionRecord): void {
    try {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Guardamos en formato JSONL para append ultra rápido sin leer el archivo completo
      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf8');
    } catch (err: any) {
      this.logger.warn(`Error al persistir decisión incremental en ${this.logFilePath}: ${err.message}`);
    }
  }

  /**
   * Exporta todo el historial a un archivo JSON estructurado.
   */
  exportToJson(targetPath?: string): string {
    const dest = targetPath || this.logFilePath;
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const jsonContent = JSON.stringify(this.records, null, 2);
    fs.writeFileSync(dest, jsonContent, 'utf8');
    return dest;
  }
}

