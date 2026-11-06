import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ExecutionAuditRecord,
  ExecutionStatus,
} from './execution-broker.types';

export interface AuditVerificationResult {
  valid: boolean;
  recordsCount: number;
  lastHash?: string;
  brokenAtIndex?: number;
  error?: string;
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

@Injectable()
export class BrokerAuditService implements OnModuleInit {
  private readonly logger = new Logger(BrokerAuditService.name);
  private readonly storageDir: string;
  private readonly ledgerPath: string;

  private sequenceNumber: number = 0;
  private lastEntryHash: string = GENESIS_HASH;
  private writeMutex: Promise<void> = Promise.resolve();

  constructor(customStorageDir?: string) {
    this.storageDir = customStorageDir
      ? path.resolve(customStorageDir)
      : path.resolve(process.cwd(), 'storage', 'security', 'execution-audit');
    this.ledgerPath = path.join(this.storageDir, 'audit-ledger.jsonl');
  }

  onModuleInit() {
    this.ensureStorageReady();
    this.loadLastStateFromLedger();
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  getLedgerPath(): string {
    return this.ledgerPath;
  }

  /**
   * Registra una decisión de ejecución en el libro mayor de auditoría de forma atómica y secuencial.
   */
  async recordDecision(entry: {
    requestId: string;
    actorId: string;
    capabilityId: string;
    decision: 'APPROVED' | 'DENIED';
    status: ExecutionStatus;
    reason?: string;
    payloadHash: string;
  }): Promise<ExecutionAuditRecord> {
    // Exclusión mutua en memoria para garantizar secuencia monotónica estricta
    return new Promise<ExecutionAuditRecord>((resolve, reject) => {
      this.writeMutex = this.writeMutex
        .then(() => {
          try {
            const index = this.sequenceNumber;
            const timestamp = new Date().toISOString();
            const previousEntryHash = this.lastEntryHash;

            const entryHash = this.computeEntryHash({
              index,
              timestamp,
              requestId: entry.requestId,
              actorId: entry.actorId,
              capabilityId: entry.capabilityId,
              decision: entry.decision,
              status: entry.status,
              payloadHash: entry.payloadHash,
              previousEntryHash,
            });

            const record: ExecutionAuditRecord = {
              index,
              timestamp,
              requestId: entry.requestId,
              actorId: entry.actorId,
              capabilityId: entry.capabilityId,
              decision: entry.decision,
              status: entry.status,
              reason: entry.reason,
              payloadHash: entry.payloadHash,
              previousEntryHash,
              entryHash,
            };

            this.persistRecordToDisk(record);

            this.sequenceNumber++;
            this.lastEntryHash = entryHash;

            resolve(record);
          } catch (err) {
            reject(err);
          }
        })
        .catch(reject);
    });
  }

  /**
   * Verifica la integridad criptográfica de la cadena de hashes completa en disco.
   */
  verifyAuditChain(): AuditVerificationResult {
    if (!fs.existsSync(this.ledgerPath)) {
      return { valid: true, recordsCount: 0, lastHash: GENESIS_HASH };
    }

    try {
      const content = fs.readFileSync(this.ledgerPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      let expectedPreviousHash = GENESIS_HASH;
      let expectedIndex = 0;

      for (let i = 0; i < lines.length; i++) {
        let record: ExecutionAuditRecord;
        try {
          record = JSON.parse(lines[i]) as ExecutionAuditRecord;
        } catch (jsonErr: any) {
          return {
            valid: false,
            recordsCount: i,
            brokenAtIndex: i,
            error: `Línea ${i} corrupta o con formato JSON inválido: ${jsonErr.message}`,
          };
        }

        // 1. Verificar índice monotónico
        if (record.index !== expectedIndex) {
          return {
            valid: false,
            recordsCount: i,
            brokenAtIndex: i,
            error: `Discrepancia en índice secuencial en posición ${i} (esperado: ${expectedIndex}, actual: ${record.index}).`,
          };
        }

        // 2. Verificar encadenamiento de hash previo
        if (record.previousEntryHash !== expectedPreviousHash) {
          return {
            valid: false,
            recordsCount: i,
            brokenAtIndex: i,
            error: `Discrepancia en previousEntryHash en índice ${record.index} (esperado: ${expectedPreviousHash}, actual: ${record.previousEntryHash}).`,
          };
        }

        // 3. Recomputar hash actual de la entrada
        const recalculatedHash = this.computeEntryHash({
          index: record.index,
          timestamp: record.timestamp,
          requestId: record.requestId,
          actorId: record.actorId,
          capabilityId: record.capabilityId,
          decision: record.decision,
          status: record.status,
          payloadHash: record.payloadHash,
          previousEntryHash: record.previousEntryHash,
        });

        if (recalculatedHash !== record.entryHash) {
          return {
            valid: false,
            recordsCount: i,
            brokenAtIndex: i,
            error: `Firma criptográfica manipulada o alterada en índice ${record.index} (esperado: ${recalculatedHash}, grabado: ${record.entryHash}).`,
          };
        }

        expectedPreviousHash = record.entryHash;
        expectedIndex++;
      }

      return {
        valid: true,
        recordsCount: lines.length,
        lastHash: expectedPreviousHash,
      };
    } catch (err: any) {
      return {
        valid: false,
        recordsCount: 0,
        error: `Fallo de I/O al verificar libro mayor: ${err.message}`,
      };
    }
  }

  /**
   * Calcula el hash determinista de una entrada de auditoría.
   */
  computeEntryHash(data: {
    index: number;
    timestamp: string;
    requestId: string;
    actorId: string;
    capabilityId: string;
    decision: string;
    status: string;
    payloadHash: string;
    previousEntryHash: string;
  }): string {
    const raw = `${data.index}:${data.timestamp}:${data.requestId}:${data.actorId}:${data.capabilityId}:${data.decision}:${data.status}:${data.payloadHash}:${data.previousEntryHash}`;
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  private ensureStorageReady(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
    }
  }

  private loadLastStateFromLedger(): void {
    if (!fs.existsSync(this.ledgerPath)) {
      this.sequenceNumber = 0;
      this.lastEntryHash = GENESIS_HASH;
      return;
    }

    const verification = this.verifyAuditChain();
    if (!verification.valid) {
      this.logger.error(
        `[BrokerAuditService] Libro mayor corrupto detectado en índice ${verification.brokenAtIndex}: ${verification.error}. Poniendo en cuarentena...`,
      );
      this.quarantineCorruptLedger();
      this.sequenceNumber = 0;
      this.lastEntryHash = GENESIS_HASH;
      return;
    }

    this.sequenceNumber = verification.recordsCount;
    this.lastEntryHash = verification.lastHash || GENESIS_HASH;
    this.logger.log(
      `[BrokerAuditService] Libro mayor de auditoría verificado con éxito (${this.sequenceNumber} entradas, último hash: ${this.lastEntryHash.slice(0, 8)}...).`,
    );
  }

  private persistRecordToDisk(record: ExecutionAuditRecord): void {
    this.ensureStorageReady();
    const line = JSON.stringify(record) + '\n';

    // Escritura durable forzada mediante fsync
    const fd = fs.openSync(this.ledgerPath, 'a', 0o600);
    try {
      fs.writeSync(fd, line, undefined, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  private quarantineCorruptLedger(): void {
    try {
      if (fs.existsSync(this.ledgerPath)) {
        const quarantinePath = path.join(
          this.storageDir,
          `audit-ledger.corrupt.${Date.now()}`,
        );
        fs.renameSync(this.ledgerPath, quarantinePath);
        this.logger.warn(
          `[BrokerAuditService] Libro mayor corrupto archivado en: ${quarantinePath}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `[BrokerAuditService] Error crítico al poner en cuarentena libro mayor: ${err.message}`,
      );
    }
  }
}

