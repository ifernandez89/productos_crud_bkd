const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('G:\\Projects2\\PlantasMedicinales\\node_modules\\sharp');
const matter = require('G:\\Projects2\\PlantasMedicinales\\node_modules\\gray-matter');

const PLANTAS_DIR = 'G:\\Projects2\\PlantasMedicinales\\content\\plantas';
const IMAGENES_DIR = 'G:\\Projects2\\PlantasMedicinales\\public\\imagenes';
const CREDITS_PATH = path.join(IMAGENES_DIR, 'patagonia-credits.json');

const HEADERS = {
  'User-Agent': 'JarBeesHerbarium/1.0 (https://github.com/ifernandez89/PlantasMedicinales; botanical educational catalog)',
  Accept: 'application/json, image/*;q=0.9',
};

const SYNONYM_FALLBACKS = {
  calafate: ['Berberis microphylla', 'Berberis buxifolia'],
  'yerba-del-lagarto': ['Synammia feuillei', 'Polypodium feuillei'],
  'menta-alemana': ['Mentha suaveolens', 'Mentha rotundifolia'],
  'vira-vira': ['Pseudognaphalium viravira', 'Gnaphalium viravira', 'Pseudognaphalium'],
  'rosa-mosqueta': ['Rosa rubiginosa', 'Rosa eglanteria'],
  solupe: ['Ephedra ochreata', 'Ephedra chilensis'],
  patagua: ['Myrceugenia exsucca', 'Myrceugenia planipes'],
  pitra: ['Myrceugenia pitra', 'Myrceugenia exsucca'],
  natre: ['Solanum crispum', 'Solanum gayanum'],
  panil: ['Buddleja globosa', 'Buddleja araucana'],
  canchalagua: ['Centaurium cachanlahuen', 'Zeltnera cachanlahuen', 'Centaurium erythraea'],
  nancolahuen: ['Valeriana carnosa'],
  cadillo: ['Acaena magellanica', 'Acaena ovalifolia'],
  charcao: ['Senecio filaginoides', 'Senecio bracteolatus'],
  huautro: ['Baccharis magellanica'],
  quilembai: ['Chuquiraga avellanedae'],
  'regaliz-silvestre': ['Glycyrrhiza astragalina'],
  'tomillo-silvestre': ['Acantholippia seriphioides'],
  duraznillo: ['Colliguaja integerrima'],
  paramela: ['Adesmia boronioides'],
};

const OPEN_INAT_LICENSES = new Set(['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa', 'pd']);

function extractBinomial(sci) {
  if (!sci) return '';
  const cleaned = sci
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z\s-]/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return parts[0] || '';
}

