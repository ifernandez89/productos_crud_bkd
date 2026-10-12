# 🎨 JarBees Procedural Graphic Studio — Arquitectura y Documentación Técnica

## 1. Visión y Fundamentos
**JarBees Procedural Graphic Studio** es el subsistema de generación gráfica local y determinista de JarBees. Diseñado para aprovechar la potencia de cómputo gráfico y la GPU (RTX 5070 de 12 GB) sin depender de modelos neuronales pesados de difusión (como Stable Diffusion, ComfyUI o Forge).

El principio rector es la **composición procedural estructurada**:
1. **Dirección de Arte Algorítmica (`ArtDirectionService`):** Convierte intenciones en un contrato formal de escena (`PosterDesignSpec`).
2. **Motores de Renderizado Especializados:**
   - **Motor 2D / 2.5D:** Gráficos vectoriales paramétricos, gradientes multicapa, simulación óptica (Fresnel, normales, dispersión atmosférica), tipografía heráldica y empaques de consolas retro.
   - **Motor 3D (Fase Three.js):** Geometría tridimensional, mallas GLB, shaders de agua, iluminación ambiental PBR y cámaras fotográficas (heredando patrones del proyecto [ArcheoScope](file:///c:/Projects/productos_crud_bkd/docs/ARCHEOSCOPE_REFERENCE.md)).
3. **Renderizador Headless con Aceleración por Hardware (`PngExporter`):** Automatizado mediante Playwright y el motor Chromium de Microsoft Edge (`channel: 'msedge'`), garantizando compatibilidad nativa en Windows y renderizado en milisegundos.
4. **Control de Calidad Automatizado (`PosterQualityAssuranceService`):** Batería de pruebas que audita cabeceras de imagen, dimensiones exactas, legibilidad tipográfica y consistencia estética antes de dar por buena cualquier entrega.

---

## 2. Motores Implementados en el Estudio

### 🐬 Motor 2.5D Dreamcast Ocean (`DreamcastOceanEngine`)
Inspirado en la era dorada de los 128-bits (Sega Dreamcast / PlayStation 2, c. 2000), como *Ecco the Dolphin: Defender of the Future*, pero diseñado con versatilidad para criaturas marinas alternativas (como **ORCA: DEFENDER OF THE SEAS**):
- **Superficie de Agua con Fresnel:** Gradientes multi-nivel simulando el índice de refracción del agua según el ángulo de visión, con estelas de luz solar (*specular sheen*) y cintas de ondas oceánicas.
- **Atmósfera y Horizonte:** Cielo pastel al atardecer (`#7B93CC` a `#FCE1C8`), resplandor solar de baja elevación (*lens flare* procedural) y aves marinas en el horizonte.
- **Topografía Costera:** Farallones e islotes tropicales con acantilados de piedra sedimentaria y palmeras estilizadas en contraluz.
- **Sujeto Protagónico (Orca Breaching):** Curvas Bézier complejas que representan la silueta anatómica de una orca saltando fuera del agua, gradientes satinados de piel, parche ocular blanco, vientre aperlado y su reflejo especular en las olas.
- **Interacción y Salpicaduras:** Anillo de estela de espuma (*wake ring*) y gotas de agua en suspensión calculadas por semilla.
- **HUD Dreamcast Clásico:** Barras curvas de vitalidad/sonar en cian luminoso y burbujas de perla para el oxígeno.
- **Composición Tipográfica:** Serifa clásica con bisel dorado y motivos de luna creciente.

### 🏰 Motor 16-Bit Landscape (`GenesisLandscapePixelEngine`)
Diseñado para pantallas de título de fantasía (estilo *Twinkle Tale*, 1992):
- Isla flotante colosal suspendida en un mar de nubes.
- Palacio de cristal con agujas y torres de mármol.
- Bosques con arboledas en tres tonalidades y cascadas infinitas con estelas de vapor.
- Tipografía dorada con doble trazo y botón *"PUSH START BUTTON"*.

### ⚡ Motor 16-Bit Action Poster (`GenesisPixelArtEngine`)
Diseñado para carátulas de acción de Sega Genesis (estilo *Iron Man*, 1994):
- Retícula de horizonte con perspectiva cyberpunk.
- Héroe acorazado con luz de contorno (*rim lighting*).
- Empaque oficial de Sega Genesis con cuadrícula negra, sello dorado y código de barras.

---

## 3. Resultados de Calidad Obtenidos

| Prueba | Preset / Era | Sujeto / Tema | Tiempo de Render | Tamaño PNG | Puntaje QA |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 1** | `genesis16` | Iron Man (Action Mecha) | ~1.9s | 389 KB | **100 / 100 ✅** |
| **Test 2** | `genesis-landscape` | Aetheria (Floating Island) | ~0.7s | 121 KB | **100 / 100 ✅** |
| **Test 3** | `dreamcast-ocean` | Orca: Defender of the Seas | ~0.7s | 283 KB | **100 / 100 ✅** |

---

## 4. Conexión con ArcheoScope y Siguiente Fase 3D (Three.js)

El proyecto [ArcheoScope](file:///c:/Projects/productos_crud_bkd/docs/ARCHEOSCOPE_REFERENCE.md) de Ignacio Fernández ya utiliza **Three.js (r165)** para renderizar en tiempo real el Sistema Solar y templos arqueológicos antiguos (Giza, Puma Punku, Teotihuacán).

Para la siguiente fase del estudio procedural de JarBees:
1. **Escena 3D Headless:** Se cargará una plantilla HTML/WebGL local en Playwright donde Three.js renderice modelos `.glb` de cetáceos o artefactos históricos con iluminación ambiental HDRI y mallas de agua desplazadas con ondas de Gerstner.
2. **Compositor Híbrido:** El búfer de renderizado WebGL se combinará con las capas vectoriales SVG 2D (logotipos, marcos, HUDs de juego y textos de alta resolución) para generar la imagen final.
3. **Resolución y Rendimiento:** La RTX 5070 permite supersampling directo (renderizar internamente a 4K y filtrar a 1080p/1440p) asegurando bordes ultra-nítidos y eliminando la necesidad de reescalado neuronal.
