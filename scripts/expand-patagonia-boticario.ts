import * as fs from 'fs';
import * as path from 'path';

export interface PatagonianPlantSeed {
  slug: string;
  nombre: string;
  nombreCientifico: string;
  familia: string;
  otrosNombres: string[];
  origen: string;
  distribucion: string[];
  habitat: string;
  ecoregion: 'Bosque Andino-Patagónico' | 'Estepa Patagónica' | 'Bosque y Estepa / Transición' | 'Introducida / Naturalizada en Patagonia';
  acciones: string[];
  sistemas: string[];
  afecciones: string[];
  usosEtnobotanicos: string[];
  principiosActivos: string[];
  polinizadores: string[];
  precauciones: string[];
  contraindicaciones: string[];
  toxicidad: string | null;
  epocaFloracion: string;
  epocaFructificacion: string;
  tipoCiclo: string;
  descripcion: string;
  formasDeUso: string;
  fuentes: Array<{ titulo: string; tipo: 'PDF' | 'libro' | 'articulo' | 'web' | 'otro'; url?: string }>;
}

const F_MINSAL = {
  titulo: 'MINSAL Chile — Medicamentos Herbarios Tradicionales (103 especies vegetales)',
  tipo: 'PDF' as const,
  url: 'https://www.minsal.cl/wp-content/uploads/2018/02/Libro-MHT-2010.pdf',
};
const F_SIB = {
  titulo: 'SIB — Sistema de Información de Biodiversidad (Parques Nacionales Argentina)',
  tipo: 'web' as const,
  url: 'https://sib.gob.ar',
};
const F_CONICET = {
  titulo: 'CONICET / INIBIOMA — Etnobotánica de Plantas Medicinales de la Patagonia (Ladio & Molares; CENPAT)',
  tipo: 'articulo' as const,
  url: 'https://ri.conicet.gov.ar/handle/11336/5611',
};
const F_HERBO = {
  titulo: 'Herbotecnia — Flora Medicinal Argentina y Patagónica',
  tipo: 'web' as const,
  url: 'https://www.herbotecnia.com.ar',
};

/**
 * 47 especies botánicamente únicas de la flora medicinal de la Patagonia
 * (complementan las 9 especies ya existentes en G:\Projects2\PlantasMedicinales:
 * diente-de-leon, llanten, melisa, menta, ortiga, paico, sauco, marrubio [toronjil cuyano] y vara-de-oro [vara amarilla],
 * completando las 56 especies sin duplicación taxonómica).
 */
