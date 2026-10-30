import { MissionCheckpoint } from './mission-checkpoint.service';
import { reconcileTaskWithCheckpoint } from './mission-recovery-inspector';
import {
  RecoverableStepDescriptor,
  RecoverableStepType,
  TaskStepRecord,
} from './mission-recovery.contracts';

export function inferMissionStepType(description: string): RecoverableStepType {
  const d = (description || '').toLowerCase();
  if (/(verificar c[oó]digo|verify_code|reparar typescript|harness)/.test(d)) {
    return 'verify_code';
  }
  if (/(buscar|busca|search|investigar)/.test(d)) return 'search';
  if (/(scrapear|scrape|extraer de url|leer url)/.test(d)) return 'scrape';
  if (/(memoria|recuerdo|preferencias|historial)/.test(d)) return 'read_memory';
  if (/(documento|pdf|biblioteca|archivo)/.test(d)) return 'read_docs';
  if (/(resumir|resumen|sintetizar|condensar)/.test(d)) return 'summarize';
  if (/(deduplicar|duplicados|limpiar)/.test(d)) return 'deduplicate';
  if (/(guardar|salvar|almacenar|indexar)/.test(d)) return 'save';
  return 'respond';
}

export function buildRecoverableSteps(
  objective: string,
  dbSteps: TaskStepRecord[],
  checkpoint: MissionCheckpoint | null,
): RecoverableStepDescriptor[] {
  const report = reconcileTaskWithCheckpoint(0, dbSteps, checkpoint);
  const reconciledMap = new Map(report.steps.map((s) => [s.stepNumber, s]));

  return (dbSteps || []).map((step) => {
    const rec = reconciledMap.get(step.stepNumber);
    const urlMatch = (step.description || '').match(/https?:\/\/[^\s]+/);
    return {
      id: step.id,
      stepNumber: step.stepNumber,
      description: step.description,
      type: inferMissionStepType(step.description),
      status: rec?.effectiveStatus || 'pending',
      reusedFromCheckpoint: Boolean(rec?.recoveredFromDisk),
      outputContent: rec?.output,
      query: objective,
      url: urlMatch?.[0],
    };
  });
}
