import { Injectable, Logger } from '@nestjs/common';

export interface DisciplineDefinition {
  key: string;
  name: string;
  synonyms: string[];
  description: string;
  branches: string[];
  historicalMilestones: string[];
  frontiersAndDebates: string[];
}

export interface DisciplineMatch {
  key: string;
  discipline: DisciplineDefinition;
  matchedTerm: string;
  originalQuery: string;
}

@Injectable()
export class DisciplinesCatalogService {
  private readonly logger = new Logger(DisciplinesCatalogService.name);

  private readonly DISCIPLINES: Record<string, DisciplineDefinition> = {
    ciencia: {
      key: 'ciencia',
      name: 'Ciencia (Epistemología y Método Científico)',
      synonyms: ['ciencia', 'ciencias', 'metodo cientifico', 'metodologia cientifica'],
      description:
        'El esfuerzo sistemático, empírico y racional de la humanidad para construir y organizar conocimiento comprobable en forma de explicaciones y predicciones verificables sobre la naturaleza y el universo.',
      branches: [
        'Ciencias Formales (Lógica, Matemáticas, Teoría de la Computación): Sistemas deductivos basados en axiomas ideales, independientes de la experiencia empírica inmediata.',
        'Ciencias Naturales (Física, Química, Biología, Astronomía, Geología): Estudio del universo físico y de los seres vivos a través de observación, medición y experimentación.',
        'Ciencias Sociales y Humanas (Psicología, Sociología, Antropología, Economía, Historia): Estudio del comportamiento humano, las estructuras sociales, la psique y la cultura.',
      ],
      historicalMilestones: [
        'De la Filosofía Natural presocrática y aristotélica al nacimiento del método experimental moderno.',
        'Revolución Científica (siglos XVI-XVII): Copérnico, Galileo Galilei, Johannes Kepler e Isaac Newton.',
        'El Iluminismo y el método inductivo-deductivo (Francis Bacon, René Descartes).',
        'Revoluciones del siglo XX: Mecánica Cuántica (Planck, Bohr, Heisenberg, Schrödinger) y Relatividad (Einstein).',
        'Filosofía de la ciencia contemporánea: Karl Popper (falsabilidad), Thomas Kuhn (paradigmas y revoluciones científicas) y Paul Feyerabend.',
      ],
      frontiersAndDebates: [
        'El "problema difícil de la conciencia" (Chalmers): ¿puede el reduccionismo materialista explicar la experiencia subjetiva?',
        'La unificación de la física: conciliar la Relatividad General con la Mecánica Cuántica (Gravedad Cuántica).',
        'Límites de la computación, inteligencia artificial general y biotecnología (CRISPR, biología sintética).',
        'Ciencia abierta, crisis de reproducibilidad y ética científica global.',
      ],
    },

    astronomia: {
      key: 'astronomia',
      name: 'Astronomía y Astrofísica',
      synonyms: ['astronomia', 'astronomía', 'astrofisica', 'astrofísica'],
      description:
        'La ciencia natural observacional y teórica que estudia los cuerpos celestes (estrellas, planetas, cometas, galaxias), la materia interestelar, las ondas gravitacionales y la estructura global del cosmos.',
      branches: [
        'Astrofísica Estelar y Galáctica: Evolución estelar (de nubes moleculares a supernovas, estrellas de neutrones y agujeros negros) y dinámicas galácticas.',
        'Cosmología: El origen, geometría, expansión y destino final del universo (Big Bang, inflación cósmica, radiación de fondo, energía oscura y materia oscura).',
        'Ciencias Planetarias y Exoplanetología: Estudio del Sistema Solar y caracterización de exoplanetas en zonas de habitabilidad.',
        'Astrobiología: Búsqueda de biofirmas y condiciones para la vida en otros mundos.',
        'Astronomía Multimensajero: Observación combinada mediante radiación electromagnética (óptica, radio, infrarrojo con Webb y Hubble), ondas gravitacionales (LIGO/Virgo) y neutrinos cósmicos.',
      ],
      historicalMilestones: [
        'Observaciones babilónicas, mayas, griegas y árabes de las esferas celestes.',
        'El telescopio de Galileo Galilei y las leyes del movimiento planetario de Kepler.',
        'Gravitación universal de Newton y la astrofísica espectroscópica del siglo XIX.',
        'El universo en expansión de Edwin Hubble (1929) y el descubrimiento de la radiación cósmica de fondo (1965).',
        'Fotografía directa del horizonte de sucesos de un agujero negro (Event Horizon Telescope) y la era James Webb.',
      ],
      frontiersAndDebates: [
        'Naturaleza de la Materia Oscura (~27% del cosmos) y la Energía Oscura (~68%).',
        'Tensión de Hubble (discrepancia en la tasa de expansión cósmica medida por diferentes métodos).',
        'Paradoja de Fermi y búsqueda de inteligencia extraterrestre (SETI).',
        'Singularidades espaciotemporales e inicio del tiempo en el Big Bang.',
      ],
    },

    astrologia: {
      key: 'astrologia',
      name: 'Astrología (Tradición Simbólica y Psicológica)',
      synonyms: ['astrologia', 'astrología'],
      description:
        'Sistema de pensamiento simbólico, arquetípico y hermenéutico que postula correlaciones cualitativas (sincronicidad) entre los ciclos astronómicos y los procesos psicológicos, culturales y temporales humanos.',
      branches: [
        'Astrología Tradicional y Clásica (Helenística, Medieval, Árabe): Énfasis en dignidades planetarias, casas, aspectos mayores y prognosis de eventos concretos.',
        'Astrología Psicológica y Humanística (siglos XX-XXI, Carl Jung, Dane Rudhyar, Liz Greene): La carta natal como mandala o mapa arquetípico del psiquismo; los planetas como funciones psicológicas y arquetipos del inconsciente colectivo.',
        'Astrología Mundana: Estudio de ciclos sociohistóricos y civilizatorios.',
        'Astrología Védica (Jyotish): Sistema sideral tradicional de la India, profundamente ligado a la filosofía védica y el karma.',
      ],
      historicalMilestones: [
        'Orígenes en Mesopotamia y Babilonia: la observación del cielo como presagio y orden divino.',
        'Síntesis helenística (Alejandría, Ptolomeo y el Tetrabiblos).',
        'Separación histórica de la astronomía empírica durante el Renacimiento y la Ilustración científica.',
        'Renacimiento psicológico del siglo XX con la psicología analítica de Carl Gustav Jung y el principio de sincronicidad (conexión por significado, no por causalidad mecanicista).',
      ],
      frontiersAndDebates: [
        'Distinción epistemológica: no es una ciencia empírica en sentido popperiano, sino un lenguaje simbólico y fenomenológico de autoconocimiento.',
        'Causalidad física vs. Sincronicidad acausal: los planetas no "emiten rayos que obligan", sino que funcionan como un reloj cósmico sincrónico.',
        'Determinismo o destino vs. Libre albedrío y proceso de individuación personal.',
      ],
    },

    fisica: {
      key: 'fisica',
      name: 'Física Fundamental',
      synonyms: ['fisica', 'física', 'mecanica cuantica', 'fisica cuantica'],
      description:
        'La ciencia que investiga los constituyentes más elementales de la materia, la energía, el espacio, el tiempo y las interacciones fundamentales que estructuran la realidad física.',
      branches: [
        'Mecánica Clásica (Newton, Lagrange, Hamilton): Movimiento de los cuerpos y dinámica macroscópica determinista.',
        'Electromagnetismo y Óptica (Maxwell): Unificación de electricidad, magnetismo y luz.',
        'Termodinámica y Mecánica Estadística (Carnot, Clausius, Boltzmann): Calor, trabajo, entropía y la flecha irreversible del tiempo.',
        'Relatividad Especial y General (Einstein): Estructura del espacio-tiempo, equivalencia masa-energía y gravitación como curvatura geométrica.',
        'Mecánica Cuántica y Teoría Cuántica de Campos: Dualidad onda-corpúsculo, incertidumbre, superposición, entrelazamiento y el Modelo Estándar de partículas fundamentales.',
      ],
      historicalMilestones: [
        'Principia Mathematica de Isaac Newton (1687): unificación de la física terrestre y celeste.',
        'Ecuaciones de Maxwell (1865): comprensión unificada de la radiación electromagnética.',
        '1905 ("Annus Mirabilis" de Einstein): efecto fotoeléctrico, movimiento browniano y relatividad especial.',
        'Fundación de la teoría cuántica (1900-1927): Planck, Bohr, de Broglie, Heisenberg, Born, Dirac, Schrödinger.',
        'Descubrimiento del Bosón de Higgs en el CERN (2012) y detección de Ondas Gravitacionales (2015).',
      ],
      frontiersAndDebates: [
        'El problema de la Gravedad Cuántica: reconciliar la geometría suave de la Relatividad con las fluctuaciones probabilísticas cuánticas (Teoría de Cuerdas, Gravedad Cuántica de Bucles).',
        'El problema de la medida en mecánica cuántica (interpretaciones: Copenhague, Muchos Mundos, De Broglie-Bohm, Decoherencia).',
        'La naturaleza de la materia oscura y la constante cosmológica.',
      ],
    },

    matematicas: {
      key: 'matematicas',
      name: 'Matemáticas',
      synonyms: ['matematica', 'matematicas', 'matemática', 'matemáticas'],
      description:
        'La ciencia formal deductiva que estudia las estructuras abstractas, relaciones, cantidades, formas y patrones. Constituye el lenguaje formal más riguroso y universal ideado por el intelecto.',
      branches: [
        'Aritmética y Teoría de Números: Propiedades de los enteros, números primos, criptografía moderna.',
        'Álgebra (Lineal y Abstracta): Grupos, anillos, cuerpos, espacios vectoriales y simetrías fundamentales.',
        'Geometría y Topología: Propiedades espaciales, variedades diferenciables, invariantes topológicos y curvatura.',
        'Análisis y Cálculo (Diferencial, Integral, Complejo): Estudio del cambio continuo, series infinitas y límites.',
        'Probabilidad y Estadística: Modelado matemático del azar, inferencia, teoría de la información y procesos estocásticos.',
        'Lógica Matemática y Fundamentos: Teoría de conjuntos (ZFC), modelos formales, computabilidad y algoritmos.',
        'Sistemas Dinámicos y Teoría del Caos: Sensibilidad a condiciones iniciales, fractales y atractores extraños.',
      ],
      historicalMilestones: [
        'Geometría euclidiana y la deducción axiomática rigurosa en la antigua Grecia.',
        'Desarrollo del álgebra y del sistema posicional decimal (Al-Juarismi, matemáticos indios y árabes).',
        'Invención del cálculo infinitesimal independiente por Newton y Leibniz en el siglo XVII.',
        'El programa de formalización de Hilbert y los Teoremas de Incompletitud de Kurt Gödel (1931).',
        'Resolución del Último Teorema de Fermat (Andrew Wiles, 1994) y la Conjetura de Poincaré (Grigori Perelman, 2003).',
      ],
      frontiersAndDebates: [
        '¿Se descubren o se inventan las matemáticas? (Platonismo vs. Formalismo vs. Constructivismo).',
        '"La irrazonable efectividad de la matemática en las ciencias naturales" (Eugene Wigner).',
        'Los Problemas del Milenio sin resolver (Hipótesis de Riemann, P vs NP, Navier-Stokes).',
      ],
    },

    metafisica: {
      key: 'metafisica',
      name: 'Metafísica (Filosofía Primera)',
      synonyms: ['metafisica', 'metafísica', 'ontologia', 'ontología'],
      description:
        'La rama fundacional de la filosofía que interroga la naturaleza última de la realidad, los principios primeros de la existencia, el significado del "ser" y aquello que trasciende la experiencia física empírica.',
      branches: [
        'Ontología: Estudio del "ser en cuanto ser". ¿Qué cosas existen fundamentalmente? Sustancias, propiedades, universales vs. particulares, modalidades (posibilidad y necesidad).',
        'Tiempo, Espacio y Causalidad: ¿El tiempo es un flujo real (presentismo) o una dimensión bloque (eternalismo)? ¿Qué es una causa? Libre albedrío vs. determinismo estricto.',
        'Filosofía de la Mente y el Problema Mente-Cuerpo: Dualismo sustancial, materialismo fisicalista, funcionalismo, idealismo y panpsiquismo.',
        'Cosmología Filosófica y Causa Primera: El principio antrópico, la contingencia del cosmos y la gran pregunta de Leibniz: "¿Por qué hay algo en lugar de nada?".',
      ],
      historicalMilestones: [
        'Presocráticos: Parménides (la inmutabilidad del Ser) y Heráclito (el devenir y el flujo constante).',
        'Platón (el Mundo de las Ideas inteligibles) y Aristóteles (la Filosofía Primera, sustancia, potencia y acto).',
        'Metafísica escolástica medieval (Tomás de Aquino, Duns Escoto, Guillermo de Ockham).',
        'La crítica demoledora de Immanuel Kant (Crítica de la Razón Pura): los límites del conocimiento fenoménico.',
        'El siglo XX y contemporáneo: Martin Heidegger (la pregunta por el ser), la metafísica analítica (Kripke, Lewis) y la ontología orientada a objetos.',
      ],
      frontiersAndDebates: [
        '¿Tiene sentido la metafísica frente al positivismo y el cientificismo moderno?',
        'Metafísica cuántica: ¿la física cuántica refuta el realismo local y el reduccionismo mecanicista?',
        'La naturaleza de la conciencia como aspecto fundamental del cosmos (Monismo de doble aspecto / Panpsiquismo analítico).',
      ],
    },

    parapsicologia: {
      key: 'parapsicologia',
      name: 'Parapsicología e Investigación Anómala de la Conciencia',
      synonyms: ['parapsicologia', 'parapsicología', 'fenomenos anomalos', 'fenomenos anómalos'],
      description:
        'Campo de estudio interdisciplinario que investiga de manera fenomenológica y empírica supuestas anomalías cognitivas, perceptivas y de interacción mente-materia que desafían el marco reduccionista mecanicista estándar.',
      branches: [
        'Percepción Extrasensorial (ESP): Telepatía (comunicación menta-mente), clarividencia (acceso a información remota) y precognición.',
        'Psicoquinesis (PK / micro-PK): Supuesta influencia de la intención mental sobre sistemas físicos macroscópicos o generadores de números aleatorios (REG/RNG).',
        'Fenomenología de la Trascendencia y Supervivencia: Experiencias Cercanas a la Muerte (ECM / NDE), Experiencias Fuera del Cuerpo (OBE / desdoblamiento astral) y recuerdos de vidas pasadas (Ian Stevenson).',
        'Estados Alterados de Conciencia: Hipnosis profunda, meditación avanzada, protocolos Ganzfeld y privación sensorial.',
      ],
      historicalMilestones: [
        'Fundación de la Society for Psychical Research (SPR) en Londres (1882) con filósofos y científicos victorianos.',
        'Investigaciones cuantitativas de J.B. Rhine en la Universidad de Duke (años 1930) y creación de las cartas Zener.',
        'Protocolos de laboratorio Ganzfeld (Charles Honorton) para aislamiento sensorial y reducción de ruido cognitivo.',
        'Proyecto PEAR (Princeton Engineering Anomalies Research, Robert Jahn, 1979-2007) sobre micro-PK en microelectrónica.',
        'Estudios médicos contemporáneos sobre ECM en paro cardíaco (Pim van Lommel, Sam Parnia en The Lancet y Resuscitation).',
      ],
      frontiersAndDebates: [
        'Tensión dialéctica entre el rigor metodológico experimental y el escepticismo de la ciencia oficial (problemas de reproducibilidad a demanda, efecto del experimentador).',
        'El cerebro como generador vs. El cerebro como receptor/reductor de la conciencia (Henri Bergson, William James, Aldous Huxley).',
        'Modelos teóricos basados en no-localidad cuántica, entrelazamiento informacional y la Teoría Sintérgica de Jacobo Grinberg.',
      ],
    },

    filosofia: {
      key: 'filosofia',
      name: 'Filosofía',
      synonyms: ['filosofia', 'filosofía'],
      description:
        'El ejercicio crítico, sistemático y racional de examinar las preguntas fundamentales sobre la existencia, el conocimiento, la verdad, la moral, la belleza, la mente y el lenguaje.',
      branches: [
        'Epistemología: Teoría del conocimiento, justificación, límites de la razón y verdad.',
        'Ética y Filosofía Moral: El bien, el deber, la virtud, el utilitarismo y el dilema de la acción humana.',
        'Filosofía Política: La justicia, el poder, el contrato social, los derechos y el Estado.',
        'Lógica: Las reglas del razonamiento válido y la argumentación formal e informal.',
        'Estética: La naturaleza del arte, la belleza, la percepción estética y el juicio crítico.',
        'Filosofía de la Mente y del Lenguaje: La conciencia, el significado, la referencia y la relación entre pensamiento y signos.',
      ],
      historicalMilestones: [
        'Presocráticos y el giro socrático: Sócrates, Platón y Aristóteles.',
        'Filosofía helenística y romana: Estoicismo (Séneca, Marco Aurelio), Epicureísmo y Escepticismo.',
        'La Ilustración y la Modernidad: Descartes, Spinoza, Locke, Hume, Kant.',
        'Siglo XIX: Hegel, Schopenhauer, Kierkegaard, Marx, Nietzsche.',
        'Siglo XX: Fenomenología (Husserl, Merleau-Ponty), Existencialismo (Sartre, Camus), Filosofía Analítica (Russell, Wittgenstein) y Posestructuralismo (Foucault, Derrida).',
      ],
      frontiersAndDebates: [
        'La ética en la era de la inteligencia artificial y la modificación genética.',
        'Realismo vs. Antirrealismo y Posverdad en la era digital.',
        'Sentido de la existencia en un universo post-teológico y secular.',
      ],
    },

    psicologia: {
      key: 'psicologia',
      name: 'Psicología y Ciencias de la Psique',
      synonyms: ['psicologia', 'psicología'],
      description:
        'La disciplina científica que investiga los procesos mentales, las emociones, la percepción, la cognición, el inconsciente y la conducta individual y relacional humana.',
      branches: [
        'Psicoanálisis (Freud, Lacan): El inconsciente reprimido, el deseo, los sueños y la estructura pulsional.',
        'Psicología Analítica (Carl Gustav Jung): Arquetipos, inconsciente colectivo, individuación, sincronicidad y tipología psicológica.',
        'Conductismo y Cognitivismo (Watson, Skinner, Beck, Ellis): Esquemas cognitivos, procesamiento de información y modificación de conducta.',
        'Psicología Humanista y Existencial (Rogers, Maslow, Viktor Frankl): Autorrealización, sentido de vida y potencial humano.',
        'Neuropsicología y Psicología Cognitiva: Bases neurobiológicas de la memoria, la atención, el lenguaje y las funciones ejecutivas.',
        'Psicología Transpersonal (Stanislav Grof, Ken Wilber): Estados holotrópicos, espiritualidad y dimensiones no ordinarias de la psique.',
      ],
      historicalMilestones: [
        'Laboratorio de Leipzig de Wilhelm Wundt (1879): nacimiento de la psicología experimental.',
        'La Interpretación de los Sueños de Sigmund Freud (1900) y la ruptura junguiana.',
        'La revolución cognitiva de mediados del siglo XX frente al conductismo radical.',
        'Integración contemporánea con la neurociencia afectiva y las ciencias cognitivas computacionales.',
      ],
      frontiersAndDebates: [
        'El debate natura vs. nurtura (genética vs. ambiente en la personalidad y conducta).',
        'Eficacia relativa de diferentes escuelas psicoterapéuticas.',
        'Impacto de la tecnología, redes sociales y algoritmos en la salud mental contemporánea.',
      ],
    },

    quimica: {
      key: 'quimica',
      name: 'Química',
      synonyms: ['quimica', 'química'],
      description:
        'La ciencia de la materia que estudia la composición, estructura, propiedades y transformaciones de las sustancias a escala atómica y molecular, y la energía intercambiada en dichas transformaciones.',
      branches: [
        'Química Orgánica: Compuestos del carbono, química de los seres vivos y síntesis de macromoléculas.',
        'Química Inorgánica: Estructura y reactividad de minerales, metales y compuestos no orgánicos.',
        'Fisicoquímica: Termodinámica química, cinética de reacciones y mecánica cuántica molecular.',
        'Bioquímica: Procesos químicos dentro de los organismos vivos (enzimas, ADN, proteínas, metabolismo).',
        'Química Analítica: Técnicas de separación, identificación y cuantificación de materias (espectrometría, cromatografía).',
      ],
      historicalMilestones: [
        'De la alquimia medieval y renacentista al nacimiento de la química cuantitativa.',
        'Antoine Lavoisier y la ley de conservación de la masa (finales del siglo XVIII).',
        'Tabla Periódica de los Elementos de Dmitri Mendeléyev (1869).',
        'Estructura del enlace químico y orbitales moleculares (Linus Pauling).',
      ],
      frontiersAndDebates: [
        'Química verde y sostenible (captura de carbono, catálisis ecológica).',
        'Nanotecnología y diseño molecular computacional con inteligencia artificial (AlphaFold).',
      ],
    },

    biologia: {
      key: 'biologia',
      name: 'Biología y Ciencias de la Vida',
      synonyms: ['biologia', 'biología'],
      description:
        'La ciencia natural que estudia la vida y los organismos vivos: su estructura, funcionamiento, crecimiento, origen, evolución y distribución ecológica.',
      branches: [
        'Biología Molecular y Genética: El código genético (ADN, ARN), herencia, expresión génica y epigenética.',
        'Biología Celular: La célula como unidad funcional de la vida y sus procesos metabólicos.',
        'Biología Evolutiva: Mecanismos de selección natural, especiación y filogenia.',
        'Ecología: Interacciones entre los organismos y su entorno biosférico.',
        'Fisiología y Anatomía: Funcionamiento integrado de órganos y sistemas en plantas y animales.',
      ],
      historicalMilestones: [
        'Teoría celular (Schwann, Schleiden, Virchow).',
        'Charles Darwin y Alfred Russel Wallace: El Origen de las Especies y la Selección Natural (1859).',
        'Leyes de la herencia de Gregor Mendel.',
        'Descubrimiento de la estructura de doble hélice del ADN (Watson, Crick, Franklin, 1953).',
        'Secuenciación del Genoma Humano y la era de la edición genética CRISPR-Cas9.',
      ],
      frontiersAndDebates: [
        'El origen abiótico de la vida (abiogénesis): ¿cómo emergió la primera célula autorreplicante?',
        'Edición genética en la línea germinal humana y bioseguridad.',
        'Resiliencia de la biosfera frente al Antropoceno y cambio climático.',
      ],
    },

    neurociencia: {
      key: 'neurociencia',
      name: 'Neurociencia',
      synonyms: ['neurociencia', 'neurociencias'],
      description:
        'El estudio interdisciplinario del sistema nervioso y del cerebro humano: su desarrollo, estructura celular, redes neuronales, plasticidad y correlatos biológicos de la cognición y la conducta.',
      branches: [
        'Neurobiología Celular y Molecular: Neuronas, células gliales, canales iónicos y neurotransmisión.',
        'Neurociencia Cognitiva: Cómo los circuitos cerebrales generan percepción, memoria, lenguaje y toma de decisiones.',
        'Neurociencia Computacional: Modelado matemático de redes neuronales y procesamiento de información.',
        'Neuroimagen y Neurotecnología: fMRI, EEG, interfaces cerebro-computadora (BCI).',
      ],
      historicalMilestones: [
        'Doctrina de la neurona de Santiago Ramón y Cajal (Nobel 1906).',
        'El potencial de acción y las ecuaciones de Hodgkin-Huxley (1952).',
        'Descubrimiento de la neuroplasticidad en el cerebro adulto.',
        'Interfaces cerebro-computadora de última generación.',
      ],
      frontiersAndDebates: [
        'Los correlatos neuronales de la conciencia (NCC): ¿cómo la actividad electroquímica genera vivencia subjetiva?',
        'Interfaces cerebro-computadora invasivas y no invasivas y neuroderechos.',
      ],
    },

    antropologia: {
      key: 'antropologia',
      name: 'Antropología',
      synonyms: ['antropologia', 'antropología'],
      description:
        'El estudio integral y comparativo del ser humano en todas sus dimensiones: evolución biológica, lenguaje, mitos, rituales, cultura y organización social.',
      branches: [
        'Antropología Biológica/Física: Evolución de los homínidos, paleoantropología y diversidad biológica humana.',
        'Antropología Cultural y Social: Etnografía, sistemas de parentesco, mitos, rituales y cosmovisiones.',
        'Antropología Lingüística: El lenguaje como constructor de realidad y cultura.',
        'Arqueología: Estudio del pasado humano a través de restos materiales.',
      ],
      historicalMilestones: [
        'De las crónicas coloniales al método etnográfico moderno de trabajo de campo (Bronisław Malinowski).',
        'Antropología cultural de Franz Boas y relativismo cultural.',
        'Estructuralismo antropológico de Claude Lévi-Strauss (las estructuras elementales del parentesco y el mito).',
      ],
      frontiersAndDebates: [
        'Etnografía digital y comunidades virtuales.',
        'Descolonización del pensamiento antropológico y pluralismo ontológico.',
      ],
    },

    sociologia: {
      key: 'sociologia',
      name: 'Sociología',
      synonyms: ['sociologia', 'sociología'],
      description:
        'La ciencia social que analiza las sociedades humanas, las instituciones, las dinámicas de poder, la cultura colectiva, la estratificación y los cambios estructurales.',
      branches: [
        'Teoría Sociológica Clásica y Contemporánea.',
        'Sociología Política y del Poder.',
        'Sociología de la Cultura, del Conocimiento y de la Religión.',
        'Estratificación social, clases y desigualdades.',
      ],
      historicalMilestones: [
        'Los padres fundadores: Auguste Comte, Karl Marx, Émile Durkheim y Max Weber.',
        'Escuela de Chicago y el interaccionismo simbólico.',
        'Teoría crítica de la Escuela de Frankfurt (Adorno, Horkheimer, Habermas).',
        'Sociología contemporánea: Pierre Bourdieu (habitus y campos), Zygmunt Bauman (modernidad líquida).',
      ],
      frontiersAndDebates: [
        'La sociedad algorítmica y el capitalismo de vigilancia (Zuboff).',
        'Polarización social, cámaras de eco y transformación del espacio público.',
      ],
    },

    historia: {
      key: 'historia',
      name: 'Historia e Historiografía',
      synonyms: ['historia', 'historiografia', 'historiografía'],
      description:
        'La disciplina humanística que reconstruye, analiza e interpreta de manera crítica el pasado de las sociedades humanas a través de fuentes y evidencias testimoniales.',
      branches: [
        'Historia Política, Social y Económica.',
        'Historia Cultural y de las Mentalidades.',
        'Historiografía y Filosofía de la Historia.',
      ],
      historicalMilestones: [
        'Heródoto y Tucídides en la Grecia clásica.',
        'El método historicista del siglo XIX (Leopold von Ranke).',
        'La Escuela de los Annales (Marc Bloch, Lucien Febvre, Fernand Braudel): la larga duración y la historia total.',
      ],
      frontiersAndDebates: [
        'Memoria histórica colectiva vs. Historia crítica.',
        'Historia global y descentramiento eurocéntrico.',
      ],
    },

    epistemologia: {
      key: 'epistemologia',
      name: 'Epistemología (Teoría del Conocimiento)',
      synonyms: ['epistemologia', 'epistemología', 'teoria del conocimiento'],
      description:
        'La rama filosófica que indaga la naturaleza, origen, alcance y justificación del conocimiento humano, distinguiendo la opinión de la certeza justificada.',
      branches: [
        'Epistemología General: ¿Qué es el conocimiento? Creencia verdadera justificada (el problema de Gettier).',
        'Epistemología de la Ciencia: Validez de modelos, inducción, deducción y abducción.',
      ],
      historicalMilestones: [
        'Racionalismo (Descartes, Spinoza) vs. Empirismo (Locke, Berkeley, Hume).',
        'Síntesis kantiana del conocimiento a priori y a posteriori.',
        'Karl Popper, Thomas Kuhn, Imre Lakatos y Paul Feyerabend.',
      ],
      frontiersAndDebates: [
        'Epistemología social y testimonios en la era de la inteligencia artificial.',
      ],
    },

    cosmologia: {
      key: 'cosmologia',
      name: 'Cosmología',
      synonyms: ['cosmologia', 'cosmología'],
      description:
        'La rama de la astrofísica y la física teórica que investiga el universo a gran escala: su origen, geometría espacial, evolución y destino último.',
      branches: [
        'Cosmología Teórica: Modelos relativistas del espacio-tiempo (métrica FLRW).',
        'Cosmología Observacional: Medición de la radiación cósmica de fondo y supernovas lejanas.',
      ],
      historicalMilestones: [
        'Modelo del Big Bang propuesto por Georges Lemaître (1927).',
        'Descubrimiento de la aceleración de la expansión cósmica (1998).',
      ],
      frontiersAndDebates: [
        'El multiverso y el problema de la constante cosmológica.',
        '¿Qué ocurrió "antes" del Big Bang? Cosmología de rebote o inflación eterna.',
      ],
    },
  };

