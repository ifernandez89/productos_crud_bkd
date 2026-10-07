import {
  resolveOllamaModelName,
  resolveCoderModel,
  resolveTranslatorModel,
  resolveVisionModel,
  resolveIntentModel,
  resolveEmbeddingModel,
  resolveTTSModel,
} from './ollama-config';

export type SpecialistDiscipline =
  | 'chatbot'
  | 'coder'
  | 'traductor'
  | 'reader'
  | 'ocr'
  | 'video'
  | 'rag'
  | 'planner'
  | 'tools'
  | 'auto';

export interface SpecialistDescriptor {
  id: SpecialistDiscipline;
  name: string;
  icon: string;
  category: string;
  model: string;
  description: string;
  suggestedPrompt: string;
  tags: string[];
}

export function getAvailableDisciplines(): SpecialistDescriptor[] {
  return [
    {
      id: 'chatbot',
      name: 'Chat General',
      icon: '💬',
      category: 'Conversación',
      model: resolveOllamaModelName('qwen2.5:7b'),
      description: 'Conversación fluida, razonamiento cotidiano y asistencia general.',
      suggestedPrompt: 'Hola, ¿en qué me puedes ayudar hoy?',
      tags: ['chat', 'asistente', 'general', 'conversacion'],
    },
    {
      id: 'coder',
      name: 'Código & Desarrollo',
      icon: '💻',
      category: 'Programación',
      model: resolveCoderModel('qwen2.5-coder:7b'),
      description: 'Programación, debugging, refactorización, tipado estricto y arquitectura.',
      suggestedPrompt: 'Escribe una función en TypeScript para validar...',
      tags: ['code', 'programacion', 'debug', 'typescript', 'nestjs', 'python'],
    },
    {
      id: 'traductor',
      name: 'Traductor Especializado',
      icon: '🌐',
      category: 'Traducción',
      model: resolveTranslatorModel('RogerBen/hy-mt1.5-1.8b:latest'),
      description: 'Traducción directa y eficiente sin sobrecargar modelos pesados.',
      suggestedPrompt: 'Traduce este texto al español manteniendo el tono técnico...',
      tags: ['traduccion', 'translate', 'idiomas', 'srt', 'pdf'],
    },
    {
      id: 'reader',
      name: 'Lector & TTS',
      icon: '🎙️',
      category: 'Audio & Lectura',
      model: resolveTTSModel('sematre/orpheus:it_es-3b'),
      description: 'Lectura en voz alta de PDFs y libros con síntesis de audio.',
      suggestedPrompt: 'Léeme el resumen del capítulo 1...',
      tags: ['lector', 'tts', 'audio', 'lectura', 'voz'],
    },
    {
      id: 'ocr',
      name: 'PDF & Documentos (OCR)',
      icon: '📄',
      category: 'Documentos',
      model: resolveVisionModel('yemifo/qwen25-vl-3b-q4km:latest'),
      description: 'Extracción, OCR, clasificación y resumen de documentos.',
      suggestedPrompt: 'Extrae el texto y resume el documento adjunto...',
      tags: ['ocr', 'pdf', 'documentos', 'extraccion', 'resumen'],
    },
    {
      id: 'video',
      name: 'Video & Frame Analysis',
      icon: '🎬',
      category: 'Multimedia',
      model: resolveVisionModel('yemifo/qwen25-vl-3b-q4km:latest'),
      description: 'Análisis de frames, descripción visual y extracción de información.',
      suggestedPrompt: 'Analiza este cuadro o secuencia de video...',
      tags: ['video', 'frames', 'vision', 'multimodal'],
    },
    {
      id: 'rag',
      name: 'Búsqueda RAG & Memoria',
      icon: '🔎',
      category: 'Conocimiento',
      model: resolveEmbeddingModel('bge-m3:latest'),
      description: 'Embeddings y recuperación vectorial estricta de documentos y memorias.',
      suggestedPrompt: 'Busca en la biblioteca de documentos todo sobre...',
      tags: ['rag', 'embeddings', 'memoria', 'vector', 'recuperacion'],
    },
    {
      id: 'planner',
      name: 'JarBees Planner',
      icon: '🧠',
      category: 'Planificación',
      model: 'JarBees Execution Engine',
      description: 'Descomposición y coordinación multi-paso de objetivos complejos.',
      suggestedPrompt: 'Planea y ejecuta una investigación completa sobre...',
      tags: ['planner', 'tareas', 'orquestacion', 'flujo'],
    },
    {
      id: 'tools',
      name: 'Herramientas & Integraciones',
      icon: '🛠️',
      category: 'Acciones',
      model: 'Tool Execution Engine',
      description: 'Ejecución de acciones reales (Google Calendar, Tasks, Gmail, Clima, Web).',
      suggestedPrompt: 'Muestra mis eventos de hoy en Google Calendar...',
      tags: ['tools', 'procedimientos', 'google', 'clima', 'web'],
    },
    {
      id: 'auto',
      name: 'Automático (Router)',
      icon: '🧭',
      category: 'Enrutador',
      model: resolveIntentModel('llama3.2:3b'),
      description: 'Detecta y enruta automáticamente la consulta al especialista adecuado.',
      suggestedPrompt: 'Cualquier consulta o tarea...',
      tags: ['auto', 'router', 'inteligente'],
    },
  ];
}

/** Normaliza la etiqueta enviada desde el front a una disciplina conocida */
export function normalizeDiscipline(input?: string): SpecialistDiscipline {
  if (!input || typeof input !== 'string') return 'auto';
  const clean = input.trim().toLowerCase();

  if (['chat', 'chatbot', 'general', 'asistente', 'conversacion'].includes(clean)) {
    return 'chatbot';
  }
  if (['code', 'coder', 'codigo', 'programacion', 'dev', 'developer'].includes(clean)) {
    return 'coder';
  }
  if (['traductor', 'translate', 'traduccion', 'translator'].includes(clean)) {
    return 'traductor';
  }
  if (['reader', 'lector', 'tts', 'voz', 'audio'].includes(clean)) {
    return 'reader';
  }
  if (['ocr', 'pdf', 'docs', 'documentos', 'scan'].includes(clean)) {
    return 'ocr';
  }
  if (['video', 'frames', 'multimedia'].includes(clean)) {
    return 'video';
  }
  if (['rag', 'knowledge', 'memoria', 'buscar', 'recuperacion'].includes(clean)) {
    return 'rag';
  }
  if (['planner', 'plan', 'tareas'].includes(clean)) {
    return 'planner';
  }
  if (['tools', 'tool', 'herramientas', 'google'].includes(clean)) {
    return 'tools';
  }

  return 'auto';
}
