import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const INDEX_PATH = join(process.cwd(), 'src/jarvis/knowledge/music-index.json');
const REFS_PATH = join(process.cwd(), 'src/jarvis/knowledge/music-references.json');

const catalog = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));

const generosMap = {};
const moodsMap = {};
const artistasRef = [];

for (const a of catalog.artistas) {
  artistasRef.push({
    nombre: a.nombre,
    generos: a.generos,
    totalAlbumes: a.totalAlbumes,
    albumesDestacados: a.albumes.slice(0, 3).map(alb => alb.titulo),
    moods: a.moods
  });

  for (const g of a.generos) {
    if (!generosMap[g]) generosMap[g] = [];
    generosMap[g].push(a.nombre);
  }

  for (const m of a.moods) {
    if (!moodsMap[m]) moodsMap[m] = [];
    moodsMap[m].push(a.nombre);
  }
}

const references = {
  version: 1,
  totalArtistas: catalog.metadata.totalArtistas,
  totalAlbumes: catalog.metadata.totalAlbumes,
  rutaColeccion: catalog.metadata.origenRuta,
  generosDisponibles: generosMap,
  recomendacionesPorMood: moodsMap,
  artistas: artistasRef
};

writeFileSync(REFS_PATH, JSON.stringify(references, null, 2), 'utf-8');
console.log(`[MusicReferences] ✅ music-references.json generado exitosamente en: ${REFS_PATH}`);
