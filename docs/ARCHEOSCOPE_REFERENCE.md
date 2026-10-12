# 🏛️ ArcheoScope: The Forgotten Relics & Observatorio Astronómico
## Especificación y Ficha Técnica Oficial del Proyecto de Ignacio Fernández (@ifernandez89)

---

## 📌 1. Resumen Ejecutivo y Objetivos

**ArcheoScope** es una aplicación web inmersiva creada por **Ignacio Fernández (`@ifernandez89`)** que fusiona dos universos complementarios:
1. **Exploración 3D arqueológica en primera persona (Modo PC)** sobre civilizaciones ancestrales.
2. **Observatorio astronómico y calendárico en tiempo real (Modo Mobile)** basado en cálculo matemático local de alta precisión sin dependencias externas ni APIs pagas.

El objetivo central del proyecto fue crear una experiencia interactiva sin fricciones, reemplazando el scraping web inestable y las APIs propietarias por algoritmos matemáticos puros y efemérides astronómicas locales.

---

## 🚀 2. Arquitectura y Tecnologías del Proyecto

### Stack Tecnológico
- **Frontend / Engine 3D:** Next.js 14, Three.js (r165), TypeScript, Tailwind CSS / Vanilla CSS.
- **Motor Astronómico:** `astronomy-engine` (efemérides planetarias de alta precisión basadas en VSOP87).
- **Meteorología Local:** Open-Meteo API (cálculo geográfico sin necesidad de API keys).
- **Audio Procedural:** *Harmonia Mundi* — sintetizador de frecuencias orbitales planetarias reales basado en las leyes de Johannes Kepler.

### Modos y Experiencias Interactivas
1. **Modo PC (Juego 3D en primera persona):**
   - **6 sitios arqueológicos ancestrales:** Giza (Egipto), Puma Punku / Tiwanaku (Bolivia), Teotihuacán (México), Isla de Pascua / Rapa Nui (Chile), Tres Zapotes (Cultura Olmeca, México) y Göbekli Tepe (Turquía).
   - Sistema Solar 3D interactivo con órbitas keplerianas en tiempo real y catálogo estelar con 83.148 estrellas.
   - Misiones arqueológicas de investigación, recolección de reliquias históricas y diálogo con NPCs de figuras históricas.
   - Sistema de audio procedural *Harmonia Mundi* (sonificación de frecuencias celestes).

2. **Modo Mobile (Observatorio Astronómico):**
   - Carta celeste interactiva y cálculo de posiciones planetarias zodiacales en tiempo real.
   - Visualización precisa de fases lunares y posición del Sol sobre el horizonte local.
   - Calendarios antiguos: Calendario Maya (Tzolk'in de 260 días, Haab de 365 días y Cuenta Larga) y calendario babilónico.
   - Clima meteorológico local por coordenadas.
   - Brújula magnética basada en sensores físicos del dispositivo móvil.

---

## 🐝 3. Relación con JarBees: Hechos Confirmados vs Decisiones Pendientes

JarBees adoptó la arquitectura y algoritmos de ArcheoScope para resolver el "clima astrológico" y astronómico de forma instantánea y local, eliminando las dependencias de scraping web (que tardaban 15-30s y sufrían bloqueos 403).

### ✅ Hechos Confirmados e Implementados en JarBees
- **Módulo HOY (`Today`):** Posición del Sol, fase lunar exacta en porcentaje, distancia Tierra-Luna y planetas visibles actualmente en el horizonte local calculados con `astronomy-engine`.
- **Módulo ASTROLOGÍA:** Cálculo matemático de posiciones zodiacales planetarias (signo, grado y minuto) y casas celestes sin red.
- **Módulo CLIMA:** Integración de coordenadas locales con Open-Meteo sin clave.

### ⏳ Decisiones Pendientes o Conceptuales (Disponibles en Documentación pero NO en Chat API)
- **Calendarios Antiguos:** Algoritmos matemáticos del Tzolk'in Maya (260 días = 20 nawales × 13 tonos), Haab (365 días = 18 meses × 20 días + 5 Wayeb) y Cuenta Larga. Los algoritmos están listos pero no integrados en la API de chat.
- **Aspectos Planetarios:** Cálculo de orbes geométricos (conjunción 0°, oposición 180°, trígono 120°, cuadratura 90°, sextil 60°).
- **Nodos Lunares:** Nodo Norte y Nodo Sur en signos zodiacales (ciclo de 18.6 años a -0.05295°/día).
- **Eclipses:** Búsqueda automática y predicción de eclipses solares y lunares.
- **Brújula:** Módulo que requiere magnetómetro/sensores en cliente físico; no aplica a la arquitectura del servidor backend.

---

## 🌐 4. Ecosistema de Proyectos de Ignacio Fernández (@ifernandez89)

1. **`ArcheoScope`:** The Forgotten Relics — Exploración 3D arqueológica (Three.js/Next.js) y observatorio astronómico móvil.
2. **`Jarbees` (Mobile):** Asistente IA on-device para Android con LLM local ligero que delega tareas complejas al JarBees Core.
3. **`productos_crud_bkd`:** Backend NestJS con PostgreSQL/pgvector, RAG híbrido documental, observabilidad y razonamiento dialéctico.
4. **`productos_crud_frd`:** Frontend web Next.js con interfaz para gestión de productos y chat agentico con JarBees.
5. **`Contactos-Eventos`:** Sistema de planificación anual y agenda de contactos para fechas y actuaciones musicales en Entre Ríos.
6. **`PlantasMedicinales`:** Base de datos estructurada de plantas clasificadas por principios activos y acción terapéutica.
7. **`Radar-Dev`:** Ecosistema de relevamiento de oportunidades tecnológicas y diagnóstico de automatización e IA para organizaciones.
8. **`mergeador`:** Herramienta para fusionar y organizar libros digitales y PDFs.
9. **`DevilutionX`:** Build/port de Diablo adaptado a sistemas operativos modernos.
