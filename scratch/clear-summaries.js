const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Iniciando limpieza de resúmenes (summary = null) para todos los documentos...');
  
  const result = await prisma.document.updateMany({
    data: {
      summary: null
    }
  });

  console.log(`✅ ¡Completado! Se resetearon ${result.count} documentos. Los resúmenes se regenerarán con el nuevo formato en su próxima consulta.`);
}

main()
  .catch((e) => {
    console.error('❌ Error al ejecutar el script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