  private readonly NON_PANORAMIC_MARKERS = [
    /\b(?:libro|libros|pdf|pdfs|documento|documentos|archivo|archivos|biblioteca|mis\s+notas|mis\s+documentos)\b/i,
    /\b(?:busca|buscar|buscame|en\s+mis|segun\s+mis|segun\s+el)\b/i,
    /\b(?:resumen\s+de|resumime|puntos\s+clave\s+de)\b/i,
    /\b(?:van\s+lommel|pim\s+van|jung|freud|lacan|blavatsky|monroe|leadbeater|muldoon|ziewe|agrippa|jodorowsky|villoldo|saban|cordovero)\b/i,
    /\b(?:hoy|esta\s+noche|esta\s+semana|posicion(?:es)?\s+planetari\w+|carta\s+natal|signo\s+solar|signo\s+lunar|luna\s+llena|luna\s+nueva|fase\s+lunar)\b/i,
    /\b(?:\d+[\s+\-*/]+\d+|cuanto\s+es\s+\d+|calcular\s+\d+)\b/i,
  ];

  private readonly PANORAMIC_PATTERNS = [
    /y\s+si\s+te\s+pregunto\s+(?:sobre|de)\s+/i,
    /y\s+si\s+hablamos\s+(?:sobre|de)\s+/i,
    /que\s+(?:me\s+)?(?:dirias|decis|podes\s+decir(?:me)?)\s+(?:sobre|de)\s+/i,
    /que\s+podes\s+decirme\s+(?:sobre|de)\s+/i,
    /que\s+(?:sabes|sabés)\s+(?:sobre|de)\s+/i,
    /que\s+(?:opinas|opinás|pensas|pensás|crees|creés)\s+(?:sobre|de)\s+/i,
    /hablemos\s+(?:sobre|de)\s+/i,
    /habla(?:me)?\s+(?:sobre|de)\s+/i,
    /contame\s+(?:sobre|de)\s+/i,
    /cuentame\s+(?:sobre|de)\s+/i,
    /como\s+(?:ves|definirias|definirías)\s+(?:a\s+)?(?:la\s+|las\s+|el\s+|los\s+)?/i,
    /de\s+que\s+trata\s+(?:la\s+|las\s+|el\s+|los\s+)?/i,
    /que\s+onda\s+con\s+(?:la\s+|las\s+|el\s+|los\s+)?/i,
    /que\s+tal\s+(?:la\s+|las\s+|el\s+|los\s+)?/i,
    /que\s+es\s+(?:la\s+|el\s+|las\s+|los\s+)?/i,
    /que\s+son\s+(?:las\s+|los\s+)?/i,
    /dame\s+(?:un\s+)?panorama\s+(?:de|sobre)\s+/i,
    /introduccion\s+a\s+(?:la\s+|el\s+|las\s+|los\s+)?/i,
    /explicame\s+que\s+es\s+(?:la\s+|el\s+)?/i,
    /^\s*[¿?]?\s*[\w\s]+\s+que\s+es\s*[¿?]?\s*$/i,
    /^\s*[¿?]?\s*[\w\s]+\s*[¿?]?\s*$/i,
  ];

