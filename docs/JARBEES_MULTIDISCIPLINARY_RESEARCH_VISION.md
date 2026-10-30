# JarBees: Visión de Investigación Técnica Multidisciplinaria y Motor Científico

> **Estado del Documento**: 🟡 **PENDIENTE / BACKLOG ARQUITECTÓNICO REGISTRADO**  
> **Fecha de Registro**: 2026-10-29  
> **Área**: Arquitectura Avanzada de JarBees / Extensión Cognitiva y Científica  
> **Documento de Referencia de Ingeniería**: [`docs/JARBEES_CODER_ENGINEERING_AND_DESIGN.md`](file:///c:/Projects/productos_crud_bkd/docs/JARBEES_CODER_ENGINEERING_AND_DESIGN.md)

---

## 1. Tesis Fundamental y Separación de Roles

Sería un error estratégico reducir el alcance arquitectónico de JarBees exclusivamente a un asistente de programación o generación de código. 

La ingeniería de software es solo una dimensión estructurada del razonamiento técnico. La visión a largo plazo para JarBees es consolidarlo como un **Investigador Técnico Multidisciplinario**: un sistema autónomo capaz de recibir una misión sobre un dominio desconocido, investigar cómo abordarla, formular hipótesis, diseñar y construir las herramientas computacionales necesarias, experimentar en entornos controlados, evaluar los resultados y producir conclusiones respaldadas por evidencia empírica.

### La Distinción Clave: Orquestador vs. Especialista de Código

| Entidad | Rol Primario | Alcance y Función |
| :--- | :--- | :--- |
| **JarBees** | **Orquestador Multidisciplinario** | Interpreta metas de alto nivel, planifica investigaciones, formula hipótesis, coordina herramientas, supervisa experimentos y sintetiza evidencia. |
| **Qwen2.5-Coder-14B** | **Especialista en Software e Instrumentación** | Motor de código, arquitectura de software, debugging, testing y **constructor de herramientas computacionales, scripts de análisis y simuladores científicos** para otras disciplinas. |

JarBees no necesita poseer conocimiento enciclopédico rígido de todas las ciencias de antemano. Su fortaleza radica en **saber cómo investigar, qué herramientas computacionales desarrollar o invocar, cómo cuantificar la incertidumbre y cuándo delegar en un especialista**.

---

## 2. Arquitectura de Especialistas

En lugar de un modelo monolítico que intente resolver todas las ramas del saber, JarBees operará mediante una federación coordinada de agentes y motores especializados:

```mermaid
flowchart TD
    JB["👑 JarBees<br/><b>Orquestador Multidisciplinario</b><br/>(Metas, Planificación, Síntesis, Epistemología)"]
    
    JB --> SE["💻 Software Engineer<br/>(Qwen2.5-Coder-14B / llama.cpp)<br/><i>Código, arquitectura, simuladores y scripts</i>"]
    JB --> RA["🔍 Research Analyst<br/>(Modelo Generalista)<br/><i>Investigación, hipótesis, contraste de evidencia</i>"]
    JB --> SR["🔬 Scientific Researcher<br/>(Modelos de Dominio)<br/><i>Física, astronomía, química, biología</i>"]
    JB --> KR["📚 Knowledge Researcher<br/>(RAG + Archivos Documentales)<br/><i>Historia, arqueología, papers, cronologías</i>"]
    JB --> ET["⚙️ Experimental Technician<br/>(Sandbox de Ejecución)<br/><i>Simulaciones, análisis numérico y pruebas</i>"]
    JB --> VE["⚖️ Verification & Evidence Engine<br/>(Arnés de Validación)<br/><i>Reproducibilidad, límites de error, incertidumbre</i>"]
```

### Funciones de los Componentes:

1. **JarBees (Orquestador Multidisciplinario)**:
   - Descompone directivas complejas en programas de investigación estructurados.
   - Asigna presupuestos de tiempo, tokens y cómputo.
   - Pesa la evidencia empírica frente a fuentes teóricas y decide cuándo una hipótesis está falsada o confirmada.

2. **Software Engineer (`Qwen2.5-Coder-14B`)**:
   - Construye software bajo demanda para la investigación: scripts en Python, modelos matemáticos, pipelines de ETL científico, algoritmos de visión o procesamiento de señales.
   - Opera bajo las compuertas de seguridad del `VerificationHarnessService` (validación estática AST, ejecución aislada y rollback).

3. **Research Analyst (Modelo Generalista / Razonamiento)**:
   - Modela árboles de inferencia, detecta sesgos metodológicos, contrasta fuentes contradictorias y redacta resúmenes ejecutivos.

4. **Scientific Researcher (Especialistas de Dominio)**:
   - Modelos afinados o prompts de sistema con ontologías formales en física, química, mecánica orbital o bioestadística.

5. **Knowledge Researcher (RAG y Documentación Externa)**:
   - Recuperación contextual profunda sobre bibliotecas científicas, bases de datos arqueológicas, planos arquitectónicos, patentes y datasheets.

6. **Experimental Technician (Técnico de Laboratorio Computacional)**:
   - Ejecuta código de simulación generado por el Coder en entornos aislados (Docker, WebAssembly, microvms o subprocesos sanitizados).
   - Registra parámetros de entrada, semillas aleatorias, telemetría y artefactos de salida (gráficos, tablas CSV, matrices).

7. **Verification & Evidence Engine (Motor Epistémico de Verificación)**:
   - Cuantifica márgenes de error, analiza consistencia dimensional de unidades físicas, evalúa significancia estadística y valida que las conclusiones no excedan los datos observados.

---

## 3. Disciplinas Aplicadas y Tipología de Misiones

JarBees se centrará en dominios donde la investigación teórica se complementa de forma inmediata con herramientas computacionales, datos estructurados o análisis documental:

```mermaid
mindmap
  root((JarBees Multidisciplinario))
    Astronomía y Astrofísica
      Modelos orbitales y efemérides
      Simulaciones N-cuerpos
      Análisis de curvas de luz
      Procesamiento FITS
    Arqueología e Historia
      Cronología comparada
      Planos y fotogrametría documental
      Técnicas constructivas
      Contraste epigráfico
    Electrónica y Robótica
      Diseño esquemático preliminar
      Análisis de datasheets de CI
      Firmware para microcontroladores
      Simulación SPICE y cinemática
    Biología y Bioinformática
      Alineamiento y secuencias FASTA
      Datasets públicos NCBI/UniProt
      Análisis bioestadístico
      Relaciones epidemiológicas
    Geología y Ciencias de la Tierra
      Modelos digitales de elevación DEM
      Datos geoespaciales GIS
      Estructuras estratigráficas
      Muestras mineralógicas
```

### Matriz de Viabilidad Operativa:

| Disciplina | Tipo de Misión | Herramientas Utilizadas | Límite / Salvaguarda |
| :--- | :--- | :--- | :--- |
| **Astronomía** | Cálculo orbital, gravitación, comparación de efemérides | Python (`scipy`, `astropy`), JPL Horizons API | No sustituye telescopios; trabaja sobre datos observacionales públicos. |
| **Arqueología** | Contraste de cronologías, análisis de técnicas de construcción | RAG documental, visión por computadora para fotogrametría | Requiere confirmación de excavación en sitio; no emite dogmas. |
| **Electrónica** | Síntesis de firmware, análisis de timing, verificación de patillaje | Python, ngspice, compiladores cruzados C/C++ | Simulación previa obligatoria antes de energizar prototipos físicos. |
| **Biología** | Análisis estadístico de expresión génica, clustering | R, Python (`biopython`, `pandas`) | Validación de bioestadística estricta; sin extrapolación clínica directa. |
| **Geología** | Mapeo de fallas, cálculo de perfiles topográficos | GDAL, QGIS headless, scripts raster | Depende de la precisión del levantamiento de campo original. |

> [!IMPORTANT]
> **Límite Físico vs. Computacional**: Ciertas disciplinas requieren muestras físicas, laboratorios húmedos o instrumentación de campo. La misión de JarBees en estas áreas se enfoca en el modelado computacional, el análisis de datos preexistentes, la síntesis bibliográfica y la preparación de protocolos empíricos reproducibles.

---

## 4. `ScientificResearchEngine`: Ciclo de Vida de Investigación

Así como las tareas de código están gobernadas por `EngineeringMissionManagerService`, las misiones de investigación se orquestarán mediante un nuevo motor: **`ScientificResearchEngine`**.

```mermaid
flowchart TD
    P1["1. Research Planning<br/>(Descomposición de objetivos investigables)"] --> P2["2. Source Discovery<br/>(RAG, bibliografía y datos de entrada)"]
    P2 --> P3["3. Evidence Extraction<br/>(Extracción de hechos, unidades y parámetros)"]
    P3 --> P4["4. Hypothesis Engine<br/>(Formulación de hipótesis alternativas)"]
    P4 --> P5["5. Experiment Planner<br/>(Diseño de simulaciones o análisis numérico)"]
    P5 --> P6["6. Execution via Coder & Technician<br/>(Qwen2.5 genera script; Sandbox ejecuta)"]
    P6 --> P7["7. Verification & Epistemic Audit<br/>(Contraste de hipótesis, cálculo de error)"]
    P7 --> P8["8. Research Report<br/>(Informe estructurado con datos, gráficos y límites)"]
```

### Reutilización Directa de Módulos Existentes de JarBees

No es necesario construir un nuevo sistema desde cero. La infraestructura implementada en las Etapas 1, 2 y 3 se traduce de forma natural al dominio científico:

```mermaid
classDiagram
    class Planner {
        +planResearch()
        +decomposeHypothesis()
    }
    class ExecutionEngine {
        +runSimulation()
        +executeAnalysisScript()
    }
    class RAGModule {
        +queryBibliography()
        +fetchDatasheets()
    }
    class CheckpointManagerService {
        +snapshotExperimentState()
        +preserveDatasetSHA256()
    }
    class VerificationHarnessService {
        +verifyCalculations()
        +assertDimensionalUnits()
    }
    class MissionRecoveryService {
        +resumeResearchMission()
        +replayExperiments()
    }
    class ActionGatekeeperService {
        +requestHITLApproval()
        +authorizeSensitiveAction()
    }

    Planner --> ExecutionEngine
    ExecutionEngine --> VerificationHarnessService
    CheckpointManagerService --> ExecutionEngine
    VerificationHarnessService --> ActionGatekeeperService
    MissionRecoveryService --> Planner
```

1. **`Planner`**: Descompone preguntas científicas abiertas en hitos específicos y falsables.
2. **`ExecutionEngine`**: Ejecuta scripts de análisis de datos y simuladores en sandbox sin tocar el entorno host.
3. **`RAG`**: Recupera papers científicos, normas técnicas, cronologías históricas y documentación especializada.
4. **`CheckpointManagerService`**: Crea snapshots inmutables por contenido (SHA-256) de los datos, scripts y resultados de cada experimento.
5. **`VerificationHarnessService`**: Verifica que las simulaciones compilen, que los cálculos no diverjan numéricamente y que se cumplan las leyes físicas del modelo.
6. **`MissionRecoveryService`**: Permite reanudar investigaciones largas que tomen horas o días tras caídas de proceso sin perder el progreso.
7. **`ActionGatekeeperService` (HITL)**: Exige confirmación humana antes de aceptar conclusiones controvertidas o ejecutar comandos de alto consumo.

---

## 5. El Rol de `Qwen2.5-Coder-14B`: Creador de Herramientas Computacionales

Un punto fundamental del diseño es que **el modelo de código no necesita ser astrónomo, arqueólogo ni biólogo**. Su papel es el de un **desarrollador de instrumentación computacional**.

Dado un conjunto de especificaciones matemáticas, ecuaciones de movimiento o esquemas de datos:
- **En Astronomía**: `Qwen2.5-Coder-14B` implementa un integrador simpléctico Verlet o Runge-Kutta 4 en Python para propagar trayectorias orbitales.
- **En Arqueología**: Implementa un script de procesamiento de imágenes con OpenCV para detectar anomalías geométricas en planos aéreos.
- **En Electrónica**: Genera un archivo de netlist SPICE o firmware en C/C++ para STM32/ESP32 a partir de las especificaciones del datasheet.
- **En Bioinformática**: Escribe un script optimizado de parsing de archivos FASTQ/VCF con filtros de calidad específicos.

La interpretación teórica de los resultados de esas herramientas recae en el **Investigador Analítico (modelo generalista)** y en las métricas cuantitativas del **Verification Harness**.

---

## 6. Misión Piloto Propuesta: Simulación Orbital del Sistema Solar

Para certificar la transición de JarBees hacia la investigación técnica multidisciplinaria cuando se active esta etapa, se diseñará la siguiente misión piloto empírica:

```mermaid
sequenceDiagram
    autonumber
    actor Humano as Usuario / HITL
    participant JB as JarBees (Orquestador)
    participant KR as Knowledge RAG
    participant Coder as Qwen2.5-Coder-14B
    participant Sandbox as Experimental Sandbox
    participant VH as Verification Harness

    Humano->>JB: Iniciar Misión: Simulación Orbital del Sistema Solar
    JB->>KR: Consultar parámetros orbitales estandarizados (JPL/NASA)
    KR-->>JB: Retorna semi-ejes, excentricidades, masas, épocas J2000
    JB->>Coder: Solicitar script Python de simulación gravitacional N-cuerpos
    Coder-->>JB: Código Python con integrador RK4 y cálculo de efemérides
    JB->>VH: Validar sintaxis, dependencias y seguridad del script
    VH-->>JB: Script validado (0 riesgos detectados)
    JB->>Sandbox: Ejecutar simulación para 365 días terrestres
    Sandbox-->>JB: Salida de posiciones, cálculo de deriva y gráfico generado
    JB->>VH: Comparar resultados numéricos con efemérides de referencia
    VH-->>JB: Desviación orbital < 0.04% (tolerancia aceptable)
    JB->>Humano: Presentar Informe Completo, Código, Gráficos y Márgenes de Error
    Humano-->>JB: Aprobación HITL de Conclusiones
```

### Especificaciones de la Misión Piloto:
- **Objetivo**: Investigar, simular numéricamente y validar las órbitas de los planetas interiores del Sistema Solar (Mercurio, Venus, Tierra, Marte) y Júpiter.
- **Criterios de Aceptación Cuantitativos**:
  1. *Trazabilidad*: Parámetros iniciales referenciados a fuentes de efemérides oficiales (NASA/JPL Horizons).
  2. *Reproducibilidad*: Código Python 100% reproducible y autocontenido con semilla determinista.
  3. *Cuantificación de Error*: Comparación numérica contra datos tabulados; cálculo de error relativo porcentual.
  4. *Honestidad Epistémica*: Declaración explícita de supuestos simplificadores (e.g., gravitación newtoniana clásica sin relatividad general o perturbaciones no esféricas).

---

## 7. Hoja de Ruta de Variables de Capacidad

Para preservar la estabilidad actual de software engineering sin interferir con las pruebas cotidianas, se adoptará un esquema modular de activación conceptual:

| Variable de Configuración | Propósito | Estado Actual |
| :--- | :--- | :--- |
| `USE_LLAMACPP_CODER` | Motor especializado en ingeniería de software (`Qwen2.5-Coder-14B`). | **Activo para Desarrollo / Canary** |
| `USE_SCIENTIFIC_RESEARCH` | Motor transversal de investigación técnica multidisciplinaria (`ScientificResearchEngine`). | **🟡 Pendiente en Backlog** |
| `USE_EXPERIMENTAL_TOOLS` | Runtimes y sandboxes controlados para simulaciones científicas (Python, SPICE, etc.). | **🟡 Pendiente en Backlog** |

---

## 8. Conclusión

JarBees evoluciona desde un asistente de código hacia una **mente técnica generalista con capacidad de orquestación de especialistas**. 

Al dotar al sistema de rigor metodológico, verificación empírica y la habilidad de generar su propio software instrumental, se transforma en una herramienta de investigación de amplio espectro, manteniendo intactos los principios de contención, seguridad y supervisión humana (HITL) que constituyen el núcleo de su arquitectura.

