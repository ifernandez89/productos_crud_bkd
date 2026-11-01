import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DecisionEvaluationContext,
  RetrievalDecision,
  RetrievalDecisionRecord,
} from './mae2.types';

@Injectable()
export class MemoryAttentionPolicyService {
  private readonly logger = new Logger(MemoryAttentionPolicyService.name);

  // Palabras clave de entidades y proyectos internos de JarBees (Requieren memoria)
  private readonly PROJECT_SPECIFIC_KEYWORDS = [
    'jarbees', 'archeoscope', 'oxlahun', 'cauac', 'puma punku', 'tiwanaku',
    'balance de energía', 'balance energetico', 'nuestro proyecto', 'nuestro refactor',
    'pipeline de ingesta', 'chunk'
  ];

  // Palabras clave de lógica general, deducción o algoritmos abstractos (Autosuficientes)
  private readonly SELF_SUFFICIENT_KEYWORDS = [
    'calcula', 'cuánto es', 'cuanto es', 'suma', 'multiplica', 'invariante de',
    'función typescript', 'funcion typescript', 'ordena este array', 'complejidad o(n)',
    'demuestra que', 'escribe una regex', 'algoritmo quicksort', 'fibonacci',
    'palíndromo', 'palindromo', 'árbol binario', 'arbol binario', 'matriz', 'matrices',
    'concurrencia y paralelismo', 'elementos duplicados', 'reducción al absurdo'
  ];

  // Palabras clave de ambigüedad o referencia diferida
  private readonly AMBIGUOUS_DRIFT_KEYWORDS = [
    'el mecanismo que dijimos', 'lo que hablamos antes', 'la otra opción', 'la otra opcion',
    'como habíamos quedado', 'como habiamos quedado', 'habíamos acordado', 'habiamos acordado',
    'aquella arquitectura', 'lo anterior', 'el parámetro modificado', 'el parametro modificado',
    'la reunión pasada', 'la reunion pasada', 'de ayer', 'último refactor', 'ultimo refactor',
    'commit de ayer', 'lo que mencionamos', 'discutimos previamente', 'conclusiones sacamos',
    'en esta sesión', 'en esta sesion', 'en esta charla', 'te dije', 'dijimos que',
    'te comenté', 'te comente', 'hace dos minutos', 'hace un momento', 'acabo de',
    'te pegué', 'te pegue', 'te compartí', 'te comparti', 'inicio de esta charla',
    'en esta conversación', 'en esta conversacion'
  ];

  // Palabras clave de contradicción o desafío dialéctico
  private readonly ADVERSARIAL_KEYWORDS = [
    'eso es incorrecto', 'te equivocas', 'no es verdad que', 'en realidad es',
    'contradice', 'la documentación oficial dice lo opuesto', 'falso',
    'cambió la especificación', 'ya no usamos', 'ya no mantenemos', 'refutado',
    'desmiente', 'erróneo', 'erroneo', 'es erróneo', 'es erroneo',
    'discrepancia', 'incompatible', 'incompatibilidad', 'incoherencia', 'inconsistencia'
  ];

  // Palabras clave de relaciones / ontología
  private readonly RELATIONAL_KEYWORDS = [
    'relación', 'relacion', 'dependencia', 'depende', 'ontolog', 'grafo',
    'conexión', 'conexion', 'conecta', 'bus de eventos', 'interconexión',
    'quién influyó', 'quien influyo', 'responsable de emitir', 'subsistema'
  ];

  // Palabras clave trampa: Preguntas que parecen de CS o matemáticas pero refieren decisiones históricas privadas
  private readonly HISTORICAL_DECISION_TRAP_KEYWORDS = [
    'habíamos descartado', 'habiamos descartado', 'por qué no usamos', 'por que no usamos',
    'por qué descartamos', 'por que descartamos', 'por qué se eligió', 'por que se eligio',
    'nuestra decisión de', 'nuestra decision de', 'acordamos descartar', 'descartamos en la reunión',
    'por qué cambiamos de', 'por que cambiamos de', 'por qué decidimos', 'por que decidimos'
  ];

