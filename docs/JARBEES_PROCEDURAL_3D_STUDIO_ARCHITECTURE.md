# JarBees Procedural 3D Studio — Arquitectura y Diseño del Sistema

## 1. Visión Estratégica: Del Script Aislado al Estudio 3D Autónomo

El verdadero salto cualitativo de `productos_crud_bkd` no es acumular scripts dispersos de Blender, sino consolidar un **Estudio 3D Procedural y Determinista Autónomo**, gobernado por JarBees.

A diferencia de la IA generativa de imágenes (difusión 2D), que produce alucinaciones, ángulos impredecibles y falta de consistencia física, este motor aprovecha la **RTX 5070 local con Blender 5.2 LTS (EEVEE Next / Cycles)**:
- **Control físico riguroso**: Geometría real, normales, mapas PBR, cámaras calibradas con óptica real y luces estandarizadas.
- **Cero costo de inferencia por token/imagen**: Renders locales ultrarrápidos (3–5 segundos) sin depender de APIs cloud.
- **Reproducibilidad y escalabilidad**: Un mismo producto puede fotografiarse desde 12 ángulos idénticos con diferentes esquemas de luz o temporadas.

---

## 2. Los Cuatro Pilares de Producción y Monetización

```
┌────────────────────────────────────────────────────────────────────────┐
│                   JARBEES PROCEDURAL 3D STUDIO                        │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│ 1. Product      │ 2. Game Asset   │ 3. Procedural    │ 4. Avatar       │
│    Studio       │    Studio       │    Materials Lab │    Factory      │
│ (E-Commerce B2B)│ (Indie Games)   │ (Assets Varian.) │ (Jarvis / Web)  │
├─────────────────┼─────────────────┼──────────────────┼─────────────────┤
│ • Catálogo 3D   │ • Dioramas CC0  │ • Pátina vegetal │ • Poses HUD     │
│ • Vistas 360°   │ • Spritesheets  │ • Desgaste/óxido │ • Emociones UI  │
│ • Pack 4-12 tomas│ • Props héroe   │ • Normal maps    │ • Stickers/GIFs │
│ • Fondos estudio│ • Iconos/Badges │ • Reutilización  │ • Transparencia │
└─────────────────┴─────────────────┴──────────────────┴─────────────────┘
```

### Prioridad 1: Product Studio (Máxima Tracción Comercial)
- **Propuesta de Valor**: Convertir modelos `.glb` en suites de fotografía publicitaria de e-commerce sin set físico ni fotógrafo.
- **Entregables**: 4 a 12 vistas por producto (Frontal, Isométrica 3/4, Detalle macro con DoF, Cenital, Empaque/Contextual).
- **Formatos**: PNG sin fondo (RGBA 16-bit), JPEG fondo blanco puro (Amazon/MercadoLibre) y WebP para web.

### Prioridad 2: Game Asset Studio
- **Propuesta de Valor**: Generación de escenarios, dioramas, iconos de inventario y capturas de marketing para estudios independientes.
- **Entregables**: Dioramas con pedestal, personajes en poses de acción congelada, colecciones temáticas (monedas, cofres, plataformas).

### Prioridad 3: Procedural Materials Lab
- **Propuesta de Valor**: Multiplicación de variantes de un mismo modelo aplicando nodos procedurales (`apply_weathering.py`, pátinas, metales pulidos, maderas envejecidas) sin alterar la malla base.

### Prioridad 4: JarBees Avatar Factory
- **Propuesta de Valor**: Expresiones y estados del agente Jarvis/JarBees (idle, thinking, success, warning, error) en poses cinematográficas para UI y marketing.

---

## 3. Arquitectura Modular en NestJS (`src/jarvis/3d/`)

Para desacoplar el ciclo HTTP de la ejecución intensiva en GPU y evitar scripts monolíticos, la arquitectura se estructura en 6 servicios especializados:

