import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ContextSelectorService } from './context-selector.service.ts';

/**
 * JCA-001 Misión 8: Suite de Pruebas de Intención Documental Natural y Precedencia de Exclusiones
 * 
 * Verifica la resolución definitiva de ANOM-M7-01:
 * - Grupo 1: 10 Consultas documentales originales del benchmark de homologación.
 * - Grupo 2: 15 Formulaciones documentales naturales nuevas (consulta, revisa, fíjate, posesivos).
 * - Grupo 3: 10 Exclusiones explícitas (sin documentos, no consultes mi biblioteca).
 * - Grupo 4: 10 Consultas conceptuales sin intención documental (RAG = UNNEEDED).
 * - Grupo 5: 5 Casos adversariales con solicitudes positivas y negativas simultáneas (Prevalencia EXCLUDED).
 * - Grupo 6: 5 Casos de mención incidental de documentos (crear documento en Word, PDF, etc. -> RAG = UNNEEDED).
 */

describe('JCA-001 Misión 8: Intención Documental Natural (Resolución ANOM-M7-01)', () => {
  const service = new ContextSelectorService();

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPO 1: 10 CONSULTAS DOCUMENTALES ORIGINALES DEL BENCHMARK
  // ════════════════════════════════════════════════════════════════════════════
  describe('Grupo 1: 10 Consultas Documentales Originales (D01 - D10)', () => {
    const originalQueries = [
      { id: 'D01', query: 'Busca en mis documentos qué dice Sylvan Muldoon sobre el cordón plateado' },
      { id: 'D02', query: '¿Qué explica el Kybalion sobre el principio de polaridad en mi biblioteca?' },
      { id: 'D03', query: 'Consulta en mis libros el método de exteriorización de la motilidad de Rochas' },
      { id: 'D04', query: 'Busca en la biblioteca qué es el cuerpo etérico según los textos esotéricos guardados' },
      { id: 'D05', query: 'Según los documentos de Carrington, ¿cuáles son los síntomas del desdoblamiento astral?' },
      { id: 'D06', query: 'Revisa en mis archivos los experimentos de hipnosis profunda y telepatía' },
      { id: 'D07', query: 'En mis libros de alquimia, ¿cómo se define la transmutación hermética?' },
      { id: 'D08', query: 'Busca el capítulo sobre catalepsia proyectiva en mi colección de libros' },
      { id: 'D09', query: 'De acuerdo a los textos guardados, ¿qué diferencia hay entre cuerpo astral y doble etérico?' },
      { id: 'D10', query: 'Busca en mis documentos el registro de casos históricos de bilocación' },
    ];

    for (const item of originalQueries) {
      it(`${item.id}: "${item.query.slice(0, 50)}..." debe solicitar RAG REQUESTED`, () => {
        const plan = service.evaluate({
          userMessage: item.query,
          classifiedIntent: 'RAG',
        });
        assert.strictEqual(plan.sources.rag, 'REQUESTED');
        assert.strictEqual(plan.ambiguity.contextConfidence, 'high');
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPO 2: 15 FORMULACIONES DOCUMENTALES NATURALES NUEVAS
  // ════════════════════════════════════════════════════════════════════════════
  describe('Grupo 2: 15 Formulaciones Documentales Naturales Nuevas (N01 - N15)', () => {
    const naturalQueries = [
      { id: 'N01', query: 'Fíjate en mis libros qué dice sobre los siete principios herméticos' },
      { id: 'N02', query: 'Mira en mi biblioteca si tenemos algo sobre sonambulismo inducido' },
      { id: 'N03', query: '¿Qué sostienen mis textos acerca de los planos sutiles?' },
      { id: 'N04', query: '¿Qué afirman mis documentos sobre la proyección consciente?' },
      { id: 'N05', query: '¿Qué figura en mis archivos respecto a las investigaciones psíquicas de 1920?' },
      { id: 'N06', query: 'De acuerdo con mis libros guardados, ¿cuál es la técnica de Monroe?' },
      { id: 'N07', query: 'Según mis apuntes guardados, ¿cómo se produce la exteriorización?' },
      { id: 'N08', query: 'Revisa en mi colección de libros el tratado de Agrippa' },
      { id: 'N09', query: '¿Qué mencionan mis textos sobre la cuerda de plata?' },
      { id: 'N10', query: 'Consulta en mi biblioteca el volumen sobre teosofía práctica' },
      { id: 'N11', query: 'En mis archivos guardados, ¿hay mención de casos de telepatía?' },
      { id: 'N12', query: '¿Qué dice el documento sobre Robert Monroe y sus viajes?' },
      { id: 'N13', query: '¿Qué explican mis libros sobre la catalepsia lúcida?' },
      { id: 'N14', query: 'Revisa en mis notas si guardé la cita de Carrington' },
      { id: 'N15', query: 'Consulta el libro de Rochas sobre la fuerza psíquica' },
    ];

    for (const item of naturalQueries) {
      it(`${item.id}: "${item.query.slice(0, 50)}..." reconoce RAG REQUESTED`, () => {
        const plan = service.evaluate({
          userMessage: item.query,
          classifiedIntent: 'RAG',
        });
        assert.strictEqual(plan.sources.rag, 'REQUESTED');
        assert.strictEqual(plan.ambiguity.contextConfidence, 'high');
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPO 3: 10 EXCLUSIONES EXPLÍCITAS DE RAG
  // ════════════════════════════════════════════════════════════════════════════
  describe('Grupo 3: 10 Exclusiones Explícitas (E01 - E10)', () => {
    const exclusions = [
      { id: 'E01', query: 'Explícame qué es el cordón plateado, pero sin documentos' },
      { id: 'E02', query: '¿Qué es la proyección astral? No consultes mi biblioteca' },
      { id: 'E03', query: 'Definición de hipnosis, sin usar mis archivos' },
      { id: 'E04', query: 'Principios herméticos sin libros ni documentos' },
      { id: 'E05', query: 'Explícame alquimia pero desactiva el RAG' },
      { id: 'E06', query: 'No busques en mis libros sobre Muldoon, responde de memoria general' },
      { id: 'E07', query: '¿Qué es catalepsia? Sin consultar textos ni biblioteca' },
      { id: 'E08', query: 'Diferencia entre cuerpo astral y físico sin usar documentos' },
      { id: 'E09', query: 'Explica telepatía pero sin revisar mis archivos' },
      { id: 'E10', query: 'No consultes mis documentos para explicar la transmutación' },
    ];

    for (const item of exclusions) {
      it(`${item.id}: "${item.query.slice(0, 50)}..." asigna RAG EXCLUDED`, () => {
        const plan = service.evaluate({
          userMessage: item.query,
          classifiedIntent: 'LOCAL',
        });
        assert.strictEqual(plan.sources.rag, 'EXCLUDED');
        assert.strictEqual(plan.exclusions.excludeDocuments, true);
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPO 4: 10 CONSULTAS CONCEPTUALES PURAS (RAG = UNNEEDED)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Grupo 4: 10 Consultas Conceptuales Sin Intención Documental (C01 - C10)', () => {
    const conceptual = [
      { id: 'C01', query: '¿Qué es un embedding vectorial?' },
      { id: 'C02', query: '¿Cómo funciona el algoritmo QuickSort?' },
      { id: 'C03', query: 'Explícame la diferencia entre herencia y composición en POO' },
      { id: 'C04', query: '¿Cuál es la velocidad de escape de la Tierra?' },
      { id: 'C05', query: '¿Cómo ocurre la fotosíntesis en las plantas?' },
      { id: 'C06', query: '¿Qué es la entropía en termodinámica?' },
      { id: 'C07', query: 'Sintaxis de un decorador en TypeScript' },
      { id: 'C08', query: '¿Cuánto es 25 * 4? Explicá la operación' },
      { id: 'C09', query: '¿Qué es el teorema fundamental del cálculo?' },
      { id: 'C10', query: '¿Por qué el cielo es azul?' },
    ];

    for (const item of conceptual) {
      it(`${item.id}: "${item.query.slice(0, 50)}..." asigna RAG UNNEEDED`, () => {
        const plan = service.evaluate({
          userMessage: item.query,
          classifiedIntent: 'LOCAL',
        });
        assert.strictEqual(plan.sources.rag, 'UNNEEDED');
        assert.strictEqual(plan.exclusions.excludeDocuments, false);
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPO 5: 5 CASOS ADVERSARIALES CON SOLICITUDES POSITIVAS Y NEGATIVAS
  // ════════════════════════════════════════════════════════════════════════════
  describe('Grupo 5: 5 Casos Adversariales de Prevalencia Negativa (A01 - A05)', () => {
    const adversarials = [
      { id: 'A01', query: 'Busca en mi biblioteca sobre el cuerpo astral, pero sin documentos' },
      { id: 'A02', query: 'Consulta en mis libros de Rochas, pero no consultes la biblioteca' },
      { id: 'A03', query: 'Revisa mis archivos sobre hipnosis, pero desactiva el RAG' },
      { id: 'A04', query: '¿Qué dice el Kybalion en mi biblioteca? No uses mis documentos' },
      { id: 'A05', query: 'Según mis textos guardados sobre Muldoon, pero sin usar mis textos' },
    ];

    for (const item of adversarials) {
      it(`${item.id}: "${item.query.slice(0, 50)}..." asigna RAG EXCLUDED y reporta conflicto`, () => {
        const plan = service.evaluate({
          userMessage: item.query,
          classifiedIntent: 'RAG',
        });
        assert.strictEqual(plan.sources.rag, 'EXCLUDED', 'EXCLUDED debe prevalecer sobre REQUESTED');
        assert.strictEqual(plan.exclusions.excludeDocuments, true);
        assert.strictEqual(plan.ambiguity.contextConfidence, 'low');
        assert.ok(plan.ambiguity.conflicts.length > 0);
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPO 6: 5 CASOS DE MENCIÓN INCIDENTAL (CERO ACTIVACIÓN RAG)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Grupo 6: 5 Casos de Mención Incidental (I01 - I05)', () => {
    const incidentals = [
      { id: 'I01', query: 'Explícame cómo redactar un documento formal en Microsoft Word' },
      { id: 'I02', query: 'Quiero crear un documento PDF desde Node.js' },
      { id: 'I03', query: '¿Cómo firmar un documento digitalmente con criptografía asimétrica?' },
      { id: 'I04', query: '¿Qué es un archivo PDF y cómo almacena texto?' },
      { id: 'I05', query: '¿Cómo abrir un documento en LibreOffice Writer?' },
    ];

    for (const item of incidentals) {
      it(`${item.id}: "${item.query.slice(0, 50)}..." no activa RAG (RAG = UNNEEDED)`, () => {
        const plan = service.evaluate({
          userMessage: item.query,
          classifiedIntent: 'LOCAL',
        });
        assert.strictEqual(plan.sources.rag, 'UNNEEDED', 'Mención incidental no debe activar RAG');
      });
    }
  });
});