  private normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  detectDisciplineQuery(query: string): DisciplineMatch | null {
    if (!query || typeof query !== 'string') return null;
    const qNorm = this.normalize(query);

    // 1. Descartar si el usuario apunta a un documento o consulta técnica puntual
    for (const marker of this.NON_PANORAMIC_MARKERS) {
      if (marker.test(qNorm)) return null;
    }

    // 2. Comprobar si menciona una disciplina catalogada
    for (const discipline of Object.values(this.DISCIPLINES)) {
      for (const term of discipline.synonyms) {
        const normTerm = this.normalize(term);
        const termRegex = new RegExp(`\\b${normTerm}\\b`, 'i');
        if (termRegex.test(qNorm)) {
          // 3. Comprobar si la estructura de la consulta es abierta / panorámica
          const isPanoramic = this.PANORAMIC_PATTERNS.some((p) =>
            p.test(qNorm),
          );
          if (isPanoramic) {
            return {
              key: discipline.key,
              discipline,
              matchedTerm: term,
              originalQuery: query,
            };
          }
        }
      }
    }

    return null;
  }

  isDisciplinePanoramicQuery(query: string): boolean {
    return this.detectDisciplineQuery(query) !== null;
  }

  formatContextForQuery(query: string): string | null {
    const match = this.detectDisciplineQuery(query);
    if (!match) return null;

    const d = match.discipline;
    const lines: string[] = [
      `### MARCO DE CONOCIMIENTO PANORÁMICO: ${d.name.toUpperCase()}`,
      `El usuario planteó una consulta reflexiva y panorámica sobre la disciplina de **${d.name}**.`,
      '',
      '🎯 DIRECTRICES DE RESPUESTA (ESTILO JARVIS / IRON MAN):',
      '1. VISIÓN PANORÁMICA Y MULTIDISCIPLINARIA: Ofrecé una síntesis lúcida, rica y estructurada del campo del saber. No te limites ni sesgues la respuesta hacia una sola obra o experimento aislado.',
      '2. ESTRUCTURA RECOMENDADA:',
      '   - Esencia y definición del campo (objeto de estudio y método).',
      '   - Grandes ramas, corrientes o pilares conceptuales fundamentales.',
      '   - Hitos históricos clave y debates, misterios o fronteras contemporáneas.',
      '3. ESTILO Y TONO: Culto, ágil, elocuente y empático. Respondé en español argentino natural al estilo JARVIS.',
      '4. CIERRE CONVERSACIONAL: Finalizá invitando cálidamente al usuario a profundizar en la rama, enigma o vertiente que más despierte su curiosidad.',
      '5. PROHIBICIÓN ESTRICTA: Queda terminantemente PROHIBIDO reducir o secuestrar la respuesta centrándote de forma excluyente en un único subtema de nicho (por ejemplo, hablar únicamente de experiencias cercanas a la muerte ante una pregunta sobre ciencia, o solo de horóscopos diarios ante una pregunta sobre astrología).',
      '',
      '📚 SÍNTESIS DE LA DISCIPLINA:',
      `• Definición: ${d.description}`,
      '• Ramas y Enfoques Principales:',
      ...d.branches.map((b) => `  - ${b}`),
      '• Hitos Históricos y Evolución:',
      ...d.historicalMilestones.map((h) => `  - ${h}`),
      '• Fronteras Contemporáneas y Debates:',
      ...d.frontiersAndDebates.map((f) => `  - ${f}`),
    ];

    return lines.join('\n');
  }
}
