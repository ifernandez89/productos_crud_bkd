import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentSynthesisService } from '../src/jarvis/library/document-synthesis.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  console.log('================================================================');
  console.log('🧠 PIPELINE DE SÍNTESIS ESTRUCTURADA — PLANO ASTRAL 🧠');
  console.log('================================================================\n');
  console.log('Estrategia: Map-Reduce por libro → ficha narrativa pre-computada');
  console.log('  MAP:    chunks → LLM extrae historias, conceptos, citas, técnicas');
  console.log('  REDUCE: consolida secciones → guarda en DocumentInsight\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const synthesisService = app.get(DocumentSynthesisService);
  const prisma = app.get(PrismaService);

  // Obtener los documentos de Plano Astral ya indexados
  const docs = await prisma.document.findMany({
    where: {
      status: 'ready',
      OR: [
        { category: { contains: 'astral' } },
        { title: { contains: 'Astral' } },
        { title: { contains: 'Projection' } },
        { title: { contains: 'Journeys' } },
        { title: { contains: 'Multi-Dimensional' } },
      ],
    },
    select: { id: true, title: true, category: true },
  });

  console.log(`📚 Documentos de Plano Astral encontrados: ${docs.length}\n`);
  docs.forEach(d => console.log(`   [ID ${d.id}] ${d.title} (cat: ${d.category})`));
  console.log('');

  if (docs.length === 0) {
    console.log('⚠️  No se encontraron documentos. Asegurate de haber ejecutado primero ingest-plano-astral-db.ts');
    await app.close();
    return;
  }

  const results = [];

  for (const doc of docs) {
    console.log(`\n════════════════════════════════════════════════════════`);
    console.log(`🗺️  MAP-REDUCE [${docs.indexOf(doc) + 1}/${docs.length}]: "${doc.title}"`);
    console.log(`════════════════════════════════════════════════════════`);

    const result = await synthesisService.synthesizeDocument(doc.id, 'plano_astral', false);
    results.push(result);

    if (result.status === 'error') {
      console.log(`❌ Error: ${result.error}`);
    } else if (result.status === 'skipped') {
      console.log(`⏭️  Skipped (insight ya existe). Usá force=true para re-generar.`);
    } else {
      console.log(`✅ Insight generado:`);
      if (result.insight) {
        console.log(`   Autor detectado: ${result.insight.author}`);
        console.log(`   Tesis central: ${result.insight.centralThesis ?? '(no extraída)'}`);
        console.log(`   Historias: ${result.insight.highlightedStories.length}`);
        result.insight.highlightedStories.forEach((s, i) => console.log(`     ${i + 1}. ${s}`));
        console.log(`   Conceptos: ${result.insight.coreConcepts.join(' | ')}`);
        console.log(`   Citas: ${result.insight.notableQuotes.length}`);
        console.log(`   Técnicas: ${result.insight.practicalTechniques.join(' | ')}`);
      }
    }

    // Pausa entre libros para no saturar el modelo
    if (docs.indexOf(doc) < docs.length - 1) {
      console.log('\n⏳ Esperando 5 segundos antes del siguiente libro...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Comparación cross-autor
  console.log('\n════════════════════════════════════════════════════════');
  console.log('📊 GENERANDO COMPARACIÓN CROSS-AUTOR...');
  console.log('════════════════════════════════════════════════════════');

  const collResult = await synthesisService.synthesizeCollection('plano_astral', false);

  console.log('\n📝 Comparación Cross-Autor:');
  console.log(collResult.crossAuthorComparison ?? '(no generada)');

  // Resumen final
  console.log('\n════════════════════════════════════════════════════════');
  console.log('📊 RESUMEN FINAL');
  console.log('════════════════════════════════════════════════════════');
  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`  ✅ Creados:    ${created}`);
  console.log(`  🔄 Actualizados: ${updated}`);
  console.log(`  ⏭️  Skipped:    ${skipped}`);
  console.log(`  ❌ Errores:    ${errors}`);
  console.log('\n🎉 PIPELINE COMPLETADO\n');
  console.log('Los insights están disponibles en la tabla DocumentInsight.');
  console.log('Podés consultarlos via: POST /jarbees/library/synthesis/query');
  console.log('Ejemplo: { "collection": "plano_astral", "field": "highlightedStories" }');

  await app.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