function isBadImageName(nameOrUrl) {
  const s = String(nameOrUrl || '').toLowerCase();
  return (
    /\.svg(\?|$)|\.tif(\?|$)|\.gif(\?|$)/.test(s) ||
    /(herbarium|mhnt|mnhn|kew|museum|specimen|exsiccata|map|mapa|distrib|range|flag|logo|icon|coat_of_arms|signature|diagram|formula|structure|molecule|chemical)/.test(
      s,
    )
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function queryINaturalist(binomial) {
  try {
    const res = await axios.get('https://api.inaturalist.org/v1/taxa', {
      params: { q: binomial, rank: 'species', per_page: 5 },
      headers: HEADERS,
      timeout: 15000,
    });
    const results = res.data?.results || [];
    const exact =
      results.find(
        (t) =>
          String(t.name || '').toLowerCase() === binomial.toLowerCase() &&
          t.default_photo &&
          (t.default_photo.medium_url || t.default_photo.original_url),
      ) ||
      results.find(
        (t) =>
          String(t.name || '').toLowerCase().startsWith(binomial.toLowerCase().split(' ')[0]) &&
          t.default_photo &&
          (t.default_photo.medium_url || t.default_photo.original_url),
      );

    if (!exact) return null;
    const p = exact.default_photo;
    const license = String(p.license_code || '').toLowerCase();
    // Preferir CC/PD; si el taxon tiene default_photo con licencia abierta usar versión large/original
    if (!OPEN_INAT_LICENSES.has(license)) {
      // Buscar una foto CC abierta en taxon_photos
      const detail = await axios.get(`https://api.inaturalist.org/v1/taxa/${exact.id}`, {
        headers: HEADERS,
        timeout: 15000,
      });
      const photos = detail.data?.results?.[0]?.taxon_photos || [];
      const openPhoto = photos
        .map((tp) => tp.photo)
        .find((ph) => ph && OPEN_INAT_LICENSES.has(String(ph.license_code || '').toLowerCase()));
      if (!openPhoto) return null;
      const url = (openPhoto.large_url || openPhoto.medium_url || openPhoto.url || '').replace(
        '/square.',
        '/large.',
      );
      if (!url) return null;
      return {
        url,
        source: 'iNaturalist',
        license: openPhoto.license_code,
        attribution: openPhoto.attribution || `iNaturalist (${exact.name})`,
        matchedTaxon: exact.name,
      };
    }

    const url = (p.large_url || p.original_url || p.medium_url || p.url || '').replace(
      '/square.',
      '/large.',
    );
    if (!url) return null;
    return {
      url,
      source: 'iNaturalist',
      license: p.license_code,
      attribution: p.attribution || `iNaturalist (${exact.name})`,
      matchedTaxon: exact.name,
    };
  } catch {
    return null;
  }
}

async function queryWikipedia(lang, title) {
  try {
    const res = await axios.get(`https://${lang}.wikipedia.org/w/api.php`, {
      params: {
        action: 'query',
        format: 'json',
        titles: title,
        redirects: 1,
        prop: 'pageimages|info',
        piprop: 'original|thumbnail',
        pithumbsize: 1200,
      },
      headers: HEADERS,
      timeout: 15000,
    });
    const pages = Object.values(res.data?.query?.pages || {});
    for (const page of pages) {
      if (page.missing !== undefined) continue;
      const candidate = page.thumbnail?.source || page.original?.source;
      if (!candidate || isBadImageName(candidate)) continue;
      return {
        url: candidate,
        source: `Wikipedia (${lang})`,
        license: 'CC BY-SA / Wikimedia Commons',
        attribution: `Wikimedia Commons via ${lang}.wikipedia.org (${page.title})`,
        matchedTaxon: page.title,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function queryWikimediaCommons(query) {
  try {
    const res = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        format: 'json',
        generator: 'search',
        gsrnamespace: 6,
        gsrsearch: `${query} filetype:bitmap`,
        gsrlimit: 8,
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: 1200,
      },
      headers: HEADERS,
      timeout: 15000,
    });
    const pages = Object.values(res.data?.query?.pages || {});
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      if (!/^image\/(jpeg|png|webp)$/i.test(info.mime || '')) continue;
      if ((info.width || 0) < 400 || (info.height || 0) < 300) continue;
      if (isBadImageName(page.title) || isBadImageName(info.url)) continue;
      const meta = info.extmetadata || {};
      const license = meta.LicenseShortName?.value || 'Wikimedia Commons Open License';
      const artist = String(meta.Artist?.value || 'Wikimedia Commons')
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 120);
      return {
        url: info.thumburl || info.url,
        source: 'Wikimedia Commons',
        license,
        attribution: `${artist} (${page.title})`,
        matchedTaxon: query,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function downloadAndConvert(url, outWebpPath) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: HEADERS,
    timeout: 25000,
    maxContentLength: 25 * 1024 * 1024,
  });
  const buf = Buffer.from(res.data);
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height || meta.width < 250 || meta.height < 200) {
    throw new Error(`Imagen demasiado pequeña (${meta.width}x${meta.height})`);
  }
  await sharp(buf)
    .rotate()
    .resize(1200, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outWebpPath);

  const outStat = fs.statSync(outWebpPath);
  return {
    width: Math.min(meta.width, 1200),
    height: meta.height,
    sizeKB: Math.round(outStat.size / 1024),
  };
}

function updateMarkdownImage(mdPath, imageWebPath) {
  const raw = fs.readFileSync(mdPath, 'utf8');
  if (/^imagen:\s*["']?\/imagenes\//m.test(raw)) return false;
  const updated = raw.replace(/^imagen:\s*.*$/m, `imagen: "${imageWebPath}"`);
  if (updated !== raw) {
    fs.writeFileSync(mdPath, updated, 'utf8');
    return true;
  }
  return false;
}

async function main() {
  fs.mkdirSync(IMAGENES_DIR, { recursive: true });
  const files = fs
    .readdirSync(PLANTAS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const targets = [];
  for (const f of files) {
    const full = path.join(PLANTAS_DIR, f);
    const parsed = matter(fs.readFileSync(full, 'utf8'));
    const img = String(parsed.data.imagen || '').trim();
    const slug = parsed.data.slug || f.replace(/\.md$/, '');
    const expectedPath = path.join(IMAGENES_DIR, `${slug}.webp`);
    if (!img || !fs.existsSync(path.join('G:\\Projects2\\PlantasMedicinales\\public', img.replace(/^\//, '')))) {
      // Solo procesar las plantas sin imagen asignada (o cuya imagen aún no existe)
      if (!img) {
        targets.push({
          file: f,
          fullPath: full,
          slug,
          nombre: parsed.data.nombre || slug,
          sci: parsed.data.nombreCientifico || '',
          expectedPath,
        });
      }
    }
  }

  console.log(`🌿 Plantas sin imagen a procesar: ${targets.length}`);

  let credits = {};
  if (fs.existsSync(CREDITS_PATH)) {
    try {
      credits = JSON.parse(fs.readFileSync(CREDITS_PATH, 'utf8'));
    } catch {}
  }

  const ok = [];
  const failed = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const primaryBin = extractBinomial(t.sci);
    const candidates = Array.from(
      new Set([...(SYNONYM_FALLBACKS[t.slug] || []), primaryBin].filter(Boolean)),
    );

    let hit = null;

    // 1. iNaturalist (excelente cobertura para flora patagónica nativa con licencias CC)
    for (const bin of candidates) {
      hit = await queryINaturalist(bin);
      if (hit) break;
      await sleep(150);
    }

    // 2. Wikipedia ES y EN
    if (!hit) {
      for (const bin of candidates) {
        hit = (await queryWikipedia('es', bin)) || (await queryWikipedia('en', bin));
        if (hit) break;
        await sleep(150);
      }
    }

    // 3. Wikimedia Commons directo
    if (!hit) {
      for (const bin of candidates) {
        hit = await queryWikimediaCommons(bin);
        if (hit) break;
        await sleep(150);
      }
    }

    if (!hit) {
      console.log(`[${i + 1}/${targets.length}] ❌ SIN FOTO: ${t.nombre} (${primaryBin})`);
      failed.push({ slug: t.slug, nombre: t.nombre, sci: primaryBin });
      continue;
    }

    try {
      const stats = await downloadAndConvert(hit.url, t.expectedPath);
      updateMarkdownImage(t.fullPath, `/imagenes/${t.slug}.webp`);
      credits[t.slug] = {
        nombre: t.nombre,
        nombreCientifico: t.sci,
        image: `/imagenes/${t.slug}.webp`,
        source: hit.source,
        license: hit.license,
        attribution: hit.attribution,
        matchedTaxon: hit.matchedTaxon,
        sourceUrl: hit.url,
        sizeKB: stats.sizeKB,
      };
      ok.push(t.slug);
      console.log(
        `[${i + 1}/${targets.length}] ✅ ${t.slug}.webp (${stats.sizeKB} KB) ← ${hit.source} [${hit.license}] (${hit.matchedTaxon})`,
      );
    } catch (err) {
      // Reintento inmediato con Wikimedia Commons si la descarga de iNaturalist falló
      let recovered = false;
      for (const bin of candidates) {
        const alt = await queryWikimediaCommons(bin);
        if (alt) {
          try {
            const stats = await downloadAndConvert(alt.url, t.expectedPath);
            updateMarkdownImage(t.fullPath, `/imagenes/${t.slug}.webp`);
            credits[t.slug] = {
              nombre: t.nombre,
              nombreCientifico: t.sci,
              image: `/imagenes/${t.slug}.webp`,
              source: alt.source,
              license: alt.license,
              attribution: alt.attribution,
              matchedTaxon: alt.matchedTaxon,
              sourceUrl: alt.url,
              sizeKB: stats.sizeKB,
            };
            ok.push(t.slug);
            recovered = true;
            console.log(
              `[${i + 1}/${targets.length}] ✅ ${t.slug}.webp (${stats.sizeKB} KB) ← ${alt.source} (fallback)`,
            );
            break;
          } catch {}
        }
      }
      if (!recovered) {
        console.log(
          `[${i + 1}/${targets.length}] ❌ ERROR descarga ${t.nombre} (${primaryBin}): ${err.message}`,
        );
        failed.push({ slug: t.slug, nombre: t.nombre, sci: primaryBin, error: err.message });
      }
    }

    await sleep(220);
  }

  fs.writeFileSync(CREDITS_PATH, JSON.stringify(credits, null, 2) + '\n', 'utf8');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`🖼️  Descarga y optimización WEBP finalizada:`);
  console.log(`   • Exitosas: ${ok.length}/${targets.length}`);
  console.log(`   • Faltantes: ${failed.length}`);
  if (failed.length > 0) {
    console.log('   • Detalle faltantes:', JSON.stringify(failed));
  }
  console.log(`   • Créditos de licencia guardados en: ${CREDITS_PATH}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
