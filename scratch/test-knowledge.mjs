import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const dir = join(process.cwd(), 'src', 'jarvis', 'knowledge');

function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getAllItemArrays(data) {
  const result = [];
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (!Array.isArray(val) || val.length === 0) continue;
    const firstItem = val[0];
    if (typeof firstItem !== 'object' || firstItem === null) continue;
    const itemKeys = Object.keys(firstItem);
    if (itemKeys.every(k => /^\d+$/.test(k))) continue;
    result.push({ key, items: val });
  }
  return result;
}

function getKeywords(item) {
  const raw = [];
  for (const field of ['nombre','title','titulo','nombreAlternativo','slug','nombreCientifico']) {
    if (typeof item[field] === 'string') raw.push(item[field]);
  }
  for (const field of ['sinonimos','acciones']) {
    if (Array.isArray(item[field])) item[field].forEach(v => typeof v === 'string' && raw.push(v));
  }
  const primary = item.nombre || item.title || item.titulo;
  if (primary) primary.split(/[\(\)\-\—\/,]/).forEach(p => { const t = p.trim(); if (t.length >= 3) raw.push(t); });
  return [...new Set(raw)].map(k => normalize(k)).filter(k => k.length >= 3);
}

// Tests — item específico
const tests = [
  'para qué sirve el cedrón',
  'cómo se cura la culebrilla',
  'cuéntame sobre el hampe karpay',
];

// Tests — base completa y búsquedas avanzadas
const wholeDbTests = [
  'qué es el munay ki',
  'plantas medicinales para la digestión',
  'que plantas tenemos registradas',
  'karpay iniciaciones andinas',
  'sanaciones populares argentinas',
];

function getExtendedKeywords(item) {
  const raw = [];
  // Campos de texto directo
  for (const field of ['nombre','title','titulo','nombreAlternativo','slug','nombreCientifico','categoria']) {
    if (typeof item[field] === 'string') raw.push(item[field]);
  }
  // Arrays de texto
  for (const field of ['sinonimos','nombres','aliases','acciones','aplicacion','chakras','centrosDePoder','conexion','efecto','accionTerapeutica','propiedad']) {
    if (Array.isArray(item[field])) item[field].forEach(v => typeof v === 'string' && raw.push(v));
  }
  const primary = item.nombre || item.title || item.titulo;
  if (primary) primary.split(/[\(\)\-\—\/,]/).forEach(p => { const t = p.trim(); if (t.length >= 3) raw.push(t); });
  return [...new Set(raw)].map(k => normalize(k)).filter(k => k.length >= 3);
}

function matchesWholeDatabase(normalizedQuery, file) {
  const dbKey = file.replace('.json', '');
  const aliases = {
    munay_ki: ['munay ki', 'munay-ki', 'ritos del inca', 'iniciaciones andinas', 'karpay'],
    plantas_medicinales: ['planta medicinal', 'plantas medicinales', 'hierbas medicinales', 'herbolaria', 'fitoterapia'],
    sanaciones_populares: ['sanacion popular', 'sanaciones populares', 'curas populares', 'remedios populares'],
  };
  const terms = [normalize(dbKey.replace(/[-_]/g, ' ')), ...(aliases[dbKey] ?? [])];
  return terms.some(t => normalizedQuery.includes(t));
}

console.log('🧪 PRUEBAS DE BÚSQUEDA INDIVIDUAL:');
for (const query of tests) {
  const normalized = normalize(query);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const found = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const arrays = getAllItemArrays(data);

    for (const { items } of arrays) {
      for (const item of items) {
        const kws = getExtendedKeywords(item);
        for (const kw of kws) {
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          try {
            if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
              found.push(`${file} → ${item.nombre || item.title || item.titulo}`);
              break;
            }
          } catch { if (normalized.includes(kw)) { found.push(`${file} → ${item.nombre||item.title}`); break; } }
        }
      }
    }
  }

  console.log(`\n"${query}"`);
  if (found.length) found.forEach(f => console.log(`  ✅ ${f}`));
  else console.log(`  ⚠️  Sin resultados`);
}

console.log('\n\n🗃️ PRUEBAS DE BASE COMPLETA Y BÚSQUEDAS AVANZADAS:');
for (const query of wholeDbTests) {
  const normalized = normalize(query);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const found = [];
  let matchedWhole = false;

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    
    // Estrategia 1: Match de item específico (mejorado)
    const arrays = getAllItemArrays(data);
    for (const { items } of arrays) {
      for (const item of items) {
        const kws = getExtendedKeywords(item);
        for (const kw of kws) {
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          try {
            if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
              found.push(`${file} → ${item.nombre || item.title || item.titulo}`);
              break;
            }
          } catch { if (normalized.includes(kw)) { found.push(`${file} → ${item.nombre||item.title}`); break; } }
        }
      }
    }
    
    // Estrategia 2: Match de base completa
    if (matchesWholeDatabase(normalized, file) && found.length === 0) {
      const dbName = file.replace('.json', '').replace(/[-_]/g, ' ');
      const main = arrays.sort((a, b) => b.items.length - a.items.length)[0];
      if (main) {
        const names = main.items.slice(0, 3).map(i => i.nombre || i.title || i.titulo).filter(Boolean);
        found.push(`${file} (base completa) — Ejemplos: ${names.join(', ')}`);
        matchedWhole = true;
      }
    }
  }

  console.log(`\n"${query}"`);
  if (found.length) {
    if (matchedWhole) console.log(`  🗃️ ${found[0]}`);
    else found.forEach(f => console.log(`  ✅ ${f}`));
  } else {
    console.log(`  ⚠️  Sin resultados`);
  }
}