  // Palabras de historial / consenso / snapshot
  private readonly HISTORICAL_SNAPSHOT_KEYWORDS = [
    'cómo evolucionó', 'como evoluciono', 'qué concluimos', 'que concluimos',
    'historial de decisiones', 'snapshot', 'versión previa', 'version previa',
    'versión anterior', 'version anterior', 'decision previa', 'decisión previa',
    'decisión arquitectónica previa', 'aislamiento de transacciones',
    'revocáramos', 'revocamos', 'revocación', 'revocacion', 'adr',
    'arquitectura previa', 'consenso previo', 'criterio de particionado'
  ];

  /**
   * Evaluación rápida determinista (< 5ms) de la política de atención a memoria.
   */
  evaluatePolicy(context: DecisionEvaluationContext): RetrievalDecisionRecord {
    const t0 = Date.now();
    const text = context.userMessage.toLowerCase();
    const promptHash = crypto.createHash('sha256').update(context.userMessage, 'utf8').digest('hex').slice(0, 16);

    // 1. Evaluación de señales
    const hasProjectKeywords = this.PROJECT_SPECIFIC_KEYWORDS.some(k => text.includes(k)) || Boolean(context.explicitProjectEntityMentioned);
    const hasHistoricalDecisionTrap = this.HISTORICAL_DECISION_TRAP_KEYWORDS.some(k => text.includes(k));
    const hasSelfSufficientKeywords = !hasHistoricalDecisionTrap && (this.SELF_SUFFICIENT_KEYWORDS.some(k => text.includes(k)) || Boolean(context.isPureAlgorithmicOrMathematical));
    const hasAmbiguity = this.AMBIGUOUS_DRIFT_KEYWORDS.some(k => text.includes(k));
    const hasAdversarial = this.ADVERSARIAL_KEYWORDS.some(k => text.includes(k)) || Boolean(context.hasAdversarialChallenge);
    const hasRelational = this.RELATIONAL_KEYWORDS.some(k => text.includes(k));
    const hasSnapshot = (this.HISTORICAL_SNAPSHOT_KEYWORDS.some(k => text.includes(k)) || Boolean(context.hasHistoricalDriftKeywords)) || hasHistoricalDecisionTrap;

    // 2. Cálculo de Dimensiones Epistémicas
    let relevance = 0.2;
    let necessity = 0.1;
    let expectedUtility = 0.5;
    let interferenceRisk = 0.3;
    let contradictionDetected = hasAdversarial;
    let estimatedTokenCost = 0;
    let confidenceScore = 0.85;

    let decision = RetrievalDecision.NO_RETRIEVAL;
    let reason = '';
    const toolsEnabled: string[] = [];

    // LÓGICA DE DECISIÓN ADAPTATIVA:
    if (hasAdversarial) {
      // Conflicto epistémico -> DIALECTIC_AUDIT
      decision = RetrievalDecision.DIALECTIC_AUDIT;
      relevance = 0.9;
      necessity = 0.85;
      expectedUtility = 0.95;
      interferenceRisk = 0.1;
      confidenceScore = 0.9;
      estimatedTokenCost = 800;
      toolsEnabled.push('audit_dialectic_conflict', 'query_knowledge_graph', 'fetch_topic_snapshot');
      reason = 'Se detectó desafío explícito o contradicción con premisas consolidadas. Se activa auditoría dialéctica con control de procedencia.';
    } else if (hasAmbiguity) {
      // Ambigüedad con posible referencia a proyectos -> DEFERRED_RETRIEVAL
      decision = RetrievalDecision.DEFERRED_RETRIEVAL;
      relevance = 0.6;
      necessity = 0.7; // Regla de seguridad: no asumir suficiencia interna ante ambigüedad de proyecto
      expectedUtility = 0.5;
      interferenceRisk = 0.4;
      confidenceScore = 0.45; // Baja confianza intencional
      estimatedTokenCost = 250;
      toolsEnabled.push('bounded_context_search');
      reason = 'Ambigüedad en la referencia temporal o conceptual. Se difiere la decisión para realizar búsqueda acotada de contexto previo.';
    } else if (hasHistoricalDecisionTrap) {
      // Caso trampa de falso NO_RETRIEVAL: Parece lógica o CS general, pero depende del linaje de decisiones del proyecto
      decision = RetrievalDecision.SELECTIVE_SNAPSHOT;
      relevance = 0.85;
      necessity = 0.9;
      expectedUtility = 0.9;
      interferenceRisk = 0.15;
      confidenceScore = 0.85;
      estimatedTokenCost = 350;
      toolsEnabled.push('fetch_topic_snapshot');
      reason = 'Se detectó referencia explícita a un descarte o decisión histórica del equipo. Requiere snapshot de consenso temporal y no debe tratarse como autosuficiente.';
    } else if (hasProjectKeywords) {
      // Necesidad estricta de memoria externa del proyecto
      necessity = 0.95;
      relevance = 0.9;
      interferenceRisk = 0.1;
      confidenceScore = 0.9;

      if (hasRelational) {
        decision = RetrievalDecision.SELECTIVE_GRAPH;
        expectedUtility = 0.9;
        estimatedTokenCost = 450;
        toolsEnabled.push('query_knowledge_graph');
        reason = 'Consulta sobre relaciones o dependencias específicas de proyectos JarBees. Se autoriza consulta al grafo ontológico bajo demanda.';
      } else if (hasSnapshot) {
        decision = RetrievalDecision.SELECTIVE_SNAPSHOT;
        expectedUtility = 0.85;
        estimatedTokenCost = 350;
        toolsEnabled.push('fetch_topic_snapshot');
        reason = 'Consulta sobre evolución histórica o consensos previos de JarBees. Se autoriza recuperación de snapshots temporales.';
      } else {
        decision = RetrievalDecision.SELECTIVE_RAG;
        expectedUtility = 0.85;
        estimatedTokenCost = 600;
        toolsEnabled.push('query_rag_passages');
        reason = 'Consulta fáctica dependiente de documentación privada de proyectos JarBees. Se autoriza RAG semántico selectivo.';
      }
    } else if (hasSelfSufficientKeywords) {
      // Tarea autosuficiente (matemática, algorítmica pura, código general)
      decision = RetrievalDecision.NO_RETRIEVAL;
      necessity = 0.05;
      relevance = 0.1;
      expectedUtility = 0.1;
      interferenceRisk = 0.85; // Riesgo alto de anclaje contextual e interferencia si se inyecta memoria
      confidenceScore = 0.95;
      estimatedTokenCost = 0;
      reason = 'Suficiencia operativa: la tarea es de deducción o código general autosuficiente. Se decide formalmente NO recuperar para evitar interferencia.';
    } else if (hasSnapshot) {
      // Evolución histórica o consensos temporales
      decision = RetrievalDecision.SELECTIVE_SNAPSHOT;
      relevance = 0.85;
      necessity = 0.85;
      expectedUtility = 0.85;
      interferenceRisk = 0.2;
      confidenceScore = 0.85;
      estimatedTokenCost = 350;
      toolsEnabled.push('fetch_topic_snapshot');
      reason = 'Consulta sobre evolución histórica, consensos o decisiones previas. Se autoriza snapshot temporal.';
    } else if (hasRelational) {
      // Relación conceptual general
      decision = RetrievalDecision.SELECTIVE_GRAPH;
      relevance = 0.7;
      necessity = 0.6;
      expectedUtility = 0.75;
      interferenceRisk = 0.2;
      estimatedTokenCost = 300;
      toolsEnabled.push('query_knowledge_graph');
      reason = 'Consulta sobre interconexión de conceptos. Se habilita herramienta de grafo bajo demanda.';
    } else {
      // Caso base general sin dependencias explícitas de proyecto
      decision = RetrievalDecision.NO_RETRIEVAL;
      necessity = 0.15;
      relevance = 0.2;
      expectedUtility = 0.2;
      interferenceRisk = 0.6;
      confidenceScore = 0.75;
      estimatedTokenCost = 0;
      reason = 'No se detectaron requerimientos de conocimiento específico de JarBees. Suficiencia operativa en conocimiento general del modelo.';
    }

    const decisionLatencyMs = Date.now() - t0;

    return {
      decisionId: `dec_${crypto.randomUUID().slice(0, 8)}`,
      sessionId: context.sessionId,
      userPromptHash: promptHash,
      decision,
      confidenceScore,
      dimensions: {
        relevance,
        necessity,
        expectedUtility,
        interferenceRisk,
        contradictionDetected,
        estimatedTokenCost,
      },
      reason,
      decisionLatencyMs,
      toolsEnabled,
      createdAt: new Date(),
    };
  }
}
