import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const originalDocId = 13;
  const txtPath = path.join(process.cwd(), 'storage', 'translated', 'Viajes_fuera_del_cuerpo_es.txt');
  const pdfPath = path.join(process.cwd(), 'storage', 'translated', 'Viajes_fuera_del_cuerpo_es.pdf');
  const cachePath = path.join(process.cwd(), 'scratch', 'doc_13_chunks_cache.json');
  const finalTitle = 'Viajes fuera del cuerpo (Journeys Out of the Body)';

  console.log('[Registro Reader] Iniciando registro del libro traducido...');

  if (!fs.existsSync(txtPath)) {
    console.error(`[Error] No se encontró el archivo traducido: ${txtPath}`);
    process.exit(1);
  }

  const fullTranslatedText = fs.readFileSync(txtPath, 'utf8');

  // 1. Crear nuevo documento traducido en PostgreSQL con status='ready' y hidden=false
  const newDoc = await prisma.document.create({
    data: {
      title: finalTitle,
      content: fullTranslatedText,
      category: 'experiencias fuera del cuerpo',
      source: pdfPath,
      status: 'ready', // Disponible inmediatamente para el Reader
      language: 'es',
      translatedFromId: originalDocId,
      progressIndex: 100.0,
      progressEmbed: 0.0,
      progressSummary: 0.0,
      hidden: false,
    },
  });

  console.log(`[Registro Reader] ✅ Documento traducido registrado en BD (Nuevo ID: ${newDoc.id}). Título: "${newDoc.title}"`);

  // 2. Ocultar el documento original en inglés (ID 13) para que el Reader muestre únicamente el traducido
  await prisma.document.update({
    where: { id: originalDocId },
    data: {
      hidden: true,
      category: 'traducido_al_espanol',
    },
  });
  console.log(`[Registro Reader] ✅ Documento original ID ${originalDocId} ocultado en la BD.`);

  // 3. Actualizar la entrada correspondiente en library-index.json si existe
  const indexPath = path.join(process.cwd(), 'src', 'jarvis', 'knowledge', 'library-index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const raw = fs.readFileSync(indexPath, 'utf8');
      const indexData = JSON.parse(raw);
      let updated = false;

      if (Array.isArray(indexData.documentos)) {
        for (const item of indexData.documentos) {
          if (
            item.id === 'lib-plano-astral-journeys-out-of-the-body-ro' ||
            (item.titulo && item.titulo.toLowerCase().includes('journeys out of the body'))
          ) {
            item.titulo = finalTitle;
            item.archivo = 'storage/translated/Viajes_fuera_del_cuerpo_es.pdf';
            item.idioma = 'es';
            updated = true;
          }
        }
      }

      if (updated) {
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
        console.log('[Registro Reader] ✅ library-index.json actualizado con el título e idioma traducidos.');
      }
    } catch (err: any) {
      console.warn(`[Registro Reader] Advertencia al actualizar library-index.json: ${err.message}`);
    }
  }

  await prisma.$disconnect();
  console.log('[Registro Reader] ✅ Proceso completado exitosamente.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Error] Falló el registro del libro traducido:', err);
  process.exit(1);
});
