# Ampliación Patagónica del Boticario JarBees & Corpus RAG Fitoterapéutico

**Fecha:** 2026-11-23  
**Alcance:** Integración de las **56 especies medicinales de la Patagonia** (sin duplicados taxonómicos) en el repositorio maestro del Boticario (`G:\Projects2\PlantasMedicinales\content\plantas\`), sincronización del Herbario Oficial de JarBees (`src/jarvis/knowledge/plantas_medicinales.json`) e ingesta vectorial (`bge-m3`) en PostgreSQL del Compendio Patagónico y de la publicación oficial abierta **MINSAL Chile — *Medicamentos Herbarios Tradicionales (103 especies vegetales)***.

---

## 1. Fuentes Oficiales y Abiertas Utilizadas

En cumplimiento estricto de derechos de autor, no se incorporó ninguna copia no autorizada de obras comerciales. Todo el contenido botánico, fitoquímico, etnobotánico y de seguridad se fundamenta en fuentes públicas, gubernamentales y científicas abiertas (citadas además en la bibliografía de referencia):

1. **MINSAL Chile — *Medicamentos Herbarios Tradicionales (MHT): 103 especies vegetales*** (Resolución Exenta N° 548, Ministerio de Salud de Chile, `Libro-MHT-2010.pdf`, 232 páginas, dominio público institucional).
2. **SIB — Sistema de Información de Biodiversidad** (Administración de Parques Nacionales de Argentina, `https://sib.gob.ar`).
3. **CONICET / INIBIOMA / CENPAT** — Etnobotánica de la estepa y bosque patagónico (Dra. Ana Ladio, Dra. Soledad Molares y Jardín Botánico de la Patagonia Extraandina).
4. **Herbotecnia** — Flora medicinal argentina (`https://www.herbotecnia.com.ar`).

---

## 2. Auditoría Taxonómica Anti-Duplicados (56 Especies Patagónicas)

Antes de generar cualquier ficha, el script `scripts/expand-patagonia-boticario.ts` auditó los **75 archivos `.md` existentes** por **slug** y por **binomio científico** (`género + especie`).

### 2.1 Especies ya presentes en el Boticario (9 especies — NO duplicadas)

| Nombre en flora patagónica | Ficha existente (slug) | Nombre científico | Acción aplicada |
|---|---|---|---|
| Diente de león | `diente-de-leon` | *Taraxacum officinale* | Conservada intacta |
| Llantén | `llanten` | *Plantago major* | Conservada intacta |
| Melisa | `melisa` | *Melissa officinalis* | Conservada intacta |
| Menta | `menta` | *Mentha piperita* | Conservada intacta |
| Ortiga | `ortiga` | *Urtica dioica* | Conservada intacta |
| Paico | `paico` | *Dysphania ambrosioides* | Conservada intacta |
| Sauco | `sauco` | *Sambucus nigra* | Conservada intacta |
| Toronjil (Toronjil cuyano) | `marrubio` | *Marrubium vulgare* | Enriquecido `otrosNombres` con `"Toronjil cuyano"`, `"Toronjil"` |
| Vara amarilla | `vara-de-oro` | *Solidago chilensis* | Enriquecido `otrosNombres` con `"Vara amarilla"`, `"Romerillo amarillo"` |

*(Nota de auditoría del catálogo previo: dentro de las 75 fichas preexistentes ya coexistían `ajenjo-dulce.md` y `artemisa-annua.md` para *Artemisia annua*; no fueron alteradas en esta ampliación para preservar compatibilidad previa).*

### 2.2 Distinciones botánicas verificadas (especies homónimas o emparentadas pero taxonómicamente distintas)

- **Ajenjo** (*Artemisia absinthium* L.) ≠ *Ajenjo Dulce* (*Artemisia annua*) y ≠ *Artemisia vulgaris*.
- **Parrilla** patagónica (*Ribes magellanicum* Poir., Grossulariaceae) ≠ *Zarzaparrilla* (*Smilax campestris*).
- **Menta Alemana** (*Mentha suaveolens* Ehrh.) y **Yerba Buena** (*Mentha spicata* L.) ≠ *Menta piperita* (*Mentha piperita*).
- **Cadillo** (*Acaena magellanica*, Rosaceae) ≠ *Amor Seco* (*Desmodium adscendens*, Fabaceae).
- **Laura** (*Schinus patagonicus*) ≠ *Aguaribay* (*Schinus molle*).
- **Huautro** (*Baccharis magellanica*) ≠ *Carqueja* (*Baccharis trimera*).
- **Natre** (*Solanum crispum*) ≠ *Curu Caá* (*Solanum amygdalifolium*).
- **Vira Vira** (*Pseudognaphalium viravira*) ≠ *Marcela* (*Achyrocline satureioides*).
- **Yuyo de San Vicente** (*Artemisia verlotiorum*) ≠ *Artemisia vulgaris*.

### 2.3 Las 47 nuevas especies incorporadas (75 → 122 plantas en el Boticario)

| # | Nombre común | Slug | Nombre científico | Familia | Ecorregión |
|---:|---|---|---|---|---|
| 1 | Ajenjo | `ajenjo` | *Artemisia absinthium* L. | Asteraceae | Introducida / Naturalizada |
| 2 | Alfilerecillo | `alfilerecillo` | *Erodium cicutarium* (L.) L'Hér. | Geraniaceae | Introducida / Naturalizada |
| 3 | Aljaba | `aljaba` | *Fuchsia magellanica* Lam. | Onagraceae | Bosque Andino-Patagónico |
| 4 | Arrayán | `arrayan` | *Luma apiculata* (DC.) Burret | Myrtaceae | Bosque Andino-Patagónico |
| 5 | Bailahuén | `bailahuen` | *Haplopappus baylahuen* J. Rémy | Asteraceae | Bosque y Estepa / Transición |
| 6 | Cadillo | `cadillo` | *Acaena magellanica* (Lam.) Vahl | Rosaceae | Bosque y Estepa / Transición |
| 7 | Calafate | `calafate` | *Berberis microphylla* G. Forst. | Berberidaceae | Bosque y Estepa / Transición |
| 8 | Canchalagua | `canchalagua` | *Centaurium cachanlahuen* (Molina) B.L. Rob. | Gentianaceae | Bosque y Estepa / Transición |
| 9 | Canelo | `canelo` | *Drimys winteri* J.R. Forst. & G. Forst. | Winteraceae | Bosque Andino-Patagónico |
| 10 | Cepa Caballo | `cepa-caballo` | *Xanthium spinosum* L. | Asteraceae | Bosque y Estepa / Transición |
| 11 | Charcao | `charcao` | *Senecio filaginoides* DC. | Asteraceae | Estepa Patagónica |
| 12 | Duraznillo | `duraznillo` | *Colliguaja integerrima* Gillies & Hook. | Euphorbiaceae | Estepa Patagónica |
| 13 | Éter | `eter` | *Artemisia abrotanum* L. | Asteraceae | Introducida / Naturalizada |
| 14 | Hipérico | `hiperico` | *Hypericum perforatum* L. | Hypericaceae | Introducida / Naturalizada |
| 15 | Huautro | `huautro` | *Baccharis magellanica* (Lam.) Pers. | Asteraceae | Bosque y Estepa / Transición |
| 16 | Jarilla | `jarilla` | *Larrea divaricata* Cav. | Zygophyllaceae | Estepa Patagónica |
| 17 | Laura | `laura` | *Schinus patagonicus* (Phil.) I.M. Johnst. ex Cabrera | Anacardiaceae | Bosque Andino-Patagónico |
| 18 | Lengua de Vaca | `lengua-de-vaca` | *Rumex crispus* L. | Polygonaceae | Introducida / Naturalizada |
| 19 | Maitén | `maiten` | *Maytenus boaria* Molina | Celastraceae | Bosque Andino-Patagónico |
| 20 | Maqui | `maqui` | *Aristotelia chilensis* (Molina) Stuntz | Elaeocarpaceae | Bosque Andino-Patagónico |
| 21 | Menta Alemana | `menta-alemana` | *Mentha suaveolens* Ehrh. | Lamiaceae | Introducida / Naturalizada |
| 22 | Milenrama | `milenrama` | *Achillea millefolium* L. | Asteraceae | Introducida / Naturalizada |
| 23 | Natre | `natre` | *Solanum crispum* Ruiz & Pav. | Solanaceae | Bosque Andino-Patagónico |
| 24 | Neneo | `neneo` | *Mulinum spinosum* (Cav.) Pers. | Apiaceae | Estepa Patagónica |
| 25 | Notro | `notro` | *Embothrium coccineum* J.R. Forst. & G. Forst. | Proteaceae | Bosque Andino-Patagónico |
| 26 | Ñancolahuén | `nancolahuen` | *Valeriana carnosa* Sm. | Caprifoliaceae | Bosque y Estepa / Transición |
| 27 | Palo Pichi | `palo-pichi` | *Fabiana imbricata* Ruiz & Pav. | Solanaceae | Bosque y Estepa / Transición |
| 28 | Pañil | `panil` | *Buddleja globosa* Hope | Scrophulariaceae | Bosque Andino-Patagónico |
| 29 | Paramela | `paramela` | *Adesmia boronioides* Hook. f. | Fabaceae | Estepa Patagónica |
| 30 | Parrilla | `parrilla` | *Ribes magellanicum* Poir. | Grossulariaceae | Bosque Andino-Patagónico |
| 31 | Patagua | `patagua` | *Myrceugenia exsucca* (DC.) O. Berg | Myrtaceae | Bosque Andino-Patagónico |
| 32 | Pitra | `pitra` | *Myrceugenia pitra* (Baeza) Kausel | Myrtaceae | Bosque Andino-Patagónico |
| 33 | Poleo | `poleo` | *Mentha pulegium* L. | Lamiaceae | Introducida / Naturalizada |
| 34 | Quilembai | `quilembai` | *Chuquiraga avellanedae* Lorentz | Asteraceae | Estepa Patagónica |
| 35 | Quinchamalí | `quinchamali` | *Quinchamalium chilense* Molina | Schoepfiaceae | Bosque y Estepa / Transición |
| 36 | Quintral | `quintral` | *Tristerix corymbosus* (L.) Kuijt | Loranthaceae | Bosque Andino-Patagónico |
| 37 | Radal | `radal` | *Lomatia hirsuta* (Lam.) Diels | Proteaceae | Bosque Andino-Patagónico |
| 38 | Regaliz Silvestre | `regaliz-silvestre` | *Glycyrrhiza astragalina* Gillies ex Hook. & Arn. | Fabaceae | Estepa Patagónica |
| 39 | Rosa Mosqueta | `rosa-mosqueta` | *Rosa rubiginosa* L. | Rosaceae | Introducida / Naturalizada |
| 40 | Sanguinaria | `sanguinaria` | *Polygonum aviculare* L. | Polygonaceae | Introducida / Naturalizada |
| 41 | Solupe | `solupe` | *Ephedra ochreata* Miers | Ephedraceae | Estepa Patagónica |
| 42 | Tomillo Silvestre | `tomillo-silvestre` | *Acantholippia seriphioides* (A. Gray) Moldenke | Verbenaceae | Estepa Patagónica |
| 43 | Valeriana | `valeriana` | *Valeriana officinalis* L. | Caprifoliaceae | Introducida / Naturalizada |
| 44 | Vira Vira | `vira-vira` | *Pseudognaphalium viravira* (Molina) Anderb. | Asteraceae | Bosque y Estepa / Transición |
| 45 | Yerba Buena | `yerba-buena` | *Mentha spicata* L. | Lamiaceae | Introducida / Naturalizada |
| 46 | Yerba del Lagarto | `yerba-del-lagarto` | *Synammia feuillei* (Bertero) Copel. | Polypodiaceae | Bosque Andino-Patagónico |
| 47 | Yuyo de San Vicente | `yuyo-de-san-vicente` | *Artemisia verlotiorum* Lamotte | Asteraceae | Introducida / Naturalizada |

---

## 3. Documentos Vectorizados en PostgreSQL (`bge-m3`) y Fix de Parser PDF

| `docId` | Título en PostgreSQL | Archivo fuente | Chunks vectorizados | Cobertura |
|---:|---|---|---:|---:|
| `#261` | *Herbario de Plantas Medicinales de la Patagonia: Guía Completa de las 56 Especies* | `docs/books/herbario-plantas-medicinales-patagonia-56-especies.md` | `75 / 75` (`bge-m3` 1024-d) | `100%` |
| `#262` | *Medicamentos Herbarios Tradicionales (MHT): 103 Especies Vegetales — MINSAL Chile* | `docs/books/MINSAL-Medicamentos-Herbarios-Tradicionales-103-Especies.pdf` | `540 / 540` (`bge-m3` 1024-d) | `100%` |

### Hallazgo y corrección estructural en `HierarchicalParserService`
Durante la auditoría post-ingesta de `docId #262` (232 páginas, `456.516` caracteres), se detectó que `HierarchicalParserService.flushText()` descartaba silenciosamente todo el texto previo a la primera línea coincidente con `chapterRegex` (`Parte/Capítulo/Sección`), provocando que inicialmente solo se indexaran `45` chunks (`9%` del libro).  
Se corrigió `src/jarvis/library/hierarchical-parser.service.ts` para crear automáticamente un capítulo inicial (`Contenido Inicial / Monografías`) cuando existe texto previo al primer encabezado, elevando la indexación real de `docId #262` de **45 chunks (9%) a 540 chunks (100%)**.

---

## 4. Artefactos y Scripts Reutilizables

- `scripts/expand-patagonia-boticario.ts`: generador idempotente con auditoría anti-duplicados por slug y binomio científico + compilador del compendio Markdown de 56 especies.
- `scripts/ingest-patagonia-herbarium.ts`: sincronización del Herbario JSON (`122` plantas), ingesta y vectorización `bge-m3` de `#261` y `#262`, sembrado del Knowledge Graph (`12` entidades y relaciones) y registro en `src/jarvis/knowledge/library-index.json` (`152` obras totales).
- `src/jarvis/knowledge/jarvis-knowledge-herbario.spec.ts`: prueba de regresión que valida el catálogo de `122` especies sin slugs duplicados y recuperación contextual de especies patagónicas y sinónimos (`paramela`, `toronjil cuyano`).
