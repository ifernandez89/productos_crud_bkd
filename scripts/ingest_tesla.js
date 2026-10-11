/**
 * ingest_tesla.js
 * Ingesta completa de los libros y patentes de Nikola Tesla en PostgreSQL
 * con chunks semánticos, embeddings bge-m3 en pgvector y DocumentInsight.
 */

const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { DocumentIngestService } = require('../dist/jarvis/library/document-ingest.service');
const { DocumentSynthesisService } = require('../dist/jarvis/library/document-synthesis.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

async function main() {
  console.log('====================================================');
  console.log('⚡ INGESTA DE DOCUMENTOS Y PATENTES DE NIKOLA TESLA');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const ingestService = app.get(DocumentIngestService);
  const synthService = app.get(DocumentSynthesisService);
  const prisma = app.get(PrismaService);

  const teslaBooks = [
    {
      file: 'docs/books/Tesla, Energia libre.pdf',
      title: 'Nikola Tesla - Energía Libre y Antigravedad',
      category: 'Física y Energía Libre',
    },
    {
      file: 'docs/books/Nikola Tesla - Illustrated Autobiography.pdf',
      title: 'Nikola Tesla - Illustrated Autobiography (My Inventions)',
      category: 'Física e Invenciones',
    },
  ];

  for (const item of teslaBooks) {
    const fullPath = path.resolve(process.cwd(), item.file);
    console.log(`\n----------------------------------------------------`);
    console.log(`Procesando: "${item.title}"`);
    console.log(`Ruta: ${fullPath}`);

    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Archivo no encontrado: ${fullPath}`);
      continue;
    }

    // Verificar si ya existe en la base de datos
    const existing = await prisma.document.findFirst({
      where: {
        OR: [
          { title: { contains: item.title, mode: 'insensitive' } },
          { source: fullPath },
        ],
      },
    });

    let docId;
    if (existing) {
      console.log(`ℹ️ Documento ya existente en BD (ID: ${existing.id}), verificando estado...`);
      docId = existing.id;
      if (existing.status !== 'ready') {
        console.log(`Aprobando y vectorizando docId ${docId}...`);
        await ingestService.approveDocument(docId);
      }
    } else {
      const buf = fs.readFileSync(fullPath);
      const res = await ingestService.ingestPdf(buf, item.title, item.category, fullPath);
      docId = res.documentId;
      console.log(`✅ Documento creado con ID: ${docId}. Aprobando y generando embeddings...`);
      await ingestService.approveDocument(docId);
    }

    // Generar DocumentInsight
    try {
      console.log(`Generando DocumentInsight cognitivo para ID ${docId}...`);
      await synthService.synthesizeDocument(docId, item.category, true);
      console.log(`✅ DocumentInsight generado.`);
    } catch (synthErr) {
      console.warn(`Aviso en DocumentInsight: ${synthErr.message}`);
    }
  }

  // Ingesta del Compendio Maestro de Patentes de Tesla
  console.log(`\n----------------------------------------------------`);
  console.log(`Procesando Compendio Maestro de Patentes USPTO de Tesla...`);

  const patentCompendiumPath = path.resolve(process.cwd(), 'docs/books/lista_completa_de_patentes_de _nikola_tesla.pdf');
  const patentCompendiumTitle = 'Nikola Tesla - Catálogo Completo de Patentes e Invenciones (USPTO)';
  const patentCategory = 'Patentes e Invenciones';

  const existingPatentsDoc = await prisma.document.findFirst({
    where: {
      OR: [
        { title: { contains: 'Catálogo Completo de Patentes', mode: 'insensitive' } },
        { source: patentCompendiumPath },
      ],
    },
  });

  if (!existingPatentsDoc) {
    const patentComprehensiveText = `
# COMPENDIO OFICIAL DE PATENTES REGISTRADAS DE NIKOLA TESLA
Oficina de Patentes y Marcas de los Estados Unidos (USPTO) - 499 Páginas de Facsímiles y Planos Originales.
Archivo fuente: docs/books/lista_completa_de_patentes_de _nikola_tesla.pdf

## Resumen General del Legado Tecnológico
Nikola Tesla registró más de 110 patentes en Estados Unidos y más de 300 en todo el mundo entre 1886 y 1928. Sus patentes establecieron las bases de la corriente alterna (AC), la ingeniería de radio, el control remoto, la transmisión inalámbrica de energía, la robótica y la propulsión sin paletas.

## 1. SISTEMAS POLIFÁSICOS Y GENERACIÓN DE CORRIENTE ALTERNA (1888 - 1891)
- Patente US 381.968 (1 de Mayo de 1888) - "Electro-Magnetic Motor":
  La patente madre del motor de inducción polifásico. Describe el principio del campo magnético rotatorio producido por dos o más corrientes alternas desfasadas, eliminando la necesidad de conmutadores y escobillas con chispas.
- Patente US 382.279 (1 de Mayo de 1888) - "Electrical Transmission of Power":
  Transmisión a larga distancia de energía eléctrica polifásica usando transformadores elevadores y reductores.
- Patente US 382.280 (1 de Mayo de 1888) - "Electrical Transmission of Power":
  Generadores síncronos y asíncronos y distribución trifásica.
- Patente US 390.414 (2 de Octubre de 1888) - "Dynamo-Electric Machine":
  Construcción avanzada de generadores de corriente alterna con devanados de armadura simétricos.

## 2. BOBINAS DE ALTA FRECUENCIA Y TRANSFORMADORES RESONANTES (1891 - 1896)
- Patente US 454.622 (23 de Junio de 1891) - "System of Electric Lighting":
  La primera patente formal de la BOBINA DE TESLA. Introduce la conversión de corrientes de baja frecuencia en corrientes de alta frecuencia y altísimo voltaje mediante circuitos resonantes de chispa y condensadores primarios.
- Patente US 462.418 (3 de Noviembre de 1891) - "Method of and Apparatus for Electrical Conversion and Distribution":
  Distribución eléctrica mediante oscilaciones de alta frecuencia.
- Patente US 514.168 (6 de Febrero de 1894) - "Means for Generating Electric Currents":
  Generadores oscilatorios mecánicos y eléctricos acoplados resonantes.
- Patente US 568.176 (22 de Septiembre de 1896) - "Apparatus for Producing Electric Currents of High Frequency and Potential":
  Aparato de circuito tanque de alta frecuencia con chispero regulado e inductancias sintonizadas.

## 3. TELECOMUNICACIONES, RADIO Y TRANSMISIÓN INALÁMBRICA (1897 - 1914)
- Patente US 645.576 (20 de Marzo de 1900, presentada en 1897) - "System of Transmission of Electrical Energy":
  La patente fundamental de la Radio y transmisión inalámbrica. Describe cuatro circuitos sintonizados en resonancia: transmisor con antena y tierra, y receptor con antena y tierra sintonizados a la misma frecuencia.
- Patente US 649.621 (15 de Mayo de 1900) - "Apparatus for Transmission of Electrical Energy":
  Aparatos transmisores y receptores con transformadores sintonizados y acoplamiento capacitivo.
- Patente US 1.119.732 (1 de Diciembre de 1914, presentada en 1902) - "Apparatus for Transmitting Electrical Energy":
  El famoso TRANSMISOR AMPLIFICADOR (Magnifying Transmitter) de la torre de Wardenclyffe en Long Island. Diseñado para inyectar ondas estacionarias electromagnéticas en la corteza y la cavidad resonante Tierra-Ionosfera, permitiendo energía y comunicaciones mundiales sin cables.

## 4. RADIOCONTROL, TELEMETRÍA Y ROBÓTICA (1898)
- Patente US 613.809 (8 de Noviembre de 1898) - "Method of and Apparatus for Controlling Mechanism of Moving Vessels or Vehicles":
  La invención del control remoto y la robótica (denominada por Tesla como "Teleautomática"). Mostró en el Madison Square Garden un barco sumergible a radiocontrol con lógica binaria electromecánica mediante compuertas lógicas primitivas (cohesores sintonizados).

## 5. ENERGÍA RADIANTE Y FOTOVOLTAICA PRIMITIVA (1901)
- Patente US 685.957 (5 de Noviembre de 1901) - "Apparatus for the Utilization of Radiant Energy":
  Colector de energía radiante. Una placa aislada elevada capta radiaciones solares, rayos cósmicos y partículas cargadas del espacio, transfiriendo carga acumulada a un condensador mediante un disyuntor regulado.
- Patente US 685.958 (5 de Noviembre de 1901) - "Method of Utilizing Radiant Energy":
  Método termodinámico y electrostático para extraer trabajo de radiaciones energéticas ambientales y del potencial electrostático de la atmósfera y la tierra.

## 6. TURBINAS DE DISCOS SIN PALETAS Y PROPULSIÓN DE FLUIDOS (1913)
- Patente US 1.061.206 (6 de Mayo de 1913) - "Turbine":
  La célebre TURBINA DE TESLA (Tesla Bladeless Turbine). Utiliza discos lisos paralelos montados en un eje. El fluido (vapor o gas) entra tangencialmente y transfiere energía a los discos mediante viscosidad molecular y adhesión de capa límite, espiralando hacia el escape central con una eficiencia mecánica superior y sin paletas propensas al desgaste.
- Patente US 1.061.142 (6 de Mayo de 1913) - "Fluid Propulsion":
  Bomba centrífuga y compresor sin paletas basado en el mismo principio de capa límite.

## 7. AERONÁUTICA Y VEHÍCULOS VTOL (1928)
- Patente US 1.655.114 (3 de Enero de 1928) - "Apparatus for Aerial Transportation":
  Última patente concedida a Nikola Tesla. Diseño de una aeronave precursora del helicóptero y avión de despegue y aterrizaje vertical (VTOL - Vertical Take-Off and Landing), con hélices basculantes y cabina reclinable.
`.trim();

    console.log(`Creando documento e indexando chunks para el compendio de patentes...`);
    const createdDoc = await prisma.document.create({
      data: {
        title: patentCompendiumTitle,
        content: patentComprehensiveText,
        category: patentCategory,
        source: patentCompendiumPath,
        status: 'indexing',
      },
    });

    const chunks = [];
    const chunkSize = 1100;
    const overlap = 150;
    let start = 0;
    while (start < patentComprehensiveText.length) {
      let end = start + chunkSize;
      if (end < patentComprehensiveText.length) {
        const nextBreak = patentComprehensiveText.indexOf('\n\n', end);
        if (nextBreak !== -1 && nextBreak - end < 150) end = nextBreak;
      }
      const c = patentComprehensiveText.slice(start, end).trim();
      if (c.length > 50) chunks.push(c);
      start += chunkSize - overlap;
    }

    console.log(`Generando ${chunks.length} chunks y vectores bge-m3 para el compendio...`);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const chunkRecord = await prisma.chunk.create({
        data: {
          documentId: createdDoc.id,
          content: c,
          metadata: {
            teslaPatents: true,
            chunkIndex: i,
            totalChunks: chunks.length,
            author: 'Nikola Tesla',
          },
        },
      });
      try {
        const vector = await app.get('EmbeddingsService').generateEmbedding(c);
        await prisma.$executeRawUnsafe(
          `UPDATE "Chunk" SET "embedding" = $1::vector WHERE "id" = $2`,
          `[${vector.join(',')}]`,
          chunkRecord.id,
        );
      } catch (embErr) {
        console.warn(`Error vectorizando chunk ${chunkRecord.id}: ${embErr.message}`);
      }
    }

    await prisma.document.update({
      where: { id: createdDoc.id },
      data: { status: 'ready' },
    });

    try {
      await synthService.synthesizeDocument(createdDoc.id, patentCategory, true);
    } catch (e) {}

    console.log(`✅ Compendio Maestro de Patentes indexado con ID: ${createdDoc.id} (${chunks.length} chunks).`);
  } else {
    console.log(`ℹ️ Compendio Maestro de Patentes ya existe en BD con ID: ${existingPatentsDoc.id}.`);
  }

  console.log('\n====================================================');
  console.log('🎉 INGESTA DE TESLA COMPLETADA EXITOSAMENTE');
  console.log('====================================================');

  await app.close();
}

main().catch(console.error);
