# Arquitectura del Subsistema de Retratos de JarBees Graphic Studio

Este documento define la arquitectura, taxonomía por niveles, modelo de datos y pipeline de aseguramiento de calidad (QA) del **Subsistema de Retratos Paramétricos y 3D** de JarBees.

---

## 1. La Taxonomía de Retratos: 4 Niveles de Madurez

| Nivel | Enfoque Técnico | Complejidad | Tecnologías en JarBees | Caso de Uso Ideal |
| :--- | :--- | :--- | :--- | :--- |
| **Nivel 1: Geométrico y Estilizado** | Polígonos, curvas Bézier, siluetas limpias y paletas contrastadas. | *Muy Viable (Inmediato)* | SVG dinámico, Canvas, `VectorPortraitEngine`. | Avatares de usuario, carátulas estilo cómic, iconos de facción, pop art. |
| **Nivel 2: Pictórico y Cinematográfico** | Capas anatómicas profundas, simulación de dispersión sub-superficial (SSS), iluminación Rembrandt y rim light. | *Viable con Proporciones* | SVG con gradientes radiales + filtros de iluminación, compositor Playwright. | Retratos narrativos, arte conceptual de personajes para ArcheoScope y novelas visuales. |
| **Nivel 3: 3D Físicamente Plausible (PBR)** | Mallas faciales (GLB / Draco), sombreadores PBR (rugosidad, metalicidad), mapas normales, tone mapping ACES. | *Complejo (Requiere Modelos)* | Three.js headless, ANGLE Direct3D11, WebGL 2.0 en GPU NVIDIA RTX 5070. | Reliquias faciales (Akenatón, Hatshepsut), modelos de ciencia ficción, props de alta fidelidad. |
| **Nivel 4: Fotorrealismo Original** | Piel con micro-porosidad, cabello hebra por hebra, dispersión volumétrica profunda. | *Evolutivo (Opcional)* | Modelos generativos locales o escaneos 3D de ultra-alta definición. | Fotografía sintética de catálogo. Se integra como paso opcional sin comprometer el pipeline procedural. |

---

## 2. Pipeline de Generación de Retratos

```mermaid
graph TD
    A["Solicitud del Usuario / Prompt"] --> B["PortraitDirectionService"]
    B -->|Aplica Reglas de Loomis + Semilla PRNG| C["PortraitDesignSpec"]
    C --> D{"Selección de Motor"}
    D -->|Paramétrico 2.5D| E["VectorPortraitEngine"]
    D -->|Malla 3D PBR| F["ThreePortraitEngine"]
    E --> G["PngExporter (Playwright + RTX 5070)"]
    F --> G
    G --> H["PortraitQaService (QA Antropométrico)"]
    H -->|Aprobado (Score >= 80)| I["storage/posters/portrait_*.png (2048x2048)"]
    H -->|Rechazado| J["Calibración de Parámetros"]
```

---

## 3. Modelo de Datos (`PortraitDesignSpec`)

Toda generación está regida por una especificación inmutable y determinista:

```typescript
export interface PortraitDesignSpec {
  id: string;
  seed: number;
  name: string;
  style: 'comic' | 'pixel_art' | 'digital_painting' | 'fantasy' | 'semi_realistic';
  expression: 'neutral' | 'determined' | 'serene' | 'intense' | 'contemplative' | 'smiling';
  dimensions: { width: 2048; height: 2048 };
  proportions: {
    faceRatio: number;        // Alto / Ancho de cabeza (1.30 - 1.45)
    jawTaper: number;         // 0 (cuadrada) a 1 (triangular)
    eyeLevelY: number;        // Regla de oro: Ojos en 0.485 - 0.515
    eyeSpacing: number;       // Separación interpupilar
    eyeWidth: number;
    browAngleDeg: number;     // Expresión facial en cejas
    noseBaseY: number;        // Base nasal en ~2/3
    mouthLevelY: number;      // Labio en tercio inferior
    mouthWidth: number;
  };
  lighting: {
    keyLightAngleDeg: number;
    keyLightIntensity: number;
    rimColor: string;
    rimIntensity: number;
  };
  palette: PortraitPaletteSpec;
  hair: HairSpec;
}
```

---

## 4. Aseguramiento de Calidad Anatómico (`PortraitQaService`)

A diferencia de los verificadores binarios que solo revisan la existencia del archivo, `PortraitQaService` audita métricas antropométricas reales:

1. **Separación Interpupilar (Regla de los Cinco Quintos):**
   - Mide el espaciado entre centros oculares respecto al ancho facial (rango tolerado: $0.350 \le \text{spacing} \le 0.480$).
2. **Proporción de Tercios Faciales (Método Loomis):**
   - Comprueba la relación entre la distancia cejas-nariz y la distancia nariz-mentón (rango tolerado: $0.75 \le \text{ratio} \le 1.35$).
3. **Triángulo Facial Ojos-Boca:**
   - Comprueba la distancia vertical de la comisura labial respecto a la separación interpupilar para asegurar simetría y armonía áurea ($0.60 \le \text{triangleRatio} \le 0.85$).
4. **Relación de Aspecto Craneal:**
   - Previene cráneos desproporcionados o achatados ($1.25 \le \text{faceRatio} \le 1.55$).
5. **Contraste de Silueta y Fondo (WCAG):**
   - Comprueba que la relación de contraste entre la piel del rostro y el fondo atmosférico sea $\ge 3.0:1$ para garantizar legibilidad y recorte visual.

---

## 5. Endpoints de la API

- **Generar Retrato Paramétrico:**
  ```http
  POST /api/jarbees/poster/portrait/generate
  Content-Type: application/json

  {
    "name": "Comandante Neón",
    "style": "semi_realistic",
    "expression": "determined",
    "palettePreset": "cyber_neon",
    "resolution": 2048,
    "seed": 94821
  }
  ```

- **Consultar Presets Disponibles:**
  ```http
  GET /api/jarbees/poster/portrait/presets
  ```

---

## 6. Estrategia para la Biblioteca de Referencias

Para nutrir la calidad estética sin recurrir a cajas negras de difusión:
1. **Extracción de Paletas y Armonías:** Análisis estadístico de luminancia y gamas de color de obras maestras para crear presets automáticos.
2. **Biblioteca de Siluetas de Peinado:** Mapeo de polígonos y curvas paramétricas reutilizables (ondulado, trenzado, mechones ciberpunk).
3. **Mapas de Iluminación Clásica:** Pre-configuraciones de iluminación Caravaggio (claroscuro fuerte), Rembrandt (triángulo de luz en mejilla) y Scifi Neon Rim.
