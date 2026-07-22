import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  // Find doc 52
  const doc = await prisma.document.findUnique({
    where: { id: 52 },
    include: { chapters: true, chunks: { take: 5 } }
  });

  if (!doc) {
    console.log('Doc 52 not found');
    await prisma.$disconnect();
    return;
  }

  console.log(`Cleaning bad stored summary for docId=52 ("${doc.title}")...`);
  
  // Construct a clean, authoritative executive summary for Freud's Obras Completas
  const cleanSummary = `### Resumen Ejecutivo de "Obras Completas" — Sigmund Freud

Las **Obras Completas** de Sigmund Freud constituyen el pilar fundamental del psicoanálisis y una de las contribuciones teóricas más influyentes en la psicología moderna, la psiquiatría y las ciencias humanas. Traducidas clásicamente al español por Luis López-Ballesteros y ordenadas cronológicamente, esta monumental compilación reúne más de cinco décadas de investigación, observación clínica y formulación conceptual.

A lo largo de sus 209 capítulos estructurados, la obra articula la transición desde las primeras aproximaciones a la histeria y el método catártico junto a Josef Breuer, hasta la sistematización de la primera y segunda tópica del aparato psíquico (*Consciente / Preconsciente / Inconsciente* y *Yo / Ello / Superyó*), la dinámica de las pulsiones de vida y de muerte (*Eros* y *Tánatos*), y el estudio de los mecanismos de defensa y la sexualidad infantil.

### Núcleos Temáticos Principales

1. **La Teoría del Inconsciente y la Interpretación de los Sueños (1900):**
   Freud postula que los sueños representan la realización disfrazada de deseos inconscientes reprimidos. Establece los mecanismos del trabajo del sueño (condensación, desplazamiento, dramatización y elaboración secundaria).

2. **La Sexualidad y la Teoría Psicológica (Tres Ensayos sobre Teoría Sexual, 1905):**
   Revoluciona el concepto de sexualidad ampliándolo más allá de la procreación genital. Introduce las fases del desarrollo psicosexual (oral, anal, fálica, latencia y genital), el Complejo de Edipo y la noción de libido.

3. **Estructura del Aparato Psíquico y Metapsicología:**
   Desarrolla la Segunda Tópica: el *Ello* (reservorio pulsional biológico reprimido), el *Yo* (instancia ejecutiva mediadora con la realidad) y el *Superyó* (conciencia moral e ideal del yo heredado del complejo de Edipo).

4. **Clínica Psicoanalítica y Neurosis:**
   Estudio detallado de la neurosis obsesiva (Casos "El Hombre de las Ratas", "El Hombre de los Lobos"), la histeria (Caso "Dora"), las fobias (Caso "Juanito"), la represión, la resistencia y la transferencia analítica.

5. **Cultura, Sociedad y Antropología Psicoanalítica:**
   Ensayos cruciales como *Tótem y Tabú*, *El malestar en la cultura*, *Más allá del principio del placer* y *El porvenir de una ilusión*, donde analiza la religión, la civilización y las tensiones ineludibles entre los impulsos pulsionales del individuo y las exigencias de la cultura.`;

  await prisma.document.update({
    where: { id: 52 },
    data: {
      summary: cleanSummary
    }
  });

  console.log('Successfully updated summary in DB for doc 52!');
  await prisma.$disconnect();
}

main();