```
┌──────────────────────────────────────────────────────────┐
│                   JarvisController / API                 │
│              (POST /jarvis/3d/studio/render)             │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                    RenderJobService                      │
│   • Cola de trabajos (In-Memory / Redis)                 │
│   • Control de concurrencia GPU (máx. 2 jobs simultáneos)│
│   • Timeout de seguridad (60s) y aislamiento de procesos │
└──────────────┬─────────────────────────────┬─────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────────┐ ┌─────────────────────────┐
│     AssetInspectorService    │ │   SceneDirectorService  │
│ • Bounding Box & Centrado    │ │ • Presets de luz/mood   │
│ • Auto-framing de cámara     │ │ • Selección de pedestal │
│ • Detección de materiales    │ │ • Configuración de DoF  │
│ • Heurística de escala       │ │ • Óptica y color (AgX)  │
└──────────────┬───────────────┘ └───────────┬─────────────┘
               │                             │
               └──────────────┬──────────────┘
                              ▼
┌──────────────────────────────────────────────────────────┐
│                      BlenderService                      │
│   • Ejecución headless (--background -P runner.py)       │
│   • Recolección de telemetría y streams stdout/stderr    │
└─────────────────────────────┬────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│                   RenderQualityService                   │
│   • Verificación de resolución e integridad de archivo   │
│   • Detección de imagen vacía (histograma / canal Alpha) │
│   • Cálculo de contraste y clipping en altas luces      │
└──────────────────────────────────────────────────────────┘
```

### 3.1 `AssetInspectorService` (Auto-Framing Inteligente)
- Calcula el bounding box ($X, Y, Z$) del modelo importado.
- Normaliza la escala de escena para que objetos de 5 cm o 3 metros se encuadren de forma óptima sin desbordar el frustum de la cámara.
- Identifica la orientación frontal (+Y o +Z) y la altura del centro de masa para clavar el target de enfoque (`Camera_Focus_Target`).

### 3.2 `SceneDirectorService` (Composición & Moods)
Catálogo de presets cinematográficos:
- `studio_clean`: Fondo blanco puro o ciclorama neutro, 3 puntos suaves, sombras sutiles de oclusión ambiental.
- `golden_hour`: Rim light ámbar de alto contraste, cielo crepuscular y temperatura de color cálida (3200K).
- `cyberpunk_neon`: Contraste cian/magenta, reflejos metálicos intensificados y suelo mojado.
- `oceanic_abyss` (*Ecco Style*): Volumetría submarina, rayos crepusculares (god rays), cáusticas sobre la superficie y bokeh marino.

### 3.3 `RenderJobService` (Aislamiento & Rendimiento)
- Evita saturar los 12 GB de VRAM de la RTX 5070 encolando los renders.
- Supervisa el tiempo de ejecución con timeout estricto.
- Sanitiza rutas de entrada y salida contra inyecciones de comandos en shell.

### 3.4 `RenderQualityService` (Control de Calidad Autónomo)
- **Check 1: Tamaño y dimensiones en disco**: Rechaza renders menores a 100 KB o con dimensiones discordantes.
- **Check 2: Imagen no negra/vacía**: Comprueba que la varianza de color del histograma supere el umbral mínimo.
- **Check 3: Sujeto visible**: Valida que el área central no sea 100% fondo transparente si se solicitó sujeto opaco.

---

## 4. Hoja de Ruta de 30 Días (Comercialización Progresiva)

| Fase | Plazo | Objetivos Principales | Entregables |
|---|---|---|---|
| **Fase 1: Calidad & Auto-framing** | Días 1–7 | Auto-framing matemático por bounding box en Python; pruebas con 10 GLBs variados (botella, casco, joyas, muebles, animales). | Scripts de calibración, métricas de tiempo por modelo. |
| **Fase 2: Product Studio MVP** | Días 8–14 | Endpoint NestJS con validación de entrada, 3 presets de producto y soporte para generación de lotes (Frontal, 3/4, Macro). | API documentada en Swagger, suite de integración. |
| **Fase 3: Portfolio de Alto Impacto** | Días 15–21 | Generación de catálogo público: 5 productos premium fotografiados con calidad comercial + 1 diorama hero de videojuego. | Landing page o dossier PDF comercial de muestras. |
| **Fase 4: Validación Comercial** | Días 22–30 | Oferta de paquetes piloto (Starter US$35, Showcase US$75) a desarrolladores indie y marcas locales de e-commerce. | Facturación inicial, registro de tiempos reales de entrega. |

---

## 5. Salvaguardas Legales y de Licenciamiento

1. **Licencia de Blender**:
   - Todo el arte, imágenes y modelos 3D generados o renderizados con Blender son **propiedad 100% libre del usuario** y pueden venderse comercialmente sin regalías a la Blender Foundation.
   - El código de nuestros scripts Python invocados por CLI permanece bajo la licencia propietaria/abierta de nuestro proyecto.
2. **Procedencia de Assets**:
   - Los assets de escenografía de Kenney son **CC0 (Dominio Público)**: libres para uso comercial y redistribución.
   - Para clientes externos de *Product Studio*, el contrato estipula que el cliente debe poseer los derechos comerciales del modelo GLB que suministra para renderizar.
