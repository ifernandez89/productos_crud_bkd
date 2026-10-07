import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Cargar .env
const envPath = join(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?/);
  if (match) process.env[match[1]] = match[2].trim();
}

console.log('=== TEST DE DISCIPLINAS Y SELECTOR DE ESPECIALISTAS ===\n');

// Importar modulos compilados
const { getAvailableDisciplines, normalizeDiscipline } = await import('../dist/shared/disciplines.js');
const { ModelRouterService } = await import('../dist/aichat/utils/model-router.service.js');

// 1. Listar catálogo de especialistas para el selector del frontend
const disciplines = getAvailableDisciplines();
console.log('📋 Especialistas disponibles para el Selector del Front:');
console.table(
  disciplines.map(d => ({
    Tag: d.id,
    Nombre: `${d.icon} ${d.name}`,
    Modelo: d.model,
    Categoria: d.category,
    Descripcion: d.description.slice(0, 45) + '...',
  }))
);

// 2. Probar normalización
console.log('\n🧭 Pruebas de normalización de etiquetas:');
const testTags = ['coder', 'CODE', 'traductor', 'lector', 'chatbot', 'chat', 'pdf', 'ocr', 'video', 'desconocido'];
for (const tag of testTags) {
  console.log(`  "${tag}" → normalizado: "${normalizeDiscipline(tag)}"`);
}

// 3. Probar Router
console.log('\n🔀 Pruebas de Ruteo (ModelRouterService):');
const router = new ModelRouterService();

const testQueries = [
  { prompt: '¿Cómo estás hoy?', mode: 'chatbot' },
  { prompt: 'Crea un servicio en NestJS con Drizzle ORM', mode: 'coder' },
  { prompt: 'Escribe una función recursiva en Python', mode: undefined }, // Auto detect code
  { prompt: '¿Qué tiempo hace en París?', mode: undefined }, // Auto detect general
  { prompt: 'Traduce este párrafo a inglés', mode: 'traductor' },
];

for (const q of testQueries) {
  const decision = router.routeToModel(q.prompt, q.mode);
  console.log(`  Query: "${q.prompt.slice(0, 35)}..." [mode: ${q.mode || 'auto'}]`);
  console.log(`    ↳ Especialista: ${decision.discipline.toUpperCase()} | Modelo: ${decision.model} | Razón: ${decision.reason}\n`);
}

console.log('✅ Todas las pruebas de disciplinas y ruteo pasaron correctamente.');