export const PATAGONIA_NEW_PLANTS: PatagonianPlantSeed[] = [
  {
    slug: 'ajenjo',
    nombre: 'Ajenjo',
    nombreCientifico: 'Artemisia absinthium L.',
    familia: 'Asteraceae',
    otrosNombres: ['Ajenjo común', 'Ajenjo mayor', 'Hierba santa', 'Absenta'],
    origen: 'Europa y Asia templada (naturalizada en Patagonia)',
    distribucion: ['Argentina (Patagonia)', 'Chile', 'Europa', 'América'],
    habitat: 'Bordes de caminos, baldíos, huertas y suelos secos soleados de la Patagonia',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Digestiva', 'Tónica amarga', 'Antiparasitaria', 'Carminativa', 'Colerética'],
    sistemas: ['Digestivo', 'Hepático'],
    afecciones: ['Indigestión', 'Falta de apetito', 'Parásitos intestinales', 'Gases', 'Digestión lenta'],
    usosEtnobotanicos: ['Tónico amargo clásico de la herbolaria rural patagónica', 'Repelente natural de insectos en jardines y huertas'],
    principiosActivos: ['Absintina', 'Aceites esenciales (tuyona, felandreno)', 'Flavonoides', 'Lactonas sesquiterpénicas'],
    polinizadores: ['Viento (anemófila)', 'Insectos pequeños'],
    precauciones: ['Usar en dosis bajas y por períodos cortos (máximo 1 a 2 semanas)', 'No consumir aceite esencial puro por vía interna'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Epilepsia', 'Úlcera gastroduodenal activa'],
    toxicidad: 'El exceso o uso prolongado puede resultar neurotóxico debido a la tuyona',
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'subarbusto perenne aromático plateado',
    descripcion: 'Subarbusto perenne muy aromático de hojas verde-plateadas sedosas y profundamente divididas, con sabor intensamente amargo. A diferencia del ajenjo dulce (Artemisia annua), es el clásico ajenjo amargo tónico-digestivo ampliamente aclimatado en la Patagonia.',
    formasDeUso: 'Infusión suave de 1 cucharadita rasa de hojas secas en 250 ml de agua hirviendo, reposar 5 minutos; tomar antes o después de las comidas por ciclos breves.',
    fuentes: [F_MINSAL, F_HERBO],
  },
  {
    slug: 'alfilerecillo',
    nombre: 'Alfilerecillo',
    nombreCientifico: 'Erodium cicutarium (L.) L\'Hér.',
    familia: 'Geraniaceae',
    otrosNombres: ['Alfilerillo', 'Peludilla', 'Relojito', 'Aguja de pastor'],
    origen: 'Región mediterránea (ampliamente naturalizada en la estepa patagónica)',
    distribucion: ['Argentina (Patagonia y centro)', 'Chile', 'Europa', 'América'],
    habitat: 'Suelos arenosos, estepa arbustiva, praderas perturbadas y banquinas',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Astringente', 'Hemostática', 'Diurética', 'Antiinflamatoria', 'Cicatrizante'],
    sistemas: ['Renal', 'Reproductor Femenino', 'Tegumentario'],
    afecciones: ['Sangrado menstrual abundante', 'Retención de líquidos', 'Afecciones renales leves', 'Heridas superficiales', 'Diarrea leve'],
    usosEtnobotanicos: ['Forrajera temprana en la estepa patagónica', 'Empleada popularmente en lavados cicatrizantes y tisanas depurativas'],
    principiosActivos: ['Taninos', 'Flavonoides', 'Ácido gálico', 'Saponinas', 'Vitamina K'],
    polinizadores: ['Abejas', 'Sírfidos'],
    precauciones: ['Consultar profesional ante hemorragias persistentes o anemia'],
    contraindicaciones: ['Embarazo (evitar uso interno sin indicación médica)'],
    toxicidad: null,
    epocaFloracion: 'septiembre a enero',
    epocaFructificacion: 'octubre a febrero',
    tipoCiclo: 'hierba anual o bienal rastrera',
    descripcion: 'Hierba pequeña de hojas pinnadas en roseta basal, flores rosado-violáceas delicadas y frutos alargados en forma de aguja o alfiler que se enroscan en espiral al secarse.',
    formasDeUso: 'Infusión de la planta aérea seca (1 cucharada por taza) hasta 2 veces al día, o decocción más concentrada para lavados externos en heridas.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'aljaba',
    nombre: 'Aljaba',
    nombreCientifico: 'Fuchsia magellanica Lam.',
    familia: 'Onagraceae',
    otrosNombres: ['Chilco', 'Aljaba silvestre', 'Palo blanco', 'Fucsia patagónica'],
    origen: 'Bosques templados australes de Argentina y Chile',
    distribucion: ['Argentina (Patagonia andina)', 'Chile (centro-sur y austral)'],
    habitat: 'Sotobosque húmedo, márgenes de arroyos, lagos y quebradas sombreadas',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Diurética', 'Febrífuga', 'Emenagoga', 'Refrescante', 'Antiinflamatoria'],
    sistemas: ['Renal', 'Reproductor Femenino', 'Inmunológico'],
    afecciones: ['Fiebre', 'Retención de líquidos', 'Desórdenes menstruales leves', 'Cistitis leve'],
    usosEtnobotanicos: ['Planta emblemática del bosque valdiviano y patagónico', 'Sus bayas negras (chilcos) son comestibles en la tradición mapuche', 'Usada para bajar la fiebre y regular el ciclo'],
    principiosActivos: ['Antocianinas', 'Flavonoides (quercetina, kaempferol)', 'Taninos', 'Ácidos fenólicos'],
    polinizadores: ['Picaflor rubí (Sephanoides sephaniodes)', 'Abejorros nativos'],
    precauciones: ['No exceder las dosis tradicionales en personas con hipotensión'],
    contraindicaciones: ['Embarazo (por su uso tradicional emenagogo)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a abril',
    epocaFructificacion: 'enero a mayo',
    tipoCiclo: 'arbusto nativo caducifolio a semicaducifolio',
    descripcion: 'Arbusto nativo emblemático de los bosques húmedos andino-patagónicos, famoso por sus flores colgantes bicolores de cáliz rojo intenso y corola violácea. Polinizado principalmente por el picaflor rubí.',
    formasDeUso: 'Infusión de flores y hojas tiernas (1 cucharada por taza de agua hirviendo), 1 a 2 tazas diarias; decocción suave de corteza en usos tradicionales febrífugos.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'arrayan',
    nombre: 'Arrayán',
    nombreCientifico: 'Luma apiculata (DC.) Burret',
    familia: 'Myrtaceae',
    otrosNombres: ['Quetri', 'Temu', 'Palo colorado', 'Arrayán patagónico'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile (Valparaíso a Aysén)'],
    habitat: 'Riberas de lagos y ríos, bosques húmedos valdivianos y andinos',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Astringente', 'Antiséptica', 'Balsámica', 'Cicatrizante', 'Antidiarreica'],
    sistemas: ['Digestivo', 'Respiratorio', 'Tegumentario'],
    afecciones: ['Diarrea', 'Heridas y úlceras cutáneas', 'Gingivitis', 'Afecciones respiratorias leves', 'Inflamación de encías'],
    usosEtnobotanicos: ['Árbol sagrado y medicinal del pueblo mapuche (quetri)', 'Frutos morados comestibles usados para dulces y bebidas fermentadas', 'Hojas aromáticas usadas en gárgaras y baños'],
    principiosActivos: ['Aceites esenciales (alfa-pineno, cineol, limoneno)', 'Taninos', 'Flavonoides', 'Triterpenos'],
    polinizadores: ['Abejas', 'Abejorros nativos', 'Moscardones'],
    precauciones: ['Recolectar hojas sin dañar la corteza viva del árbol (especie protegida en parques nacionales)'],
    contraindicaciones: ['Estreñimiento crónico severo (por su alta astringencia)'],
    toxicidad: null,
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a mayo',
    tipoCiclo: 'árbol o arbusto perennifolio nativo de corteza canela',
    descripcion: 'Árbol nativo inconfundible por su corteza lisa color canela-anaranjado con manchas blanquecinas y fría al tacto. Posee hojas aromáticas verde oscuro terminadas en punta aguda (apiculadas) y abundantes flores blancas estivales.',
    formasDeUso: 'Infusión de 1 cucharadita de hojas por taza para afecciones digestivas leves; decocción concentrada en buches, gárgaras o compresas sobre heridas.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'bailahuen',
    nombre: 'Bailahuén',
    nombreCientifico: 'Haplopappus baylahuen J. Rémy',
    familia: 'Asteraceae',
    otrosNombres: ['Baylahuén', 'Vailahuén', 'Chejchra'],
    origen: 'Cordillera de los Andes (Argentina y Chile)',
    distribucion: ['Argentina (cordillera andina y patagónica)', 'Chile (cordillera norte a sur)'],
    habitat: 'Laderas rocosas de alta montaña y estepa cordillerana árida',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Hepatoprotectora', 'Digestiva', 'Antiséptica', 'Colerética', 'Expectorante'],
    sistemas: ['Hepático', 'Digestivo', 'Respiratorio', 'Tegumentario'],
    afecciones: ['Cólicos abdominales', 'Digestión difícil', 'Trastornos hepáticos leves', 'Resfríos', 'Heridas superficiales'],
    usosEtnobotanicos: ['Una de las plantas andinas más prestigiosas para el hígado y el estómago', 'Incluida en el registro oficial MHT del MINSAL de Chile', 'Usada en compresas antisépticas sobre úlceras cutáneas'],
    principiosActivos: ['Flavonoides', 'Cumarinas', 'Resinas diterpénicas', 'Aceites esenciales'],
    polinizadores: ['Abejas andinas', 'Mariposas', 'Dípteros'],
    precauciones: ['En cálculos biliares obstructivos consultar previamente al médico'],
    contraindicaciones: ['Obstrucción de vías biliares', 'Embarazo y lactancia (por falta de estudios de seguridad)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a marzo',
    epocaFructificacion: 'enero a abril',
    tipoCiclo: 'arbusto perenne resinoso aromático',
    descripcion: 'Arbusto bajo y muy resinoso de hojas coriáceas verde brillante y capítulos florales amarillo intenso. Reconocido oficialmente por el MINSAL por su potente acción digestiva, hepatoprotectora y antiséptica externa.',
    formasDeUso: 'Infusión de 1 cucharada de hojas en 1 litro de agua recién hervida (beber 1 taza hasta 3 veces al día). En uso externo, la misma infusión tibia para lavar heridas.',
    fuentes: [F_MINSAL, F_SIB],
  },
  {
    slug: 'cadillo',
    nombre: 'Cadillo',
    nombreCientifico: 'Acaena magellanica (Lam.) Vahl',
    familia: 'Rosaceae',
    otrosNombres: ['Abrojo patagónico', 'Cadillo de la Patagonia', 'Cepacaballo de cordillera', 'Pimpinela silvestre'],
    origen: 'Región subantártica y Patagonia (Argentina y Chile)',
    distribucion: ['Argentina (Patagonia y Tierra del Fuego)', 'Chile', 'Islas subantárticas'],
    habitat: 'Mallines, vegas húmedas, bordes de arroyos y claros de bosque',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Cicatrizante', 'Astringente', 'Antiinflamatoria', 'Antiséptica', 'Diurética'],
    sistemas: ['Tegumentario', 'Digestivo', 'Renal'],
    afecciones: ['Heridas y cortes', 'Irritaciones cutáneas', 'Diarrea leve', 'Afecciones urinarias leves'],
    usosEtnobotanicos: ['Conocida por sus cabezuelas globosas con espinas ganchudas que se adhieren al pelaje y la ropa', 'Usada en la medicina tradicional patagónica en lavados de heridas y tisanas depurativas'],
    principiosActivos: ['Taninos', 'Flavonoides', 'Ácidos fenólicos', 'Saponinas triterpénicas'],
    polinizadores: ['Viento (anemófila)'],
    precauciones: ['No confundir con Amor Seco tropical (Desmodium adscendens) ni con Cepa Caballo (Xanthium spinosum)'],
    contraindicaciones: ['Embarazo (uso interno prolongado no evaluado)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a febrero',
    epocaFructificacion: 'enero a abril',
    tipoCiclo: 'hierba perenne rastrera estolonífera',
    descripcion: 'Hierba perenne rastrera de hojas pinnadas verde-azuladas y cabezuelas globosas rojizas cubiertas de diminutas espinas con ganchos (gloquidios). Muy común en mallines y claros húmedos de toda la Patagonia.',
    formasDeUso: 'Decocción suave de hojas y tallos para lavados o compresas cicatrizantes; infusión ligera en uso interno tradicional astringente.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'calafate',
    nombre: 'Calafate',
    nombreCientifico: 'Berberis microphylla G. Forst.',
    familia: 'Berberidaceae',
    otrosNombres: ['Michay', 'Calafate patagónico', 'Berberis buxifolia'],
    origen: 'Patagonia argentina y chilena',
    distribucion: ['Argentina (Neuquén a Tierra del Fuego)', 'Chile (regiones del sur y austral)'],
    habitat: 'Estepa arbustiva, ecotono bosque-estepa, bordes de bosques de ñire y lenga',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Antioxidante', 'Antimicrobiana', 'Febrífuga', 'Digestiva', 'Astringente'],
    sistemas: ['Inmunológico', 'Digestivo', 'Cardiovascular', 'Metabólico'],
    afecciones: ['Estrés oxidativo', 'Fiebre', 'Diarrea leve', 'Infecciones bacterianas leves', 'Inflamación'],
    usosEtnobotanicos: ['Fruto sagrado y alimento ancestral tehuelche y mapuche', 'Leyenda patagónica: quien come calafate siempre regresa a la Patagonia', 'Raíz y corteza usadas como tinte amarillo natural y remedio febrífugo'],
    principiosActivos: ['Berberina (alcaloide en raíz y corteza)', 'Antocianinas (delfinidina, malvidina en frutos)', 'Polifenoles', 'Vitamina C'],
    polinizadores: ['Abejorros nativos', 'Abejas', 'Sírfidos'],
    precauciones: ['Distinguir el uso alimentario del fruto (muy seguro y antioxidante) del uso medicinal de raíz/corteza rica en berberina (dosis moderadas)'],
    contraindicaciones: ['Embarazo y lactancia (especialmente preparaciones con raíz o corteza por contenido de berberina)', 'Interacción potencial de berberina con hipoglucemiantes o anticoagulantes'],
    toxicidad: 'Frutos completamente comestibles; raíz y corteza en dosis elevadas pueden resultar irritantes o uterotónicas por la berberina',
    epocaFloracion: 'octubre a diciembre',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto espinoso perennifolio nativo',
    descripcion: 'Arbusto espinoso emblemático de la Patagonia con flores amarillas intensas en primavera y bayas azul-violáceas oscuras en verano, consideradas entre las frutas con mayor capacidad antioxidante del mundo. Su corteza interna amarilla contiene berberina.',
    formasDeUso: 'Consumo directo de frutos frescos, secos o en infusión antioxidante; decocción breve de corteza/raíz en uso etnobotánico puntual y moderado.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'canchalagua',
    nombre: 'Canchalagua',
    nombreCientifico: 'Centaurium cachanlahuen (Molina) B.L. Rob.',
    familia: 'Gentianaceae',
    otrosNombres: ['Cachanlahuen', 'Cachanlagua', 'Hierba de la fiebre'],
    origen: 'Sur de Sudamérica (Argentina y Chile)',
    distribucion: ['Argentina (Patagonia y centro)', 'Chile', 'Perú'],
    habitat: 'Praderas húmedas, claros herbáceos y suelos frescos soleados',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Depurativa', 'Febrífuga', 'Digestiva', 'Tónica amarga', 'Hipotensora suave'],
    sistemas: ['Hepático', 'Digestivo', 'Circulatorio', 'Inmunológico'],
    afecciones: ['Fiebre', 'Digestión lenta', 'Falta de apetito', 'Afecciones cutáneas por depuración', 'Hipertensión leve (coadyuvante)'],
    usosEtnobotanicos: ['Hierba medicinal mapuche célebre desde la época colonial (cachanlahuen = hierba para el dolor de costado)', 'Monografía oficial en MHT MINSAL Chile'],
    principiosActivos: ['Glucósidos secoiridoides amargos (swerciamarina, genciopicrósido)', 'Xantonas', 'Flavonoides'],
    polinizadores: ['Abejas pequeñas', 'Mariposas'],
    precauciones: ['Monitorear presión arterial si se combina con antihipertensivos'],
    contraindicaciones: ['Úlcera péptica activa', 'Hipotensión severa', 'Embarazo'],
    toxicidad: null,
    epocaFloracion: 'noviembre a febrero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'hierba anual nativa de sabor amargo',
    descripcion: 'Pequeña hierba nativa de tallos delgados cuadrangulares y delicadas flores rosadas en forma de estrella. De intenso sabor amargo, es una de las plantas depurativas y febrífugas más documentadas de la medicina andino-patagónica.',
    formasDeUso: 'Infusión de 1 cucharada de la planta seca en 1 litro de agua hirviendo; beber 1 taza 2 a 3 veces al día.',
    fuentes: [F_MINSAL, F_SIB],
  },
  {
    slug: 'canelo',
    nombre: 'Canelo',
    nombreCientifico: 'Drimys winteri J.R. Forst. & G. Forst.',
    familia: 'Winteraceae',
    otrosNombres: ['Foye', 'Boighe', 'Canelo magallánico', 'Corteza de Winter'],
    origen: 'Bosques templados lluviosos de Patagonia y sur de Chile',
    distribucion: ['Argentina (Patagonia andina y Tierra del Fuego)', 'Chile (Coquimbo a Cabo de Hornos)'],
    habitat: 'Bosques húmedos, pantanosos, quebradas y riberas de lagos y ríos',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Antiséptica', 'Antiinflamatoria', 'Antiescorbútica', 'Cicatrizante', 'Analgésica', 'Digestiva'],
    sistemas: ['Tegumentario', 'Respiratorio', 'Digestivo', 'Musculoesquelético'],
    afecciones: ['Heridas infectadas', 'Dolores reumáticos', 'Tos y catarro', 'Dolor de muelas', 'Afecciones de la piel', 'Indigestión'],
    usosEtnobotanicos: ['Árbol sagrado (Foye) del pueblo mapuche, símbolo de paz, justicia y sanación en el rewe', 'Históricamente empleado por marinos del estrecho de Magallanes contra el escorbuto por su alto contenido de vitamina C'],
    principiosActivos: ['Poligodial (sesquiterpeno bioactivo)', 'Drimenol', 'Vitamina C', 'Taninos', 'Aceites esenciales'],
    polinizadores: ['Coleópteros', 'Dípteros', 'Abejas nativas'],
    precauciones: ['No usar en dosis concentradas por vía interna de forma prolongada', 'Proteger la corteza viva al recolectar (preferir hojas caídas o podas sustentables)'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Tratamiento anticoagulante (precaución)'],
    toxicidad: 'Dosis muy altas de corteza pueden resultar irritantes gastrointestinales',
    epocaFloracion: 'octubre a enero',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'árbol perennifolio nativo sagrado',
    descripcion: 'Árbol siempreverde majestuoso de hojas grandes brillantes por el haz y blanquecinas por el envés, con flores blancas aromáticas. Árbol sagrado del pueblo mapuche (Foye), reconocido por su acción antiséptica, antiinflamatoria y rica en vitamina C.',
    formasDeUso: 'Infusión suave de 1 cucharadita de hojas o corteza desmenuzada por taza (máximo 2 tazas/día); decocción más concentrada para baños reumáticos, lavados de heridas y gárgaras.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'cepa-caballo',
    nombre: 'Cepa Caballo',
    nombreCientifico: 'Xanthium spinosum L.',
    familia: 'Asteraceae',
    otrosNombres: ['Abrojo chico', 'Clonqui', 'Espina de perro', 'Cepa de caballo'],
    origen: 'Sudamérica (nativa del Cono Sur, hoy cosmopolita)',
    distribucion: ['Argentina (todo el país incluida Patagonia)', 'Chile', 'Uruguay', 'América'],
    habitat: 'Terrenos modificados, corrales, caminos rurales y estepa perturbada',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Diurética', 'Depurativa', 'Antiinflamatoria', 'Hepatoprotectora tradicional', 'Antiséptica urinaria'],
    sistemas: ['Renal', 'Hepático', 'Digestivo'],
    afecciones: ['Retención de líquidos', 'Infecciones urinarias leves', 'Cálculos renales (coadyuvante)', 'Congestión hepática leve'],
    usosEtnobotanicos: ['Muy difundida en la medicina criolla argentina y chilena para afecciones renales y prostáticas leves', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Xantatinas (lactonas sesquiterpénicas)', 'Flavonoides', 'Saponinas', 'Fitosteroles'],
    polinizadores: ['Viento (anemófila)'],
    precauciones: ['Usar solo las partes aéreas (hojas y tallos), evitando ingerir semillas o plántulas tiernas', 'No exceder ciclos de 2 semanas sin control'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Insuficiencia renal o hepática grave'],
    toxicidad: 'Las semillas y cotiledones contienen carboxiatractilósido (tóxico en altas cantidades); emplear únicamente follaje maduro en infusión moderada',
    epocaFloracion: 'diciembre a abril',
    epocaFructificacion: 'febrero a mayo',
    tipoCiclo: 'hierba anual espinosa',
    descripcion: 'Hierba ramificada de hasta 80 cm con características espinas amarillas trífidas en la base de cada hoja y frutos ovoides cubiertos de ganchos. Tradicionalmente valorada como diurética y depurativa renal.',
    formasDeUso: 'Infusión de 1 cucharada de hojas y tallos secos en 1 litro de agua hirviendo; beber 1 taza 2 a 3 veces al día.',
    fuentes: [F_MINSAL, F_HERBO],
  },
  {
    slug: 'charcao',
    nombre: 'Charcao',
    nombreCientifico: 'Senecio filaginoides DC.',
    familia: 'Asteraceae',
    otrosNombres: ['Mata mora', 'Charcao gris', 'Yuyo moro', 'Romero de la estepa'],
    origen: 'Estepa patagónica y andina de Argentina y Chile',
    distribucion: ['Argentina (Patagonia y Cuyo)', 'Chile'],
    habitat: 'Estepa árida y semiárida, mesetas pedregosas y suelos arenosos',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Digestiva tradicional', 'Antiespasmódica', 'Antiinflamatoria externa'],
    sistemas: ['Digestivo', 'Musculoesquelético'],
    afecciones: ['Dolores estomacales (uso folclórico)', 'Cólicos', 'Dolores musculares (uso externo)'],
    usosEtnobotanicos: ['Arbusto aromático muy representativo de la meseta patagónica', 'Usado históricamente en sahumos, baños y cataplasmas rurales'],
    principiosActivos: ['Aceites esenciales (alfa-pineno, beta-pineno)', 'Flavonoides', 'Alcaloides pirrolizidínicos (trazas a niveles variables según quimiotipo)'],
    polinizadores: ['Abejas nativas', 'Dípteros', 'Mariposas'],
    precauciones: ['PRECAUCIÓN DE SEGURIDAD: las especies del género Senecio pueden contener alcaloides pirrolizidínicos hepatotóxicos; priorizar uso externo y evitar consumo interno frecuente o prolongado'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Enfermedad hepática', 'Uso interno crónico'],
    toxicidad: 'Potencial hepatotoxicidad acumulativa por alcaloides pirrolizidínicos presentes en el género Senecio',
    epocaFloracion: 'noviembre a febrero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto perenne aromático grisáceo',
    descripcion: 'Arbusto globoso muy común en la estepa patagónica, de follaje ceniciento-plateado densamente tomentoso y aroma resinoso característico. Forma parte del saber etnobotánico patagónico, requiriendo cautela por pertenecer al género Senecio.',
    formasDeUso: 'Preferentemente uso externo en baños tibios, friegas o cataplasmas; su uso tradicional interno exige máxima prudencia y evitar tratamientos repetidos.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'duraznillo',
    nombre: 'Duraznillo',
    nombreCientifico: 'Colliguaja integerrima Gillies & Hook.',
    familia: 'Euphorbiaceae',
    otrosNombres: ['Colliguay', 'Duraznillo de la estepa', 'Lecherón'],
    origen: 'Patagonia y región andina de Argentina y Chile',
    distribucion: ['Argentina (Patagonia, Mendoza, Neuquén, Río Negro, Chubut, Santa Cruz)', 'Chile'],
    habitat: 'Estepa arbustiva, cañadones pedregosos y faldeos secos',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Queratolítica externa', 'Analgésica odontológica tradicional'],
    sistemas: ['Tegumentario'],
    afecciones: ['Verrugas (uso externo puntual)', 'Callosidades', 'Dolor de muelas (uso etnobotánico histórico)'],
    usosEtnobotanicos: ['Arbusto nativo de la estepa conocido por su látex blanco abundante al quebrar sus ramas', 'Documentado por CONICET/CENPAT en la etnobotánica de la meseta patagónica exclusivamente para aplicaciones externas muy puntuales'],
    principiosActivos: ['Látex rico en ésteres de diterpenos', 'Triterpenos', 'Taninos'],
    polinizadores: ['Insectos pequeños', 'Viento'],
    precauciones: ['USO ESTRICTAMENTE EXTERNO Y PUNTUAL', 'Evitar contacto del látex con ojos, mucosas y piel sana'],
    contraindicaciones: ['Uso interno (PROHIBIDO)', 'Niños pequeños', 'Piel lesionada o sensible'],
    toxicidad: 'Látex cáustico e irritante para piel y mucosas; tóxico si se ingiere',
    epocaFloracion: 'octubre a diciembre',
    epocaFructificacion: 'diciembre a febrero',
    tipoCiclo: 'arbusto perennifolio nativo laticífero',
    descripcion: 'Arbusto nativo de la estepa patagónica con hojas lineares coriáceas que recuerdan a las del duraznero y frutos tricocos explosivos. Al cortar sus tallos exuda un látex blanco irritante empleado históricamente solo de forma externa contra verrugas.',
    formasDeUso: 'Solo uso externo tópico puntual (gota mínima sobre verrugas protegiendo la piel circundante). Nunca administrar en infusión ni por vía oral.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'eter',
    nombre: 'Éter',
    nombreCientifico: 'Artemisia abrotanum L.',
    familia: 'Asteraceae',
    otrosNombres: ['Abrótano macho', 'Hierba del éter', 'Hierba lombriguera'],
    origen: 'Europa meridional (cultivada y naturalizada en huertas de la Patagonia)',
    distribucion: ['Argentina (Patagonia)', 'Chile (sur)', 'Europa'],
    habitat: 'Huertas rurales, jardines patagónicos y bordes soleados bien drenados',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Digestiva', 'Antiespasmódica', 'Relajante suave', 'Antiparasitaria', 'Repelente'],
    sistemas: ['Digestivo', 'Nervioso', 'Tegumentario'],
    afecciones: ['Dolor de estómago', 'Indigestión', 'Cólicos', 'Nerviosismo leve', 'Polillas e insectos'],
    usosEtnobotanicos: ['Apreciada en los hogares patagónicos por su aroma penetrante alcanforado-cítrico que recuerda al éter', 'Ramas secas colocadas en roperos como repelente natural de polillas'],
    principiosActivos: ['Aceites esenciales (1,8-cineol, alcanfor, davona)', 'Cumarinas (isofraxidina, escopoletina)', 'Flavonoides', 'Taninos'],
    polinizadores: ['Insectos pequeños', 'Viento'],
    precauciones: ['Emplear en dosis moderadas y ciclos breves', 'No confundir con Paramela (Adesmia boronioides), que en algunos parajes también recibe el apodo local de éter'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Niños pequeños'],
    toxicidad: 'En dosis altas sus aceites esenciales pueden irritar el sistema nervioso o digestivo',
    epocaFloracion: 'enero a marzo',
    epocaFructificacion: 'marzo a abril',
    tipoCiclo: 'subarbusto perenne aromático',
    descripcion: 'Subarbusto perenne de follaje plumoso verde grisáceo y fragancia intensa entre limón, pino y alcanfor. Muy cultivado en patios y chacras de la Patagonia como digestivo casero y repelente natural.',
    formasDeUso: 'Infusión ligera de 1 cucharadita de hojas por taza después de las comidas; baños aromáticos relajantes o saquitos secos en placares.',
    fuentes: [F_CONICET, F_HERBO],
  },
  {
    slug: 'hiperico',
    nombre: 'Hipérico',
    nombreCientifico: 'Hypericum perforatum L.',
    familia: 'Hypericaceae',
    otrosNombres: ['Hierba de San Juan', 'Corazoncillo', 'Hipericón'],
    origen: 'Europa y Asia (ampliamente naturalizada en la Patagonia andina)',
    distribucion: ['Argentina (Patagonia andina, Bariloche, El Bolsón, Esquel)', 'Chile (sur)', 'Europa'],
    habitat: 'Praderas soleadas, bordes de caminos, laderas abiertas y claros de bosque',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Antidepresiva leve', 'Cicatrizante', 'Antiinflamatoria', 'Antiviral tópica', 'Analgésica nerviosa'],
    sistemas: ['Nervioso', 'Tegumentario'],
    afecciones: ['Decaimiento anímico leve a moderado', 'Ansiedad leve', 'Quemaduras solares leves', 'Heridas y contusiones', 'Neuralgias (uso externo en oleato)'],
    usosEtnobotanicos: ['El famoso aceite rojo de hipérico (oleato solar de flores en aceite vegetal) es un clásico del botiquín natural patagónico para golpes y quemaduras', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Hipericina', 'Hiperforina', 'Flavonoides (rutina, quercetina, hiperósido)', 'Taninos'],
    polinizadores: ['Abejas', 'Abejorros', 'Sírfidos'],
    precauciones: ['FOTOSENSIBILIDAD: evitar exposición solar intensa tras aplicar aceite de hipérico sobre la piel o al tomarlo internamente', 'INTERACCIONES MEDICAMENTOSAS IMPORTANTES: induce CYP3A4 y reduce eficacia de anticonceptivos, anticoagulantes, inmunosupresores y antidepresivos'],
    contraindicaciones: ['Uso simultáneo con antidepresivos ISRS (riesgo de síndrome serotoninérgico)', 'Anticoagulantes orales', 'Anticonceptivos hormonales', 'Embarazo y lactancia'],
    toxicidad: 'Puede provocar fotodermatitis e interacciones farmacológicas relevantes',
    epocaFloracion: 'diciembre a febrero',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'hierba perenne rizomatosa',
    descripcion: 'Hierba perenne de flores amarillo oro intenso que al estrujarse tiñen los dedos de rojo violáceo (hipericina). Sus hojas muestran diminutos puntos translúcidos al mirarlas a contraluz ("perforatum").',
    formasDeUso: 'Uso externo: oleato macerado al sol en aceite de oliva o girasol sobre quemaduras leves y dolores musculares. Uso interno: infusión de 1 cucharadita de sumidades floridas por taza, solo sin medicación incompatible.',
    fuentes: [F_MINSAL, F_SIB, F_HERBO],
  },
  {
    slug: 'huautro',
    nombre: 'Huautro',
    nombreCientifico: 'Baccharis magellanica (Lam.) Pers.',
    familia: 'Asteraceae',
    otrosNombres: ['Huautro rastrero', 'Mosaiquillo', 'Chilca rastrera', 'Romerillo rastrero'],
    origen: 'Patagonia y cordillera austral de Argentina y Chile',
    distribucion: ['Argentina (Patagonia andina y Tierra del Fuego)', 'Chile (sur y austral)'],
    habitat: 'Bosques abiertos de ñire y lenga, laderas cordilleranas, turberas y estepa subandina',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Digestiva', 'Balsámica', 'Antiinflamatoria', 'Antiséptica', 'Antirreumática externa'],
    sistemas: ['Digestivo', 'Respiratorio', 'Musculoesquelético'],
    afecciones: ['Malestar estomacal', 'Resfríos', 'Dolores reumáticos', 'Contusiones (uso externo)'],
    usosEtnobotanicos: ['Pequeño arbusto rastrero resinoso empleado en la herbolaria patagónica para infusiones digestivas y baños calientes contra dolores articulares'],
    principiosActivos: ['Diterpenos', 'Flavonoides', 'Aceites esenciales', 'Resinas'],
    polinizadores: ['Abejas nativas', 'Dípteros'],
    precauciones: ['No confundir con especies tóxicas del género Baccharis (como el mío-mío, Baccharis coridifolia, de zonas más templadas)'],
    contraindicaciones: ['Embarazo y lactancia (por falta de datos clínicos)'],
    toxicidad: null,
    epocaFloracion: 'diciembre a febrero',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'arbusto enano perennifolio rastrero',
    descripcion: 'Arbusto bajo y denso que forma alfombras verdes sobre suelos pedregosos y claros del bosque patagónico. Sus hojas pequeñas y resinosas tienen borde dentado y aroma balsámico.',
    formasDeUso: 'Infusión ligera de brotes y hojas secas (1 cucharadita por taza) o decocción para baños y compresas locales.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'jarilla',
    nombre: 'Jarilla',
    nombreCientifico: 'Larrea divaricata Cav.',
    familia: 'Zygophyllaceae',
    otrosNombres: ['Jarilla hembra', 'Jarilla de la estepa', 'Chamanilla'],
    origen: 'Regiones áridas y semiáridas de Sudamérica (Monte y Patagonia norte)',
    distribucion: ['Argentina (Patagonia norte y estepa, Cuyo, NOA)', 'Chile', 'Bolivia', 'Perú'],
    habitat: 'Estepa arbustiva seca, bardas, suelos pedregosos y clima árido soleado',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Antiinflamatoria', 'Antirreumática', 'Antiséptica', 'Antifúngica', 'Sudorífica'],
    sistemas: ['Musculoesquelético', 'Tegumentario', 'Respiratorio'],
    afecciones: ['Dolores reumáticos y articulares', 'Contusiones y torceduras', 'Hongos en pies', 'Mal olor plantar', 'Resfríos (en vahos)'],
    usosEtnobotanicos: ['Arbusto emblemático del monte y la Patagonia norte cuyo aroma inunda el aire tras la lluvia', 'Ampliamente usado en baños, cataplasmas, tinturas externas y lociones capilares'],
    principiosActivos: ['Ácido nordihidroguaiarético (NDGA)', 'Resinas fenólicas', 'Flavonoides', 'Saponinas', 'Aceites esenciales'],
    polinizadores: ['Abejas solitarias nativas', 'Avispas'],
    precauciones: ['PRIORIZAR USO EXTERNO: el consumo interno prolongado o concentrado de Larrea spp. se ha asociado a hepatotoxicidad por NDGA'],
    contraindicaciones: ['Consumo oral prolongado', 'Enfermedad hepática o renal', 'Embarazo y lactancia'],
    toxicidad: 'El ácido nordihidroguaiarético (NDGA) puede generar toxicidad hepática y renal en ingesta oral repetida; muy segura y eficaz por vía tópica',
    epocaFloracion: 'octubre a diciembre',
    epocaFructificacion: 'diciembre a febrero',
    tipoCiclo: 'arbusto perennifolio resinoso xerófilo',
    descripcion: 'Arbusto emblemático de ramas flexibles y hojas bilobadas resinosas de aroma inconfundible cuando llueve, con abundantes flores amarillas en primavera. Referente de la fitoterapia externa para reuma, golpes y afecciones dérmicas.',
    formasDeUso: 'Uso externo recomendado: decocción de ramas y hojas para baños de pies, compresas articulares, lavados o maceración en alcohol para fricciones reumáticas.',
    fuentes: [F_SIB, F_CONICET, F_HERBO],
  },
  {
    slug: 'laura',
    nombre: 'Laura',
    nombreCientifico: 'Schinus patagonicus (Phil.) I.M. Johnst. ex Cabrera',
    familia: 'Anacardiaceae',
    otrosNombres: ['Laura patagónica', 'Litrecillo', 'Molle patagónico'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile (sur)'],
    habitat: 'Bosques húmedos y matorrales andino-patagónicos, laderas soleadas y riberas',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Antiséptica', 'Antiinflamatoria', 'Balsámica', 'Digestiva tradicional', 'Cicatrizante'],
    sistemas: ['Tegumentario', 'Respiratorio', 'Digestivo', 'Musculoesquelético'],
    afecciones: ['Heridas leves', 'Dolores articulares (compresas)', 'Congestión respiratoria (vahos)', 'Malestares digestivos leves'],
    usosEtnobotanicos: ['Pariente patagónico del aguaribay (Schinus molle), valorado en la etnobotánica cordillerana por sus hojas aromáticas y frutos violáceos', 'Sus hojas se emplean en baños aromáticos y vahos'],
    principiosActivos: ['Aceites esenciales (terpenos, alfa-pineno, limoneno)', 'Taninos', 'Flavonoides', 'Resinas'],
    polinizadores: ['Abejas', 'Sírfidos', 'Insectos diversos'],
    precauciones: ['Personas alérgicas a Anacardiaceae (como litre o molle) deben probar sensibilidad cutánea antes de uso tópico'],
    contraindicaciones: ['Alergia conocida a Anacardiaceae', 'Embarazo (uso interno)'],
    toxicidad: 'Puede producir dermatitis de contacto en personas sensibles',
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'arbusto o arbolito perennifolio nativo',
    descripcion: 'Arbusto grande o pequeño árbol nativo de la Patagonia andina, sin espinas, de hojas ovaladas coriáceas muy aromáticas al frotarlas, pequeñas flores amarillo-verdosas y frutos esféricos color violáceo-negruzco.',
    formasDeUso: 'Vahos respiratorios con hojas, compresas o baños tibios antiinflamatorios; infusión muy suave en usos etnobotánicos puntuales.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'lengua-de-vaca',
    nombre: 'Lengua de Vaca',
    nombreCientifico: 'Rumex crispus L.',
    familia: 'Polygonaceae',
    otrosNombres: ['Romaza crespa', 'Acedera crespa', 'Romaza', 'Lengua de buey'],
    origen: 'Europa (ampliamente naturalizada en zonas húmedas de la Patagonia)',
    distribucion: ['Argentina (Patagonia y todo el país)', 'Chile', 'Cosmopolita'],
    habitat: 'Mallines, bordes de acequias, praderas húmedas y suelos fértiles',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Depurativa', 'Laxante suave', 'Colagoga', 'Astringente', 'Cicatrizante'],
    sistemas: ['Digestivo', 'Hepático', 'Tegumentario'],
    afecciones: ['Estreñimiento leve', 'Congestión hepática', 'Afecciones cutáneas crónicas (eczemas, acné)', 'Heridas y picaduras (hojas frescas en cataplasma)'],
    usosEtnobotanicos: ['Las hojas frescas machacadas se aplican en el campo patagónico inmediatamente sobre picaduras de ortiga', 'Raíz utilizada como depurativo hepático y cutáneo'],
    principiosActivos: ['Derivados antraquinónicos suaves (crisofanol, emodina)', 'Taninos', 'Oxalatos', 'Hierro y vitamina C en hojas'],
    polinizadores: ['Viento (anemófila)'],
    precauciones: ['No consumir hojas crudas en exceso por su contenido de ácido oxálico', 'No usar la raíz como laxante por períodos prolongados'],
    contraindicaciones: ['Cálculos renales de oxalato de calcio', 'Obstrucción intestinal', 'Embarazo y lactancia'],
    toxicidad: 'Alto contenido de oxalatos en hojas maduras si se ingieren en grandes cantidades',
    epocaFloracion: 'noviembre a marzo',
    epocaFructificacion: 'enero a abril',
    tipoCiclo: 'hierba perenne robusta de raíz pivotante',
    descripcion: 'Hierba perenne vigorosa reconocible por sus grandes hojas basales alargadas de bordes muy ondulados y rizados, y sus espigas florales que viran a marrón rojizo al fructificar.',
    formasDeUso: 'Decocción suave de 1 cucharadita de raíz seca en 250 ml de agua (hervir 5 min) para efecto depurativo/laxante leve; cataplasma de hojas frescas sobre la piel.',
    fuentes: [F_CONICET, F_HERBO],
  },
  {
    slug: 'maiten',
    nombre: 'Maitén',
    nombreCientifico: 'Maytenus boaria Molina',
    familia: 'Celastraceae',
    otrosNombres: ['Maitén patagónico', 'Horco molle del sur'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Patagonia andina, Neuquén a Santa Cruz)', 'Chile'],
    habitat: 'Valles húmedos, orillas de ríos, praderas de transición bosque-estepa',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Febrífuga', 'Antiinflamatoria', 'Depurativa', 'Analgésica', 'Cicatrizante'],
    sistemas: ['Inmunológico', 'Tegumentario', 'Digestivo', 'Musculoesquelético'],
    afecciones: ['Fiebre', 'Erupciones cutáneas y alergias (como las del litre)', 'Dolores hepáticos leves', 'Dolores articulares'],
    usosEtnobotanicos: ['Árbol nativo de gran importancia cultural y forrajera en Patagonia', 'Tradicionalmente usado en lavados para aliviar alergias cutáneas y en infusión febrífuga', 'Monografía oficial en MHT MINSAL Chile'],
    principiosActivos: ['Triterpenos', 'Flavonoides', 'Taninos', 'Aceite graso en semillas'],
    polinizadores: ['Insectos pequeños', 'Abejas'],
    precauciones: ['Las semillas tienen efecto purgante fuerte; en fitoterapia se utilizan únicamente las hojas'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Ingesta de semillas'],
    toxicidad: 'Semillas purgantes/eméticas; hojas de uso tradicional seguro en infusión moderada',
    epocaFloracion: 'septiembre a noviembre',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'árbol perennifolio nativo elegante de ramas péndulas',
    descripcion: 'Árbol nativo de copa redondeada y ramas finas colgantes con hojas verde claro finamente aserradas. Su sombra amable y sus hojas medicinales febrífugas y dermatológicas lo vuelven un ícono del paisaje patagónico.',
    formasDeUso: 'Infusión de 1 cucharada de hojas en 1 litro de agua hirviendo (beber 1 taza 2 a 3 veces al día); la misma infusión tibia en lavados para erupciones cutáneas.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'maqui',
    nombre: 'Maqui',
    nombreCientifico: 'Aristotelia chilensis (Molina) Stuntz',
    familia: 'Elaeocarpaceae',
    otrosNombres: ['Queldrón', 'Klon', 'Clon', 'Maquei'],
    origen: 'Bosques templados de Patagonia y sur de Chile',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile (Coquimbo a Aysén)'],
    habitat: 'Claros de bosque húmedo, quebradas, bordes de caminos y riberas',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Antioxidante', 'Astringente', 'Antiinflamatoria', 'Antidiarreica', 'Cicatrizante'],
    sistemas: ['Inmunológico', 'Digestivo', 'Respiratorio', 'Tegumentario', 'Metabólico'],
    afecciones: ['Diarrea', 'Dolor de garganta y amigdalitis', 'Aftas bucales', 'Heridas superficiales', 'Estrés oxidativo'],
    usosEtnobotanicos: ['Fruto ancestral mapuche (klon) de altísimo valor nutricional y medicinal', 'Hojas usadas en cataplasmas y gárgaras para la garganta', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Antocianinas (delfinidinas en altísima concentración)', 'Polifenoles', 'Taninos', 'Alcaloides indólicos en hojas (aristotelina)', 'Vitamina C'],
    polinizadores: ['Abejas', 'Sírfidos', 'Insectos nativos'],
    precauciones: ['En casos de estreñimiento moderar el consumo de infusión de hojas por su efecto astringente'],
    contraindicaciones: ['Estreñimiento crónico severo (uso de hojas astringentes)'],
    toxicidad: null,
    epocaFloracion: 'octubre a diciembre',
    epocaFructificacion: 'diciembre a febrero',
    tipoCiclo: 'árbol pequeño o arbusto perennifolio nativo',
    descripcion: 'Árbol pequeño de hojas verde brillante con pecíolos rojizos y pequeñas bayas negras lustrosas que concentran niveles excepcionales de antocianinas antioxidantes. Tanto sus frutos como sus hojas poseen amplio uso tradicional y respaldo fitoquímico.',
    formasDeUso: 'Consumo directo de frutos frescos o liofilizados; infusión de 1 cucharadita de hojas secas o frutos por taza para diarreas leves, gárgaras y lavados de heridas.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'menta-alemana',
    nombre: 'Menta Alemana',
    nombreCientifico: 'Mentha suaveolens Ehrh.',
    familia: 'Lamiaceae',
    otrosNombres: ['Menta rizada', 'Menta de bosque', 'Mastranto', 'Mentha rotundifolia', 'Menta manzana'],
    origen: 'Europa y cuenca mediterránea (naturalizada en zonas húmedas patagónicas)',
    distribucion: ['Argentina (Patagonia húmeda)', 'Chile (sur)', 'Europa'],
    habitat: 'Orillas de arroyos, mallines, acequias y praderas húmedas de cordillera',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Digestiva', 'Antiespasmódica', 'Carminativa', 'Expectorante suave', 'Antiséptica'],
    sistemas: ['Digestivo', 'Respiratorio'],
    afecciones: ['Indigestión', 'Gases y distensión', 'Cólicos estomacales', 'Catarro leve', 'Congestión nasal'],
    usosEtnobotanicos: ['Muy común en bordes de arroyos de la Patagonia andina', 'Se distingue de la menta piperita por sus hojas redondeadas, rugosas y aterciopeladas de aroma mentolado dulce y suave'],
    principiosActivos: ['Aceites esenciales (óxido de piperitenona, carvona, limoneno)', 'Ácido rosmarínico', 'Flavonoides'],
    polinizadores: ['Abejas', 'Abejorros', 'Mariposas'],
    precauciones: ['No administrar aceites esenciales puros a niños pequeños'],
    contraindicaciones: ['Reflujo gastroesofágico severo', 'Niños menores de 2 años'],
    toxicidad: null,
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'hierba perenne estolonífera aromática',
    descripcion: 'Menta naturalizada en arroyos y praderas patagónicas, reconocible por sus hojas anchas, redondeadas, rugosas y pubescentes de fragancia dulce y fresca. Muy apreciada en tisanas digestivas y vahos suaves.',
    formasDeUso: 'Infusión de 1 cucharada de hojas frescas o secas por taza de agua hirviendo, tapar 5 minutos; tomar después de las comidas o en inhalaciones.',
    fuentes: [F_CONICET, F_HERBO],
  },
  {
    slug: 'milenrama',
    nombre: 'Milenrama',
    nombreCientifico: 'Achillea millefolium L.',
    familia: 'Asteraceae',
    otrosNombres: ['Mil hojas', 'Hierba de Aquiles', 'Cientoenrama', 'Plumajillo'],
    origen: 'Hemisferio norte (ampliamente naturalizada en la Patagonia)',
    distribucion: ['Argentina (Patagonia y centro)', 'Chile', 'Europa', 'Norteamérica'],
    habitat: 'Praderas, bordes de caminos, pastizales cordilleranos y jardines',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Cicatrizante', 'Hemostática', 'Antiespasmódica', 'Antiinflamatoria', 'Emenagoga', 'Digestiva'],
    sistemas: ['Tegumentario', 'Digestivo', 'Reproductor Femenino', 'Circulatorio'],
    afecciones: ['Heridas y sangrados leves', 'Cólicos menstruales', 'Digestión difícil', 'Espasmos gastrointestinales', 'Hemorroides (baños de asiento)'],
    usosEtnobotanicos: ['Célebre planta cicatrizante de campaña muy abundante en praderas patagónicas', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Camazuleno (en aceite esencial)', 'Aquileína', 'Lactonas sesquiterpénicas', 'Flavonoides', 'Taninos'],
    polinizadores: ['Abejas', 'Sírfidos', 'Mariposas', 'Escarabajos'],
    precauciones: ['Puede causar alergia en personas sensibles a la familia Asteraceae'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Tratamiento anticoagulante'],
    toxicidad: null,
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'hierba perenne rizomatosa aromática',
    descripcion: 'Hierba perenne aromática de hojas finamente recortadas como plumas ("mil hojas") y corimbos aplanados de diminutas flores blancas o rosadas. Valiosa tanto en botiquín externo cicatrizante como en tisanas digestivas y menstruales.',
    formasDeUso: 'Infusión de 1 cucharadita de flores y hojas por taza (hasta 3 veces/día); compresas o baños de asiento con infusión más concentrada.',
    fuentes: [F_MINSAL, F_SIB, F_HERBO],
  },
  {
    slug: 'natre',
    nombre: 'Natre',
    nombreCientifico: 'Solanum crispum Ruiz & Pav.',
    familia: 'Solanaceae',
    otrosNombres: ['Natri', 'Hierba del chavalongo', 'Tomatillo', 'Solanum gayanum'],
    origen: 'Bosques y matorrales de Chile y Patagonia argentina',
    distribucion: ['Argentina (Patagonia andina)', 'Chile (Atacama a Los Lagos)'],
    habitat: 'Bordes de bosques húmedos, matorrales y quebradas soleadas',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Febrífuga', 'Antiinflamatoria', 'Analgésica', 'Hipoglucemiante tradicional'],
    sistemas: ['Inmunológico', 'Metabólico', 'Nervioso'],
    afecciones: ['Fiebre alta', 'Cefaleas', 'Diabetes tipo 2 (uso popular coadyuvante bajo control médico)'],
    usosEtnobotanicos: ['Conocido por el dicho popular "más amargo que el natre"', 'Clásico febrífugo de la medicina mapuche y campesina del sur', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Glicoalcaloides esteroidales (solanina, solasodina)', 'Flavonoides', 'Saponinas'],
    polinizadores: ['Abejorros nativos', 'Abejas'],
    precauciones: ['Usar dosis bajas y por pocos días; NO ingerir los frutos (bayas tóxicas)', 'Si se usa medicación hipoglucemiante controlar glucemia'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Niños pequeños', 'Uso prolongado'],
    toxicidad: 'Contiene alcaloides solanáceos; los frutos son tóxicos y la sobredosis de hojas/tallos puede causar malestar digestivo o neurológico',
    epocaFloracion: 'octubre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto nativo trepador o apoyante',
    descripcion: 'Arbusto nativo de flores azul-violáceas con anteras amarillas brillantes (típicas de las solanáceas) y follaje intensamente amargo. Reconocido históricamente en Patagonia y Chile como potente febrífugo.',
    formasDeUso: 'Infusión muy medida de 1 cucharadita de hojas y ramitas secas en 1 litro de agua hirviendo; beber en pequeñas dosis (máximo 2 tazas/día por pocos días).',
    fuentes: [F_MINSAL, F_SIB],
  },
  {
    slug: 'neneo',
    nombre: 'Neneo',
    nombreCientifico: 'Mulinum spinosum (Cav.) Pers.',
    familia: 'Apiaceae',
    otrosNombres: ['Hierba negra', 'Neneo patagónico', 'Dichillo'],
    origen: 'Estepa patagónica y cordillera andina (Argentina y Chile)',
    distribucion: ['Argentina (toda la Patagonia, Mendoza a Santa Cruz)', 'Chile'],
    habitat: 'Estepa árida y semiárida, mesetas ventosas y laderas pedregosas',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Antiinflamatoria', 'Analgésica', 'Balsámica', 'Expectorante', 'Antirreumática'],
    sistemas: ['Musculoesquelético', 'Respiratorio', 'Renal'],
    afecciones: ['Dolores reumáticos y neuralgias', 'Dolor de muelas', 'Afecciones bronquiales y tos', 'Afecciones renales leves'],
    usosEtnobotanicos: ['Arbusto en cojín emblemático del paisaje estepario patagónico', 'Su raíz resinosa aromática ha sido ampliamente utilizada por comunidades mapuche-tehuelche para dolores musculares, fríos y catarros'],
    principiosActivos: ['Diterpenos mulinánicos (ácido mulínico, mulinol)', 'Aceites esenciales', 'Resinas aromáticas'],
    polinizadores: ['Dípteros', 'Abejas nativas', 'Escarabajos'],
    precauciones: ['Emplear dosis moderadas en decocción de raíz; recolectar con criterio sustentable'],
    contraindicaciones: ['Embarazo', 'Lactancia'],
    toxicidad: null,
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto en cojín espinoso perenne nativo',
    descripcion: 'Inconfundible arbusto hemisférico en forma de cojín espinoso verde-amarillento que tapiza la estepa patagónica. Sus flores amarillas en umbelas y sus raíces muy resinosas poseen compuestos diterpénicos únicos estudiados por el CONICET.',
    formasDeUso: 'Decocción suave de un trozo pequeño de raíz (5 g por litro de agua durante 10 min) para afecciones respiratorias o reumáticas, o uso externo en compresas.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'notro',
    nombre: 'Notro',
    nombreCientifico: 'Embothrium coccineum J.R. Forst. & G. Forst.',
    familia: 'Proteaceae',
    otrosNombres: ['Ciruelillo', 'Fosforito', 'Notru'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Neuquén a Tierra del Fuego)', 'Chile (Maule a Cabo de Hornos)'],
    habitat: 'Bordes de bosque húmedo, claros soleados, laderas y riberas de lagos',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Cicatrizante', 'Astringente', 'Antiinflamatoria', 'Antiséptica', 'Balsámica'],
    sistemas: ['Tegumentario', 'Respiratorio', 'Digestivo'],
    afecciones: ['Heridas y úlceras cutáneas', 'Dolor de muelas y encías inflamadas', 'Afecciones ganglionares e inflamaciones (uso tradicional)', 'Gastritis leve'],
    usosEtnobotanicos: ['Árbol emblemático de la primavera patagónica por su explosión de flores rojo carmesí', 'Tradicionalmente usado por el pueblo mapuche en lavados cicatrizantes y gárgaras', 'Sus flores alimentan al picaflor rubí'],
    principiosActivos: ['Taninos', 'Flavonoides', 'Compuestos fenólicos', 'Saponinas'],
    polinizadores: ['Picaflor rubí (Sephanoides sephaniodes)', 'Fío-fío', 'Abejorros'],
    precauciones: ['No dañar la corteza de ejemplares silvestres (especie nativa protegida en parques nacionales)'],
    contraindicaciones: ['Embarazo y lactancia (evitar consumo interno prolongado)'],
    toxicidad: null,
    epocaFloracion: 'octubre a diciembre',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'árbol pequeño o arbusto nativo',
    descripcion: 'Uno de los árboles más llamativos de la Patagonia, cubierto en primavera de inflorescencias tubulares rojo intenso ("fosforito"). Sus hojas y corteza se emplean en la medicina tradicional del sur por su acción astringente y cicatrizante.',
    formasDeUso: 'Infusión suave de hojas (1 cucharadita por taza) para uso digestivo leve, o decocción más concentrada para buches, gárgaras y lavados externos de heridas.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'nancolahuen',
    nombre: 'Ñancolahuén',
    nombreCientifico: 'Valeriana carnosa Sm.',
    familia: 'Caprifoliaceae',
    otrosNombres: ['Ñanculahuen', 'Hierba del aguilucho', 'Valeriana patagónica', 'Valeriana del sur'],
    origen: 'Cordillera y estepa patagónica de Argentina y Chile',
    distribucion: ['Argentina (Neuquén a Tierra del Fuego)', 'Chile (sur y austral)'],
    habitat: 'Estepa arbustiva, mallines pedregosos y bosques abiertos de ñire',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Sedante', 'Ansiolítica', 'Analgésica', 'Digestiva', 'Hepatoprotectora tradicional'],
    sistemas: ['Nervioso', 'Digestivo', 'Hepático', 'Musculoesquelético'],
    afecciones: ['Insomnio', 'Ansiedad y estrés', 'Dolores menstruales y musculares', 'Trastornos digestivos nerviosos', 'Malestar hepático leve'],
    usosEtnobotanicos: ['Una de las plantas medicinales más veneradas por los pueblos mapuche y tehuelche ("remedio del aguilucho")', 'Sus rizomas carnosos y aromáticos concentran valepotriatos y ácido valerénico, objeto de estudios del CONICET/INIBIOMA'],
    principiosActivos: ['Ácido valerénico', 'Valepotriatos', 'Aceites esenciales sesquiterpénicos', 'Flavonoides'],
    polinizadores: ['Insectos nativos', 'Sírfidos'],
    precauciones: ['Especie vulnerable a la sobreexplotación: preferir cultivo doméstico o recolección responsable sin arrancar la población completa', 'Puede potenciar somnolencia con sedantes'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Uso simultáneo con depresores del SNC o alcohol'],
    toxicidad: null,
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'hierba perenne nativa de rizoma carnoso',
    descripcion: 'Valeriana nativa de la Patagonia con hojas carnosas verde-azuladas en roseta y varas florales blanquecino-rosadas. Sus rizomas gruesos poseen el aroma característico de las valerianas y gozan de enorme prestigio en la farmacopea mapuche-tehuelche.',
    formasDeUso: 'Maceración en frío o infusión tibia (sin hervir en exceso) de 1 cucharadita de rizoma seco triturado por taza antes de acostarse.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'palo-pichi',
    nombre: 'Palo Pichi',
    nombreCientifico: 'Fabiana imbricata Ruiz & Pav.',
    familia: 'Solanaceae',
    otrosNombres: ['Pichi', 'Palo piche', 'Pichi romero', 'Tola patagónica'],
    origen: 'Cordillera andina y Patagonia de Argentina y Chile',
    distribucion: ['Argentina (Mendoza, Neuquén, Río Negro, Chubut)', 'Chile (Atacama a Patagonia)'],
    habitat: 'Laderas secas pedregosas, lechos de ríos secos, estepa y ecotono bosque-estepa',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Diurética', 'Antiséptica urinaria', 'Litotríptica tradicional', 'Digestiva', 'Balsámica'],
    sistemas: ['Renal', 'Digestivo'],
    afecciones: ['Infecciones urinarias leves (cistitis)', 'Cálculos renales y arenilla', 'Retención de líquidos', 'Afecciones prostáticas leves'],
    usosEtnobotanicos: ['Remedio clásico de la medicina mapuche y andina para las vías urinarias', 'Antiguamente incluida incluso en farmacopeas internacionales como "Pichi"', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Fabianina', 'Escopoletina (cumarina)', 'Rutina', 'Resinas aromáticas', 'Aceites esenciales'],
    polinizadores: ['Abejas', 'Picaflores', 'Insectos andinos'],
    precauciones: ['Acompañar con abundante ingesta de agua', 'Consultar médico en cólico renal agudo o infección febril'],
    contraindicaciones: ['Insuficiencia renal o cardíaca con restricción hídrica', 'Embarazo y lactancia'],
    toxicidad: null,
    epocaFloracion: 'octubre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto perennifolio resinoso de aspecto cipresino',
    descripcion: 'Arbusto resinoso nativo cuyas ramitas cubiertas de diminutas hojas imbricadas recuerdan a un ciprés o brezo, salpicado en primavera de pequeñas flores blancas tubulares. Uno de los grandes antisépticos urinarios de la flora sudamericana.',
    formasDeUso: 'Infusión de 1 cucharada de ramitas con hojas en 1 litro de agua recién hervida; beber 1 taza 3 veces al día.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'panil',
    nombre: 'Pañil',
    nombreCientifico: 'Buddleja globosa Hope',
    familia: 'Scrophulariaceae',
    otrosNombres: ['Matico', 'Palguín', 'Pañil patagónico', 'Buddleja araucana (en estepa)'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile (Coquimbo a Patagonia)'],
    habitat: 'Bordes de bosque húmedo, quebradas, márgenes de arroyos y claros soleados',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Cicatrizante', 'Antiinflamatoria', 'Antiséptica', 'Gastroprotectora', 'Analgésica'],
    sistemas: ['Tegumentario', 'Digestivo'],
    afecciones: ['Heridas, cortes y quemaduras leves', 'Úlceras gástricas y gastritis', 'Úlceras cutáneas', 'Dolores estomacales', 'Inflamaciones bucales'],
    usosEtnobotanicos: ['El gran cicatrizante de la medicina mapuche y patagónica (llamado matico en Chile y pañil en Patagonia argentina)', 'Respaldado por estudios farmacológicos sobre proliferación de fibroblastos y efecto antiulceroso', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Verbascósido (acteósido)', 'Flavonoides (luteolina, apigenina)', 'Iridoides (aucubina)', 'Triterpenos', 'Taninos'],
    polinizadores: ['Abejas', 'Abejorros', 'Mariposas'],
    precauciones: ['En úlcera gástrica diagnosticada usar como coadyuvante junto al seguimiento médico'],
    contraindicaciones: ['Embarazo y lactancia (uso interno por precaución; uso tópico seguro)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto perennifolio a semicaducifolio nativo',
    descripcion: 'Arbusto nativo de hojas lanceoladas rugosas verde oscuro por arriba y blanquecino-aterciopeladas por debajo, con características inflorescencias esféricas (cabezuelas) color amarillo-anaranjado fragantes a miel. Cicatrizante por excelencia del sur.',
    formasDeUso: 'Infusión de 1 hoja mediana o 1 cucharada de hojas picadas en 1 litro de agua hirviendo: beber 1 taza 3 veces al día para gastritis o aplicar tibia en compresas y lavados sobre heridas.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'paramela',
    nombre: 'Paramela',
    nombreCientifico: 'Adesmia boronioides Hook. f.',
    familia: 'Fabaceae',
    otrosNombres: ['Té pampa', 'Yagneu', 'Lonko', 'Éter de la estepa'],
    origen: 'Endémica de la Patagonia argentina y chilena',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut, Santa Cruz)', 'Chile (Aysén y Magallanes)'],
    habitat: 'Estepa arbustiva, mesetas patagónicas y faldeos pedregosos secos',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Digestiva', 'Balsámica', 'Expectorante', 'Antiinflamatoria', 'Antirreumática', 'Tónica'],
    sistemas: ['Digestivo', 'Respiratorio', 'Musculoesquelético', 'Reproductor'],
    afecciones: ['Resfríos y bronquitis', 'Dolores estomacales e indigestión', 'Dolores reumáticos', 'Cansancio físico', 'Dolores menstruales'],
    usosEtnobotanicos: ['Joya aromática endémica de la estepa patagónica, venerada por pueblos tehuelche y mapuche', 'Su aceite esencial balsámico es estudiado por universidades patagónicas y el CONICET por sus propiedades antiinflamatorias y antimicrobianas'],
    principiosActivos: ['Aceites esenciales resinosos (esquiterpenos: esquenanol, esquenona, alfa-pineno)', 'Flavonoides', 'Compuestos fenólicos'],
    polinizadores: ['Abejas nativas', 'Abejorros'],
    precauciones: ['Recolección sustentable (cortar solo ramitas terminales sin dañar el arbusto; especie de crecimiento lento)'],
    contraindicaciones: ['Embarazo y lactancia (evitar dosis altas por falta de estudios clínicos)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto perennifolio resinoso endémico',
    descripcion: 'Arbusto aromático endémico de la Patagonia con pequeñas hojas compuestas cubiertas de glándulas resinosas perfumadas y racimos de flores amarillas intensas. Al frotar sus hojas libera una fragancia balsámica inconfundible.',
    formasDeUso: 'Infusión de 1 cucharadita de ramitas y hojas secas por taza de agua hirviendo (1 a 2 veces al día), o en vahos respiratorios y baños relajantes.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'parrilla',
    nombre: 'Parrilla',
    nombreCientifico: 'Ribes magellanicum Poir.',
    familia: 'Grossulariaceae',
    otrosNombres: ['Parrilla patagónica', 'Grosellero silvestre', 'Zarzaparrilla patagónica', 'Mulul'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Neuquén a Tierra del Fuego)', 'Chile (Maule a Magallanes)'],
    habitat: 'Sotobosque húmedo de lenga y coihue, riberas de arroyos y claros frescos',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Antioxidante', 'Depurativa', 'Diurética', 'Antiinflamatoria', 'Astringente'],
    sistemas: ['Renal', 'Circulatorio', 'Inmunológico', 'Digestivo'],
    afecciones: ['Retención de líquidos', 'Afecciones urinarias leves', 'Estrés oxidativo', 'Inflamación articular leve'],
    usosEtnobotanicos: ['Sus racimos de bayas negro-violáceas son un fruto silvestre comestible muy apreciado en la Patagonia (dulces y licores)', 'Hojas empleadas en infusión depurativa y diurética', 'No confundir con la zarzaparrilla liana (Smilax campestris)'],
    principiosActivos: ['Antocianinas', 'Flavonoides (rutina, quercetina)', 'Vitamina C', 'Taninos', 'Ácidos orgánicos'],
    polinizadores: ['Abejorros nativos', 'Abejas', 'Picaflores'],
    precauciones: ['Distinguir claramente de Smilax campestris (zarzaparrilla del litoral)'],
    contraindicaciones: ['No se reportan contraindicaciones relevantes en dosis habituales'],
    toxicidad: null,
    epocaFloracion: 'septiembre a diciembre',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'arbusto caducifolio nativo inerme',
    descripcion: 'Arbusto nativo del sotobosque patagónico sin espinas, de hojas lobuladas fragantes similares a las de la vid o grosellero, racimos colgantes de flores verdoso-rojizas y bayas negras aromáticas comestibles.',
    formasDeUso: 'Infusión de 1 cucharada de hojas secas por taza (1 a 2 tazas/día) como depurativo suave; frutos consumidos frescos o en preparaciones alimentarias.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'patagua',
    nombre: 'Patagua',
    nombreCientifico: 'Myrceugenia exsucca (DC.) O. Berg',
    familia: 'Myrtaceae',
    otrosNombres: ['Pitra blanca', 'Peta', 'Temu de agua', 'Myrceugenia planipes'],
    origen: 'Bosques húmedos de Chile y Patagonia andina argentina',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile (Coquimbo a Los Lagos)'],
    habitat: 'Suelos anegados, mallines boscosos, orillas de lagos y cursos de agua permanentes',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Astringente', 'Digestiva', 'Balsámica', 'Antirreumática externa', 'Antiséptica'],
    sistemas: ['Digestivo', 'Musculoesquelético', 'Tegumentario'],
    afecciones: ['Trastornos estomacales leves', 'Diarrea leve', 'Dolores reumáticos (baños)', 'Afecciones cutáneas leves'],
    usosEtnobotanicos: ['Mirtácea nativa de ambientes pantanosos (hualves y pitrantos) utilizada en la etnobotánica mapuche en infusiones digestivas y baños calientes para dolores musculares'],
    principiosActivos: ['Aceites esenciales (terpenos aromáticos)', 'Taninos', 'Flavonoides'],
    polinizadores: ['Abejas', 'Insectos nativos'],
    precauciones: ['Cosechar hojas de forma sustentable sin dañar ecosistemas de humedal'],
    contraindicaciones: ['Estreñimiento severo', 'Embarazo (uso interno prolongado no evaluado)'],
    toxicidad: null,
    epocaFloracion: 'enero a marzo',
    epocaFructificacion: 'mayo a agosto',
    tipoCiclo: 'árbol perennifolio higrófilo nativo',
    descripcion: 'Árbol siempreverde nativo de lugares pantanosos y riberas húmedas del bosque andino-patagónico, de corteza grisácea clara, hojas coriáceas aromáticas y flores blancas de numerosos estambres.',
    formasDeUso: 'Infusión suave de hojas (1 cucharadita por taza) o decocción para baños externos contra dolores articulares.',
    fuentes: [F_SIB, F_HERBO],
  },
  {
    slug: 'pitra',
    nombre: 'Pitra',
    nombreCientifico: 'Myrceugenia pitra (Baeza) Kausel',
    familia: 'Myrtaceae',
    otrosNombres: ['Petra', 'Pitra del sur', 'Patagua de los pantanos'],
    origen: 'Bosques templados húmedos de Patagonia y sur de Chile',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile (centro-sur)'],
    habitat: 'Humedales boscosos (pitrantos), márgenes de lagos y arroyos sombreados',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Astringente', 'Antiséptica', 'Digestiva', 'Antiinflamatoria tópica'],
    sistemas: ['Digestivo', 'Tegumentario', 'Respiratorio'],
    afecciones: ['Malestar estomacal', 'Diarrea leve', 'Heridas leves (lavados)', 'Afecciones bucales'],
    usosEtnobotanicos: ['Árbol característico de los pitrantos (bosques anegados sagrados en la cosmovisión mapuche)', 'Sus hojas aromáticas ricas en aceites esenciales y taninos se usan en tisanas digestivas y lavados'],
    principiosActivos: ['Aceites esenciales (alfa-pineno, cineol)', 'Taninos', 'Flavonoides'],
    polinizadores: ['Abejas', 'Dípteros'],
    precauciones: ['Respetar los humedales y bosques de pitra (hábitats frágiles)'],
    contraindicaciones: ['Embarazo y lactancia (evitar dosis altas)'],
    toxicidad: null,
    epocaFloracion: 'diciembre a febrero',
    epocaFructificacion: 'abril a junio',
    tipoCiclo: 'árbol perennifolio nativo de humedal',
    descripcion: 'Mirtácea nativa de los bosques húmedos andino-patagónicos, muy emparentada con la patagua y el arrayán. Sus hojas brillantes contienen glándulas de aceite esencial aromático y taninos astringentes.',
    formasDeUso: 'Infusión ligera de hojas secas (1 cucharadita por taza) para trastornos digestivos leves, o decocción para gárgaras y lavados.',
    fuentes: [F_SIB, F_HERBO],
  },
  {
    slug: 'poleo',
    nombre: 'Poleo',
    nombreCientifico: 'Mentha pulegium L.',
    familia: 'Lamiaceae',
    otrosNombres: ['Menta poleo', 'Poleo europeo', 'Poleo de arroyo'],
    origen: 'Europa y cuenca mediterránea (naturalizada en acequias y mallines patagónicos)',
    distribucion: ['Argentina (Patagonia y centro)', 'Chile', 'Europa'],
    habitat: 'Bordes de arroyos, canales, mallines y praderas húmedas',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Digestiva', 'Carminativa', 'Antiespasmódica', 'Expectorante', 'Emenagoga'],
    sistemas: ['Digestivo', 'Respiratorio', 'Reproductor Femenino'],
    afecciones: ['Indigestión y gases', 'Cólicos estomacales', 'Resfríos y catarro', 'Mal aliento'],
    usosEtnobotanicos: ['Clásica infusión digestiva de sobremesa muy naturalizada junto a cursos de agua patagónicos', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Pulegona (monoterpeno en aceite esencial)', 'Mentona', 'Flavonoides', 'Ácido rosmarínico'],
    polinizadores: ['Abejas', 'Mariposas', 'Sírfidos'],
    precauciones: ['NUNCA ingerir aceite esencial puro de poleo (altamente hepatotóxico por pulegona)', 'Usar solo infusión suave de hojas en dosis moderadas y ciclos cortos'],
    contraindicaciones: ['Embarazo (ESTRICTAMENTE CONTRAINDICADO — abortivo/uterotónico)', 'Lactancia', 'Niños pequeños', 'Enfermedad hepática o renal'],
    toxicidad: 'El aceite esencial concentrado es fuertemente hepatotóxico y neurotóxico por su contenido de pulegona',
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'hierba perenne rastrera aromática',
    descripcion: 'Hierba rastrera de pequeño porte y aroma mentolado intenso y penetrante, con verticilos globosos de flores lila-rosadas. Muy apreciada en infusiones digestivas suaves, pero estrictamente contraindicada en el embarazo.',
    formasDeUso: 'Infusión ligera de 1 cucharadita de hojas por taza de agua recién hervida (máximo 1 a 2 tazas ocasionales). Prohibido el aceite esencial por vía oral.',
    fuentes: [F_MINSAL, F_HERBO],
  },
  {
    slug: 'quilembai',
    nombre: 'Quilembai',
    nombreCientifico: 'Chuquiraga avellanedae Lorentz',
    familia: 'Asteraceae',
    otrosNombres: ['Quilimbai', 'Mataquerosén', 'Trayao', 'Sombra de toro de la estepa'],
    origen: 'Endémica de la estepa patagónica argentina',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut, Santa Cruz)'],
    habitat: 'Mesetas áridas y semiáridas de la estepa patagónica extraandina',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Diurética', 'Depurativa', 'Antioxidante', 'Balsámica', 'Digestiva tradicional'],
    sistemas: ['Renal', 'Respiratorio', 'Digestivo'],
    afecciones: ['Afecciones renales y urinarias leves', 'Resfríos y tos', 'Malestar hepático y digestivo leve'],
    usosEtnobotanicos: ['Arbusto nodriza fundamental para la ecología de la estepa patagónica', 'Llamado popularmente mataquerosén porque arde aún verde debido a sus resinas', 'Documentado por CENPAT–CONICET en la medicina tradicional de la meseta'],
    principiosActivos: ['Flavonoides (quercetina, kaempferol)', 'Ácidos fenólicos', 'Resinas', 'Triterpenos'],
    polinizadores: ['Abejas nativas', 'Aves pequeñas', 'Mariposas'],
    precauciones: ['Especie nativa valiosa contra la desertificación: recolectar solo mínimas hojas o flores'],
    contraindicaciones: ['Embarazo y lactancia (por falta de estudios de seguridad)'],
    toxicidad: null,
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'arbusto espinoso perennifolio endémico',
    descripcion: 'Arbusto globoso nativo de la estepa patagónica con hojas rígidas verde oliva terminadas en espina y capítulos florales amarillo-dorados muy vistosos. Además de su uso etnobotánico depurativo, cumple un rol ecológico clave como planta nodriza.',
    formasDeUso: 'Infusión suave de flores y hojas tiernas (1 cucharadita por taza) como tónico digestivo o diurético suave.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'quinchamali',
    nombre: 'Quinchamalí',
    nombreCientifico: 'Quinchamalium chilense Molina',
    familia: 'Schoepfiaceae',
    otrosNombres: ['Quinchamalín', 'Hierba del golpe', 'Quinchamali andino'],
    origen: 'Región andina y patagónica de Argentina y Chile',
    distribucion: ['Argentina (Patagonia, Cuyo, NOA)', 'Chile', 'Perú', 'Bolivia'],
    habitat: 'Laderas soleadas, suelos pedregosos, estepa subandina y claros secos',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Antiinflamatoria', 'Cicatrizante', 'Hepatoprotectora', 'Depurativa', 'Analgésica'],
    sistemas: ['Musculoesquelético', 'Hepático', 'Tegumentario', 'Renal'],
    afecciones: ['Golpes, hematomas y contusiones', 'Heridas', 'Trastornos hepáticos leves', 'Retención de líquidos'],
    usosEtnobotanicos: ['Famosa planta andino-patagónica usada tradicionalmente "para golpes internos y externos"', 'Planta hemiparásita de raíces que florece en cabezuelas amarillo-anaranjadas', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Flavonoides (rutina, quercetina)', 'Triterpenos', 'Saponinas', 'Compuestos fenólicos'],
    polinizadores: ['Mariposas', 'Abejas', 'Sírfidos'],
    precauciones: ['No recolectar la raíz (planta hemiparásita difícil de regenerar); cortar solo la parte aérea'],
    contraindicaciones: ['Embarazo y lactancia (por precaución)'],
    toxicidad: null,
    epocaFloracion: 'octubre a febrero',
    epocaFructificacion: 'enero a abril',
    tipoCiclo: 'hierba perenne hemiparásita nativa',
    descripcion: 'Hierba nativa grácil de tallos finos verde-amarillentos y vistosas inflorescencias terminales tubulares de color amarillo intenso a anaranjado. Muy valorada en la fitoterapia patagónica y chilena para hematomas, heridas y cuidado hepático.',
    formasDeUso: 'Infusión de 1 cucharada de la planta en 1 litro de agua hirviendo (beber 1 taza 2 a 3 veces/día), o compresas tibias sobre golpes y heridas.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'quintral',
    nombre: 'Quintral',
    nombreCientifico: 'Tristerix corymbosus (L.) Kuijt',
    familia: 'Loranthaceae',
    otrosNombres: ['Quintral del álamo', 'Quintral del maitén', 'Liga patagónica', 'Muérdago criollo'],
    origen: 'Bosques y valles de Chile y Patagonia argentina',
    distribucion: ['Argentina (Patagonia andina)', 'Chile (Coquimbo a Los Lagos)'],
    habitat: 'Especie hemiparásita aérea sobre ramas de maitén, álamo, sauce, maqui y otros árboles',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Hipotensora', 'Hipocolesterolemiante tradicional', 'Sedante suave', 'Antiinflamatoria', 'Cicatrizante'],
    sistemas: ['Cardiovascular', 'Nervioso', 'Tegumentario'],
    afecciones: ['Hipertensión arterial leve (coadyuvante)', 'Colesterol elevado (tradicional)', 'Nerviosismo', 'Heridas y úlceras (uso externo)'],
    usosEtnobotanicos: ['En invierno ilumina las copas desnudas de álamos y maitenes con sus flores rojo brillante, siendo alimento vital del picaflor rubí y del monito del monte (Dromiciops gliroides)', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Flavonoides (quercetina, catequinas)', 'Proantocianidinas', 'Taninos', 'Triterpenos'],
    polinizadores: ['Picaflor rubí (Sephanoides sephaniodes)', 'Dispersión de semillas por el monito del monte'],
    precauciones: ['No reemplazar medicación antihipertensiva prescrita; controlar presión arterial regularmente'],
    contraindicaciones: ['Hipotensión', 'Embarazo y lactancia'],
    toxicidad: null,
    epocaFloracion: 'marzo a septiembre (floración invernal clave)',
    epocaFructificacion: 'septiembre a diciembre',
    tipoCiclo: 'arbusto hemiparásito aéreo nativo',
    descripcion: 'Planta hemiparásita nativa de hojas verde oscuro brillantes y llamativas flores tubulares rojo escarlata que florecen en pleno otoño-invierno patagónico. Reconocida oficialmente por el MINSAL por su acción hipotensora suave y cicatrizante.',
    formasDeUso: 'Infusión de 1 cucharada de hojas y flores picadas en 1 litro de agua hirviendo (beber 1 taza 2 veces al día); lavados externos en heridas.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'radal',
    nombre: 'Radal',
    nombreCientifico: 'Lomatia hirsuta (Lam.) Diels',
    familia: 'Proteaceae',
    otrosNombres: ['Raral', 'Nogal silvestre', 'Ral-ral'],
    origen: 'Bosques andino-patagónicos de Argentina y Chile',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut)', 'Chile', 'Perú', 'Ecuador'],
    habitat: 'Bosques templados, laderas húmedas, matorrales y bordes de bosques de ciprés y coihue',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Broncodilatadora tradicional', 'Expectorante', 'Antitusiva', 'Antiséptica respiratoria', 'Antiasmática tradicional'],
    sistemas: ['Respiratorio'],
    afecciones: ['Tos persistente', 'Bronquitis', 'Asma leve (coadyuvante tradicional)', 'Catarro bronquial'],
    usosEtnobotanicos: ['El gran árbol respiratorio de la Patagonia', 'Sus hojas grandes coriáceas y su corteza también se utilizan para teñir lana de tonos castaños', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Naftoquinonas (2-metoxijuglona)', 'Flavonoides', 'Taninos', 'Resinas aromáticas'],
    polinizadores: ['Abejas', 'Escarabajos', 'Dípteros'],
    precauciones: ['No sustituye broncodilatadores de rescate en crisis asmática aguda', 'Evitar uso prolongado en dosis altas por las naftoquinonas'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Niños pequeños'],
    toxicidad: null,
    epocaFloracion: 'octubre a diciembre',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'árbol perennifolio nativo',
    descripcion: 'Árbol siempreverde emblemático de la cordillera patagónica, reconocible por sus hojas grandes, ovaladas, brillantes y de bordes aserrados. Es la planta de referencia tradicional del sur argentino-chileno para la tos y la bronquitis.',
    formasDeUso: 'Infusión de 1 hoja grande picada (o 1 cucharada) en 1 litro de agua hirviendo; beber 1 taza tibia 3 veces al día en afecciones bronquiales.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'regaliz-silvestre',
    nombre: 'Regaliz Silvestre',
    nombreCientifico: 'Glycyrrhiza astragalina Gillies ex Hook. & Arn.',
    familia: 'Fabaceae',
    otrosNombres: ['Orozuz patagónico', 'Porotillo', 'Regaliz criollo', 'Palo dulce'],
    origen: 'Nativa del Cono Sur (Patagonia, Cuyo y Chile)',
    distribucion: ['Argentina (Patagonia, Mendoza, La Pampa, Buenos Aires)', 'Chile'],
    habitat: 'Vegas húmedas, bordes de ríos, suelos arenosos y estepa salobre',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Expectorante', 'Emoliente', 'Antiinflamatoria', 'Gastroprotectora', 'Antitusiva'],
    sistemas: ['Respiratorio', 'Digestivo'],
    afecciones: ['Tos seca e irritación de garganta', 'Bronquitis', 'Acidez y gastritis leve', 'Afonía'],
    usosEtnobotanicos: ['Pariente sudamericano nativo del regaliz europeo (Glycyrrhiza glabra)', 'Los pobladores rurales patagónicos mascan sus raíces dulces para calmar la sed, la tos y el dolor de garganta'],
    principiosActivos: ['Saponinas triterpénicas (similares a glicirricina)', 'Flavonoides (pinocembrina)', 'Isoflavonas', 'Polisacáridos'],
    polinizadores: ['Abejas nativas', 'Abejorros'],
    precauciones: ['Por su parentesco con Glycyrrhiza spp., evitar consumo diario prolongado si existe hipertensión o retención de líquidos'],
    contraindicaciones: ['Hipertensión arterial no controlada', 'Insuficiencia renal', 'Hipopotasemia', 'Embarazo'],
    toxicidad: 'El uso excesivo y sostenido de especies de Glycyrrhiza puede elevar la presión arterial y reducir el potasio',
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'hierba perenne nativa de raíces dulces profundas',
    descripcion: 'Leguminosa nativa de la estepa y valles patagónicos con hojas pinnadas, espigas de flores violáceo-azuladas y raíces largas intensamente dulces. Muy valorada como suavizante de la garganta y la mucosa gástrica.',
    formasDeUso: 'Decocción breve de 1 cucharadita de raíz seca picada por taza (hervir 5 min), 1 a 2 tazas diarias por ciclos cortos, o masticación puntual de un trocito de raíz limpia.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'rosa-mosqueta',
    nombre: 'Rosa Mosqueta',
    nombreCientifico: 'Rosa rubiginosa L.',
    familia: 'Rosaceae',
    otrosNombres: ['Mosqueta', 'Rosa eglanteria', 'Coral patagónico'],
    origen: 'Europa (masivamente naturalizada en la Patagonia andina desde el siglo XIX)',
    distribucion: ['Argentina (Neuquén, Río Negro, Chubut, Santa Cruz)', 'Chile (sur)', 'Europa'],
    habitat: 'Valles cordilleranos, bordes de caminos, praderas y zonas de ecotono bosque-estepa',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Regeneradora celular', 'Antioxidante', 'Inmunoestimulante', 'Cicatrizante', 'Antiinflamatoria', 'Diurética suave'],
    sistemas: ['Tegumentario', 'Inmunológico', 'Renal', 'Musculoesquelético'],
    afecciones: ['Cicatrices, estrías y manchas cutáneas', 'Resfríos y prevención invernal', 'Envejecimiento prematuro de la piel', 'Dolores articulares leves (artrosis)'],
    usosEtnobotanicos: ['Ícono productivo y cultural de la Patagonia andina (dulces, infusiones y aceite cosmético de semillas)', 'Sus pseudofutos rojos ("escaramujos") multiplican por varias veces la vitamina C de los cítricos', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Vitamina C (ácido ascórbico)', 'Ácidos grasos esenciales en semillas (omega 3, 6 y 9: linoleico y linolénico)', 'Carotenoides (licopeno, betacaroteno)', 'Ácido trans-retinoico natural', 'Taninos y pectinas'],
    polinizadores: ['Abejas', 'Abejorros', 'Escarabajos'],
    precauciones: ['Al preparar infusión de frutos enteros, colar con filtro fino para retener los pelitos internos irritantes de las semillas', 'El aceite vegetal no debe aplicarse sobre acné activo muy graso'],
    contraindicaciones: ['No se reportan contraindicaciones mayores en uso alimentario o tópico habitual'],
    toxicidad: null,
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'febrero a mayo',
    tipoCiclo: 'arbusto espinoso caducifolio',
    descripcion: 'Arbusto espinoso omnipresente en los valles andino-patagónicos, con flores rosadas fragantes y abundantes frutos rojo coral muy ricos en vitamina C. El aceite prensado en frío de sus semillas es un referente mundial en regeneración dermatológica.',
    formasDeUso: 'Infusión de 1 cucharada de cascarilla seca de fruto (sin pelillos internos) por taza para vitamina C y defensas; aceite puro de semilla en aplicación nocturna sobre cicatrices y piel seca.',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'sanguinaria',
    nombre: 'Sanguinaria',
    nombreCientifico: 'Polygonum aviculare L.',
    familia: 'Polygonaceae',
    otrosNombres: ['Sanguinaria menor', 'Cien nudos', 'Lengua de pájaro', 'Siete sangrías (regional)'],
    origen: 'Europa y Asia (ampliamente naturalizada en Argentina y Patagonia)',
    distribucion: ['Argentina (todo el país incluida Patagonia)', 'Chile', 'Cosmopolita'],
    habitat: 'Caminos, suelos compactados, baldíos, huertas y patios rurales',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Diurética', 'Depurativa', 'Astringente', 'Remineralizante', 'Hipotensora suave'],
    sistemas: ['Renal', 'Circulatorio', 'Digestivo', 'Respiratorio'],
    afecciones: ['Afecciones urinarias leves y arenilla', 'Retención de líquidos', 'Diarrea leve', 'Catarros leves', 'Debilidad capilar (por sílice)'],
    usosEtnobotanicos: ['Planta rastrera sumamente resistente que crece incluso entre piedras y senderos', 'Clásico depurativo sanguíneo y renal de la medicina popular sudamericana', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Ácido silícico soluble (sílice)', 'Flavonoides (avicularina, hiperósido)', 'Taninos', 'Mucílagos'],
    polinizadores: ['Insectos pequeños', 'Autopolinización'],
    precauciones: ['Acompañar su uso diurético con adecuada hidratación'],
    contraindicaciones: ['Insuficiencia renal o cardíaca avanzada', 'Embarazo (evitar dosis concentradas)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a abril',
    epocaFructificacion: 'enero a mayo',
    tipoCiclo: 'hierba anual rastrera nudosa',
    descripcion: 'Hierba rastrera de tallos delgados con nudos muy marcados (de ahí "cien nudos"), hojas pequeñas lanceoladas y minúsculas flores verdoso-rosadas en las axilas. Rica en sílice y flavonoides diuréticos.',
    formasDeUso: 'Infusión de 1 cucharada de la planta seca en 1 litro de agua hirviendo; beber 1 taza 2 a 3 veces al día.',
    fuentes: [F_MINSAL, F_HERBO],
  },
  {
    slug: 'solupe',
    nombre: 'Solupe',
    nombreCientifico: 'Ephedra ochreata Miers',
    familia: 'Ephedraceae',
    otrosNombres: ['Solupe grande', 'Pingo-pingo', 'Tramonto', 'Cola de caballo del monte', 'Ephedra chilensis'],
    origen: 'Estepa patagónica y Monte argentino-chileno',
    distribucion: ['Argentina (Patagonia, Cuyo, La Pampa)', 'Chile'],
    habitat: 'Estepa árida, médanos, suelos arenosos y pedregosos',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Broncodilatadora tradicional', 'Diurética', 'Descongestiva', 'Antitusiva'],
    sistemas: ['Respiratorio', 'Renal'],
    afecciones: ['Asma y broncoespasmo (uso tradicional)', 'Tos y congestión bronquial', 'Afecciones urinarias leves'],
    usosEtnobotanicos: ['Gimnosperma arbustiva sin hojas verdaderas, de ramas verdes articuladas y falsos frutos rojos carnosos (arilos) comestibles en el campo', 'Usada históricamente en decocciones respiratorias y diuréticas por comunidades patagónicas'],
    principiosActivos: ['Alcaloides tipo efedrina/pseudoefedrina (en concentraciones variables, generalmente menores que en Ephedra sinica)', 'Taninos', 'Flavonoides'],
    polinizadores: ['Viento (anemófila)', 'Insectos ocasionales'],
    precauciones: ['PRECAUCIÓN CARDIOVASCULAR: por la posible presencia de alcaloides simpaticomiméticos (efedrina), no usar en personas con hipertensión o arritmias'],
    contraindicaciones: ['Hipertensión arterial', 'Enfermedad coronaria o arritmias', 'Hipertiroidismo', 'Embarazo y lactancia', 'Glaucoma'],
    toxicidad: 'Puede provocar taquicardia, nerviosismo o elevación de la presión arterial en dosis altas o personas susceptibles',
    epocaFloracion: 'octubre a diciembre (conos)',
    epocaFructificacion: 'diciembre a febrero',
    tipoCiclo: 'arbusto gimnospermo perenne áfilo',
    descripcion: 'Arbusto nativo de aspecto juncoso compuesto por ramas verdes rígidas articuladas, sin hojas visibles, que produce llamativos conos carnosos rojo-anaranjados en verano. Pariente sudamericano de la efedra asiática.',
    formasDeUso: 'Decocción muy suave de 1 cucharadita de ramitas secas en 500 ml de agua por períodos breves; solo en adultos sin patología cardiovascular.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'tomillo-silvestre',
    nombre: 'Tomillo Silvestre',
    nombreCientifico: 'Acantholippia seriphioides (A. Gray) Moldenke',
    familia: 'Verbenaceae',
    otrosNombres: ['Tomillo del campo', 'Tomillo andino', 'Tomillo de la estepa', 'Tomillo patagónico'],
    origen: 'Endémica de la estepa patagónica y Monte argentino',
    distribucion: ['Argentina (Mendoza, Neuquén, Río Negro, Chubut, Santa Cruz, La Pampa)'],
    habitat: 'Estepa arbustiva seca, mesetas pedregosas y suelos áridos soleados',
    ecoregion: 'Estepa Patagónica',
    acciones: ['Antiséptica', 'Digestiva', 'Expectorante', 'Carminativa', 'Antiespasmódica'],
    sistemas: ['Digestivo', 'Respiratorio'],
    afecciones: ['Indigestión y gases', 'Dolores estomacales', 'Tos, catarro y dolor de garganta', 'Resfríos'],
    usosEtnobotanicos: ['Condimento silvestre insustituible de la cocina patagónica (carnes, guisos y mate)', 'Muy apreciado como reemplazo nativo del tomillo europeo (Thymus vulgaris) por su alto contenido de timol y carvacrol'],
    principiosActivos: ['Aceites esenciales (timol, carvacrol, p-cimeno, gamma-terpineno)', 'Flavonoides', 'Ácidos fenólicos'],
    polinizadores: ['Abejas nativas', 'Mariposas pequeñas'],
    precauciones: ['Recolectar solo ramitas tiernas dejando las raíces intactas para conservar el matorral estepario'],
    contraindicaciones: ['Embarazo (evitar dosis concentradas o aceite esencial puro)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a enero',
    epocaFructificacion: 'enero a marzo',
    tipoCiclo: 'subarbusto aromático perenne nativo',
    descripcion: 'Pequeño arbusto nativo muy fragante de la estepa patagónica, con diminutas hojas verde-grisáceas resinosas y pequeñas flores blancas en espigas. Aunque pertenece a las verbenáceas, comparte el perfil aromático de timol y carvacrol del tomillo mediterráneo.',
    formasDeUso: 'Infusión de 1 cucharadita de hojas y flores secas por taza para afecciones digestivas o catarrales; gárgaras tibias o agregado aromático al mate.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'valeriana',
    nombre: 'Valeriana',
    nombreCientifico: 'Valeriana officinalis L.',
    familia: 'Caprifoliaceae',
    otrosNombres: ['Hierba de los gatos', 'Valeriana común', 'Valeriana oficinal'],
    origen: 'Europa y Asia templada (cultivada y aclimatada en la Patagonia)',
    distribucion: ['Argentina (Patagonia húmeda y huertas)', 'Chile', 'Europa'],
    habitat: 'Suelos frescos y húmedos, huertas cordilleranas y bordes sombreados',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Sedante', 'Ansiolítica', 'Inductora del sueño', 'Antiespasmódica', 'Relajante muscular'],
    sistemas: ['Nervioso', 'Digestivo', 'Musculoesquelético'],
    afecciones: ['Insomnio', 'Ansiedad y nerviosismo', 'Estrés', 'Taquicardia nerviosa leve', 'Espasmos gastrointestinales nerviosos'],
    usosEtnobotanicos: ['Referente universal de la fitoterapia relajante, ampliamente cultivada en chacras patagónicas junto a la valeriana nativa (Valeriana carnosa / ñancolahuén)', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Ácido valerénico', 'Valepotriatos', 'Aceites esenciales (acetato de bornilo)', 'Ácido gamma-aminobutírico (GABA)', 'Flavonoides'],
    polinizadores: ['Abejas', 'Sírfidos', 'Mariposas'],
    precauciones: ['No conducir maquinaria pesada si provoca somnolencia', 'Evitar combinar con alcohol o benzodiacepinas'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Niños menores de 3 años', 'Uso concomitante con sedantes hipnóticos'],
    toxicidad: null,
    epocaFloracion: 'diciembre a febrero',
    epocaFructificacion: 'febrero a marzo',
    tipoCiclo: 'hierba perenne rizomatosa aromática',
    descripcion: 'Hierba perenne erecta de hojas pinnadas y umbelas de pequeñas flores blanco-rosadas suavemente perfumadas. Sus raíces y rizomas secos tienen un olor penetrante muy característico y constituyen uno de los sedantes herbales mejor estudiados.',
    formasDeUso: 'Maceración en frío durante 8 horas o infusión tibia (sin hervir) de 1 cucharadita de raíz seca picada por taza, 30 a 60 minutos antes de dormir.',
    fuentes: [F_MINSAL, F_HERBO],
  },
  {
    slug: 'vira-vira',
    nombre: 'Vira Vira',
    nombreCientifico: 'Pseudognaphalium viravira (Molina) Anderb.',
    familia: 'Asteraceae',
    otrosNombres: ['Hierba de la vida', 'Huira-huira', 'Gnaphalium viravira', 'Marcela blanca del sur'],
    origen: 'Sudamérica andina y patagónica (Argentina y Chile)',
    distribucion: ['Argentina (Patagonia, Cuyo, centro)', 'Chile', 'Perú', 'Bolivia'],
    habitat: 'Laderas secas, claros de bosque, suelos pedregosos y estepa soleada',
    ecoregion: 'Bosque y Estepa / Transición',
    acciones: ['Expectorante', 'Antitusiva', 'Febrífuga', 'Sudorífica', 'Antiinflamatoria', 'Cicatrizante'],
    sistemas: ['Respiratorio', 'Inmunológico', 'Tegumentario'],
    afecciones: ['Tos y catarro', 'Bronquitis', 'Resfríos y estados gripales', 'Fiebre leve', 'Heridas superficiales'],
    usosEtnobotanicos: ['Planta medicinal andino-patagónica de aspecto lanoso plateado usada desde tiempos prehispánicos para afecciones del pecho', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['Flavonoides (gnaphalina)', 'Diterpenos', 'Aceites esenciales', 'Mucílagos', 'Taninos'],
    polinizadores: ['Abejas pequeñas', 'Dípteros'],
    precauciones: ['Distinguir de la marcela del litoral (Achyrocline satureioides), aunque comparten usos respiratorios'],
    contraindicaciones: ['Alergia conocida a Asteraceae', 'Embarazo (dosis elevadas)'],
    toxicidad: null,
    epocaFloracion: 'noviembre a marzo',
    epocaFructificacion: 'enero a abril',
    tipoCiclo: 'hierba perenne o bienal blanquecino-lanosa',
    descripcion: 'Hierba nativa cubierta de fina lanosidad blanco-plateada con racimos densos de capítulos florales blanquecinos a crema. Muy estimada en toda la cordillera y Patagonia para calmar la tos, el catarro y los resfríos invernales.',
    formasDeUso: 'Infusión de 1 cucharada de flores y hojas en 1 litro de agua hirviendo; beber 1 taza caliente 3 veces al día (puede endulzarse con miel).',
    fuentes: [F_MINSAL, F_SIB, F_CONICET],
  },
  {
    slug: 'yerba-buena',
    nombre: 'Yerba Buena',
    nombreCientifico: 'Mentha spicata L.',
    familia: 'Lamiaceae',
    otrosNombres: ['Hierbabuena', 'Menta verde', 'Menta de jardín', 'Spearmint'],
    origen: 'Europa y Asia (ampliamente cultivada y naturalizada en la Patagonia)',
    distribucion: ['Argentina (Patagonia y todo el país)', 'Chile', 'Cosmopolita'],
    habitat: 'Huertas, acequias, suelos húmedos y fértiles a media sombra o sol',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Digestiva', 'Carminativa', 'Antiespasmódica', 'Refrescante', 'Antiparasitaria suave'],
    sistemas: ['Digestivo', 'Respiratorio', 'Nervioso'],
    afecciones: ['Indigestión y acidez leve', 'Gases y cólicos abdominales', 'Náuseas', 'Mal aliento', 'Resfríos leves'],
    usosEtnobotanicos: ['Diferente de la menta piperita (Mentha piperita): predomina la carvona en lugar del mentol, lo que la hace más dulce, suave y apta para uso cotidiano e infantil moderado', 'Monografía oficial MHT MINSAL Chile'],
    principiosActivos: ['L-carvona (aceite esencial predominante)', 'Limoneno', 'Ácido rosmarínico', 'Flavonoides'],
    polinizadores: ['Abejas', 'Abejorros', 'Mariposas'],
    precauciones: ['En personas con reflujo gastroesofágico usar con moderación'],
    contraindicaciones: ['Alergia a Lamiaceae', 'Reflujo gastroesofágico severo'],
    toxicidad: null,
    epocaFloracion: 'diciembre a marzo',
    epocaFructificacion: 'febrero a abril',
    tipoCiclo: 'hierba perenne estolonífera aromática',
    descripcion: 'Hierba aromática de hojas verde vivo lanceoladas, rugosas y de aroma dulce y fresco sin el picor mentolado intenso de la menta piperita. Infaltable en la cocina, el mate y el botiquín digestivo familiar.',
    formasDeUso: 'Infusión de 1 cucharada de hojas frescas o secas por taza de agua recién hervida, reposar tapada 5 minutos; tomar después de las comidas.',
    fuentes: [F_MINSAL, F_HERBO],
  },
  {
    slug: 'yerba-del-lagarto',
    nombre: 'Yerba del Lagarto',
    nombreCientifico: 'Synammia feuillei (Bertero) Copel.',
    familia: 'Polypodiaceae',
    otrosNombres: ['Calaguala chilena', 'Vilcún', 'Polypodium feuillei', 'Helecho lagarto'],
    origen: 'Bosques templados húmedos de Patagonia y sur de Chile',
    distribucion: ['Argentina (Patagonia andina húmeda)', 'Chile (Coquimbo a Patagonia)'],
    habitat: 'Epífito sobre troncos musgosos de árboles nativos y rocas húmedas del bosque',
    ecoregion: 'Bosque Andino-Patagónico',
    acciones: ['Expectorante', 'Sudorífica', 'Depurativa', 'Antiinflamatoria', 'Emoliente'],
    sistemas: ['Respiratorio', 'Tegumentario', 'Renal'],
    afecciones: ['Catarros bronquiales', 'Tos y afecciones pulmonares leves', 'Afecciones cutáneas crónicas (uso depurativo tradicional)', 'Retención de líquidos'],
    usosEtnobotanicos: ['Helecho nativo cuyo rizoma rastrero grueso y escamoso se asemeja a la piel de un lagarto', 'Muy valorado en la etnobotánica mapuche y chilota para catarros bronquiales y depuración'],
    principiosActivos: ['Saponinas esteroidales', 'Polisacáridos mucilaginosos', 'Flavonoides', 'Ácidos fenólicos'],
    polinizadores: ['Reproducción por esporas (helecho)'],
    precauciones: ['Especie epífita de crecimiento lento: recolectar con máximo cuidado ambiental o evitar extracción silvestre masiva'],
    contraindicaciones: ['Embarazo', 'Lactancia', 'Gastritis aguda (dosis altas de rizoma)'],
    toxicidad: null,
    epocaFloracion: 'no posee flores (esporulación en verano-otoño)',
    epocaFructificacion: 'esporas en soros dorados en el envés de las frondes',
    tipoCiclo: 'helecho perenne epífito nativo',
    descripcion: 'Helecho epífito nativo del bosque valdiviano y andino-patagónico, reconocible por sus rizomas carnosos cubiertos de escamas doradas y sus frondes profundamente lobuladas con soros redondeados anaranjados en el envés.',
    formasDeUso: 'Decocción suave de 1 cucharadita de rizoma limpio y trozado en 250 ml de agua (hervir 5 a 8 min); beber 1 a 2 tazas tibias al día.',
    fuentes: [F_SIB, F_CONICET],
  },
  {
    slug: 'yuyo-de-san-vicente',
    nombre: 'Yuyo de San Vicente',
    nombreCientifico: 'Artemisia verlotiorum Lamotte',
    familia: 'Asteraceae',
    otrosNombres: ['Artemisa china', 'Ajenjo silvestre', 'San Vicente', 'Altamisa de los campos'],
    origen: 'Asia oriental (ampliamente naturalizada en Argentina incluida Patagonia)',
    distribucion: ['Argentina (Patagonia, Pampa y centro)', 'Chile', 'Europa', 'Asia'],
    habitat: 'Terrenos fértiles húmedos, banquinas, huertas y bordes de acequias',
    ecoregion: 'Introducida / Naturalizada en Patagonia',
    acciones: ['Digestiva', 'Emenagoga', 'Antiespasmódica', 'Antiparasitaria', 'Tónica amarga'],
    sistemas: ['Digestivo', 'Reproductor Femenino'],
    afecciones: ['Indigestión y pesadez', 'Cólicos estomacales', 'Menstruación irregular o dolorosa', 'Parásitos intestinales leves'],
    usosEtnobotanicos: ['Muy difundida en la medicina popular argentina (distinta de Artemisia vulgaris por sus rizomas largos rastreros, floración otoñal y aroma más intenso alcanforado)', 'Usada en tisanas digestivas y sahumos'],
    principiosActivos: ['Aceites esenciales (1,8-cineol, alcanfor, tuyona en trazas)', 'Lactonas sesquiterpénicas', 'Flavonoides'],
    polinizadores: ['Viento (anemófila)'],
    precauciones: ['Emplear en dosis bajas y ciclos cortos', 'Puede desencadenar alergias respiratorias en personas sensibles al polen de Artemisia'],
    contraindicaciones: ['Embarazo (CONTRAINDICADA — efecto emenagogo/uterotónico)', 'Lactancia', 'Alergia a Asteraceae'],
    toxicidad: 'Contiene trazas de tuyona y lactonas amargas; evitar uso prolongado o concentrado',
    epocaFloracion: 'febrero a mayo',
    epocaFructificacion: 'abril a junio',
    tipoCiclo: 'hierba perenne rizomatosa aromática',
    descripcion: 'Hierba perenne vigorosa de tallos rojizos, hojas profundamente lobuladas verde oscuro por arriba y blanquecinas por debajo, y aroma intenso algo balsámico. Se propaga mediante largos rizomas subterráneos y florece hacia fines del verano y otoño.',
    formasDeUso: 'Infusión suave de 1 cucharadita de hojas secas por taza de agua hirviendo, reposar 5 minutos; tomar 1 taza tras comidas pesadas por ciclos breves.',
    fuentes: [F_CONICET, F_HERBO],
  },
];

function yamlStr(val: string | null): string {
  if (val === null) return 'null';
  return JSON.stringify(val);
}

function yamlList(items: string[], indent = '  '): string {
  if (!items || items.length === 0) return '[]';
  return '\n' + items.map((i) => `${indent}- ${JSON.stringify(i)}`).join('\n');
}

function renderPlantMarkdown(p: PatagonianPlantSeed): string {
  const accionesBloque = p.acciones
    .slice(0, 4)
    .map((acc) => {
      return [
        `  - accion: ${JSON.stringify(acc)}`,
        `    sistemas:${yamlList(p.sistemas.slice(0, 2), '      ')}`,
        `    afecciones:${yamlList(p.afecciones.slice(0, 3), '      ')}`,
      ].join('\n');
    })
    .join('\n');

  const fuentesBloque = p.fuentes
    .map((f) => {
      const lines = [
        `  - titulo: ${JSON.stringify(f.titulo)}`,
        `    tipo: ${JSON.stringify(f.tipo)}`,
      ];
      if (f.url) lines.push(`    url: ${JSON.stringify(f.url)}`);
      return lines.join('\n');
    })
    .join('\n');

  return `---
nombre: ${yamlStr(p.nombre)}
slug: ${yamlStr(p.slug)}
nombreCientifico: ${yamlStr(p.nombreCientifico)}
familia: ${yamlStr(p.familia)}
otrosNombres:${yamlList(p.otrosNombres)}

origen: ${yamlStr(p.origen)}
distribucion:${yamlList(p.distribucion)}
habitat: ${yamlStr(p.habitat)}

acciones:${yamlList(p.acciones)}
sistemas:${yamlList(p.sistemas)}
afecciones:${yamlList(p.afecciones)}

accionesTerapeuticas:
${accionesBloque}

usosEtnobotanicos:${yamlList(p.usosEtnobotanicos)}
principiosActivos:${yamlList(p.principiosActivos)}
polinizadores:${yamlList(p.polinizadores)}

precauciones:${yamlList(p.precauciones)}
contraindicaciones:${yamlList(p.contraindicaciones)}
toxicidad: ${yamlStr(p.toxicidad)}

imagen: ""
imagenes: []
epocaFloracion: ${yamlStr(p.epocaFloracion)}
epocaFructificacion: ${yamlStr(p.epocaFructificacion)}
tipoCiclo: ${yamlStr(p.tipoCiclo)}
fuentes:
${fuentesBloque}
---

## Descripción

${p.descripcion}

## Ecorregión patagónica y hábitat

- **Ecorregión:** ${p.ecoregion}
- **Hábitat:** ${p.habitat}
- **Principios activos clave:** ${p.principiosActivos.join(', ')}

## Usos tradicionales

${p.afecciones.map((a) => `- ${a}`).join('\n')}

## Formas de uso

${p.formasDeUso}

## Seguridad y precauciones

${p.precauciones.map((pr) => `- ${pr}`).join('\n')}${p.contraindicaciones.length > 0 ? '\n' + p.contraindicaciones.map((c) => `- Contraindicación: ${c}`).join('\n') : ''}${p.toxicidad ? `\n- **Toxicidad:** ${p.toxicidad}` : ''}

## Referencias

${p.fuentes.map((f) => `- ${f.titulo}${f.url ? ` (${f.url})` : ''}`).join('\n')}
`;
}

function normalizeBinomial(sci: string | null | undefined): string {
  if (!sci) return '';
  const parts = sci
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/);
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] || '';
}

function buildPatagoniaCompendiumMarkdown(): string {
  const existingNine = [
    { nombre: 'Diente de León', sci: 'Taraxacum officinale', slug: 'diente-de-leon', uso: 'Depurativa, hepatoprotectora, diurética y digestiva amarga' },
    { nombre: 'Llantén', sci: 'Plantago major', slug: 'llanten', uso: 'Cicatrizante, antiinflamatoria, emoliente y antitusiva' },
    { nombre: 'Melisa', sci: 'Melissa officinalis', slug: 'melisa', uso: 'Calmante nerviosa, digestiva, antiespasmódica y antiviral tópica' },
    { nombre: 'Menta', sci: 'Mentha piperita', slug: 'menta', uso: 'Digestiva, carminativa, refrescante y descongestiva respiratoria' },
    { nombre: 'Ortiga', sci: 'Urtica dioica', slug: 'ortiga', uso: 'Remineralizante, diurética, depurativa y antianémica' },
    { nombre: 'Paico', sci: 'Dysphania ambrosioides', slug: 'paico', uso: 'Digestiva, carminativa y antiparasitaria tradicional (precaución en dosis)' },
    { nombre: 'Sauco', sci: 'Sambucus nigra', slug: 'sauco', uso: 'Sudorífica, antiviral respiratoria, febrífuga y antitusiva' },
    { nombre: 'Marrubio (Toronjil cuyano)', sci: 'Marrubium vulgare', slug: 'marrubio', uso: 'Expectorante, tónica amarga digestiva y emenagoga suave' },
    { nombre: 'Vara de Oro (Vara amarilla)', sci: 'Solidago chilensis', slug: 'vara-de-oro', uso: 'Diurética, cicatrizante, antiinflamatoria y antiséptica urinaria' },
  ];

  const byEco = new Map<string, PatagonianPlantSeed[]>();
  for (const p of PATAGONIA_NEW_PLANTS) {
    const list = byEco.get(p.ecoregion) || [];
    list.push(p);
    byEco.set(p.ecoregion, list);
  }

  const lines: string[] = [
    '# Capítulo 1: Flora Medicinal de la Patagonia — Panorama Etnobotánico y Fuentes Científicas',
    '',
    '## Introducción a las 56 Plantas Medicinales de la Patagonia',
    'Este compendio documenta las **56 especies vegetales medicinales de la Patagonia** (argentina y chilena) integradas en el Herbario Oficial JarBees (Boticario), abarcando desde el **Bosque Andino-Patagónico** húmedo (coihue, lenga, ñire y humedales) hasta la **Estepa Patagónica** árida y las especies introducidas plenamente naturalizadas en valles y huertas cordilleranas.',
    'La información botánica, fitoquímica, etnobotánica y de seguridad se fundamenta exclusivamente en fuentes científicas y organismos públicos abiertos: el libro oficial **MHT — Medicamentos Herbarios Tradicionales (103 especies vegetales)** del Ministerio de Salud de Chile (MINSAL), el **Sistema de Información de Biodiversidad (SIB)** de la Administración de Parques Nacionales de Argentina, estudios etnobotánicos del **CONICET / INIBIOMA / CENPAT** (Ana Ladio, Soledad Molares y colaboradores) y **Herbotecnia**.',
    '',
    '## Especies Patagónicas Preexistentes en el Boticario (9 especies)',
    'Las siguientes 9 especies de la flora medicinal patagónica ya formaban parte del catálogo base de 75 plantas del Boticario (sin duplicación taxonómica):',
    ...existingNine.map(
      (e) => `- **${e.nombre}** (*${e.sci}*, slug \`${e.slug}\`): ${e.uso}.`,
    ),
    '',
    '# Capítulo 2: Índice Maestro de las 47 Especies Patagónicas Incorporadas (Taxonomía y Acción Principal)',
    '',
  ];

  // Agrupar tabla maestra en 4 bloques compactos (~12 plantas c/u) para chunks limpios
  const chunkGroups = [
    { title: 'Índice Maestro A–D (12 especies)', items: PATAGONIA_NEW_PLANTS.slice(0, 12) },
    { title: 'Índice Maestro E–N (12 especies)', items: PATAGONIA_NEW_PLANTS.slice(12, 24) },
    { title: 'Índice Maestro N–Q (12 especies)', items: PATAGONIA_NEW_PLANTS.slice(24, 36) },
    { title: 'Índice Maestro R–Y (11 especies)', items: PATAGONIA_NEW_PLANTS.slice(36) },
  ];

  for (const grp of chunkGroups) {
    lines.push(`## ${grp.title}`);
    for (const p of grp.items) {
      lines.push(
        `- **${p.nombre}** (*${p.nombreCientifico}*, ${p.familia}) — ${p.ecoregion}. Acciones: ${p.acciones.join(', ')}. Usos: ${p.afecciones.slice(0, 3).join(', ')}.`,
      );
    }
    lines.push('');
  }

  lines.push('# Capítulo 3: Monografías Botánicas por Ecorregión Patagónica');
  lines.push('');

  for (const [eco, plants] of byEco.entries()) {
    lines.push(`## ${eco} (${plants.length} especies)`);
    for (const p of plants) {
      lines.push(
        `### ${p.nombre} (*${p.nombreCientifico}* — ${p.familia})`,
      );
      lines.push(
        `**Otros nombres:** ${p.otrosNombres.join(', ')}. **Hábitat:** ${p.habitat}. **Acciones:** ${p.acciones.join(', ')}. **Sistemas:** ${p.sistemas.join(', ')}.`,
      );
      lines.push(
        `${p.descripcion} **Principios activos:** ${p.principiosActivos.join(', ')}. **Forma de uso tradicional:** ${p.formasDeUso} **Precauciones:** ${[...p.precauciones, ...p.contraindicaciones.map((c) => `Contraindicado en ${c}`)].join(' | ')}.`,
      );
      lines.push('');
    }
  }

  lines.push('# Capítulo 4: Guía de Seguridad Fitoterapéutica y Contraindicaciones Críticas en Flora Patagónica');
  lines.push('');
  lines.push('## Plantas Patagónicas que Requieren Precaución Especial o Uso Exclusivamente Externo');
  lines.push(
    '- **Duraznillo (*Colliguaja integerrima*):** USO ESTRICTAMENTE EXTERNO y puntual por látex cáustico; prohibido ingerir.',
  );
  lines.push(
    '- **Jarilla (*Larrea divaricata*):** Priorizar uso tópico (baños, fricciones reumáticas, lavados antifúngicos); evitar ingesta oral repetida por potencial hepatotoxicidad del NDGA.',
  );
  lines.push(
    '- **Charcao (*Senecio filaginoides*):** Género *Senecio* asociado a alcaloides pirrolizidínicos hepatotóxicos; priorizar uso externo y evitar consumo interno frecuente.',
  );
  lines.push(
    '- **Poleo (*Mentha pulegium*):** Estrictamente contraindicado en embarazo y lactancia; prohibido ingerir aceite esencial puro (pulegona hepatotóxica).',
  );
  lines.push(
    '- **Hipérico (*Hypericum perforatum*):** Fotosensibilizante y fuerte inductor enzimático (CYP3A4); múltiples interacciones con antidepresivos ISRS, anticoagulantes y anticonceptivos.',
  );
  lines.push(
    '- **Solupe (*Ephedra ochreata*):** Contiene alcaloides tipo efedrina; contraindicado en hipertensión, arritmias, hipertiroidismo y embarazo.',
  );
  lines.push(
    '- **Natre (*Solanum crispum*):** Bayas tóxicas; usar solo hojas en dosis bajas por pocos días.',
  );
  lines.push(
    '- **Ajenjo (*Artemisia absinthium*) y Yuyo de San Vicente (*Artemisia verlotiorum*):** Contraindicados en embarazo, lactancia y epilepsia; ciclos breves por contenido de tuyona.',
  );
  lines.push(
    '- **Cepa Caballo (*Xanthium spinosum*):** Usar solo follaje maduro; semillas y plántulas tóxicas.',
  );
  lines.push(
    '- **Calafate (*Berberis microphylla*):** Sus frutos son comestibles y altamente antioxidantes; raíz y corteza contienen berberina (evitar en embarazo/lactancia).',
  );
  lines.push(
    '- **Maitén (*Maytenus boaria*):** Usar únicamente las hojas; las semillas son fuertemente purgantes.',
  );
  lines.push('');
  lines.push('## Nota Metodológica y Aviso de Salud');
  lines.push(
    'La información contenida en este compendio tiene fines exclusivamente educativos, botánicos y de consulta etnobotánica. Ninguna preparación herbal reemplaza el diagnóstico ni el tratamiento médico profesional, especialmente en embarazo, lactancia, infancia o patologías crónicas medicadas.',
  );

  return lines.join('\n').trim() + '\n';
}

function main() {
  const boticarioDir = 'G:\\Projects2\\PlantasMedicinales\\content\\plantas';
  if (!fs.existsSync(boticarioDir)) {
    throw new Error(`No se encontró el directorio del Boticario: ${boticarioDir}`);
  }

  // 1. Auditoría estricta anti-duplicados (slug + binomio científico)
  const existingFiles = fs
    .readdirSync(boticarioDir)
    .filter((f) => f.endsWith('.md'));

  const existingSlugs = new Set(existingFiles.map((f) => f.replace(/\.md$/, '').toLowerCase()));
  const existingBinomials = new Map<string, string>();
  for (const file of existingFiles) {
    const raw = fs.readFileSync(path.join(boticarioDir, file), 'utf8');
    const sciMatch = raw.match(/^nombreCientifico:\s*(.+)$/m);
    const sci = sciMatch ? sciMatch[1].trim().replace(/^["']|["']$/g, '') : '';
    const bin = normalizeBinomial(sci);
    if (bin) {
      existingBinomials.set(bin, file);
    }
  }

  // Verificar también unicidad interna dentro de PATAGONIA_NEW_PLANTS
  const batchSlugs = new Set<string>();
  const batchBinomials = new Set<string>();
  let created = 0;
  let skippedExistingSlug = 0;
  let skippedDuplicateBinomial = 0;

  for (const p of PATAGONIA_NEW_PLANTS) {
    const slugLower = p.slug.toLowerCase();
    const bin = normalizeBinomial(p.nombreCientifico);

    if (batchSlugs.has(slugLower)) {
      throw new Error(`Slug duplicado dentro del lote: ${p.slug}`);
    }
    if (batchBinomials.has(bin)) {
      throw new Error(`Binomio científico duplicado dentro del lote: ${bin} (${p.slug})`);
    }
    batchSlugs.add(slugLower);
    batchBinomials.add(bin);

    if (existingSlugs.has(slugLower)) {
      console.log(`[skip:slug] ${p.slug}.md ya existe — no se sobrescribe.`);
      skippedExistingSlug++;
      continue;
    }
    if (existingBinomials.has(bin)) {
      console.log(
        `[skip:binomial] ${p.nombre} (${bin}) ya existe en ${existingBinomials.get(bin)} — omitiendo para evitar duplicados.`,
      );
      skippedDuplicateBinomial++;
      continue;
    }

    const outPath = path.join(boticarioDir, `${p.slug}.md`);
    fs.writeFileSync(outPath, renderPlantMarkdown(p), 'utf8');
    created++;
  }

  // 2. Generar compendio RAG en docs/books/
  const compendiumPath = path.join(
    process.cwd(),
    'docs',
    'books',
    'herbario-plantas-medicinales-patagonia-56-especies.md',
  );
  fs.mkdirSync(path.dirname(compendiumPath), { recursive: true });
  const compendiumMd = buildPatagoniaCompendiumMarkdown();
  fs.writeFileSync(compendiumPath, compendiumMd, 'utf8');

  const finalTotal = fs
    .readdirSync(boticarioDir)
    .filter((f) => f.endsWith('.md')).length;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`✅ Ampliación Boticario Patagonia completada (0 duplicados):`);
  console.log(`   • Fichas nuevas creadas en Boticario: ${created}`);
  console.log(`   • Omitidas por slug existente:        ${skippedExistingSlug}`);
  console.log(`   • Omitidas por especie ya existente:  ${skippedDuplicateBinomial}`);
  console.log(`   • Total actual en G:\\Projects2\\PlantasMedicinales\\content\\plantas: ${finalTotal} plantas`);
  console.log(`   • Compendio RAG escrito en: ${compendiumPath} (${compendiumMd.length} chars)`);
  console.log('═══════════════════════════════════════════════════════════');
}

main();
