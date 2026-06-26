import { Injectable, Logger } from '@nestjs/common';

/**
 * DomainRouterService — Clasifica el DOMINIO de una consulta WEB.
 *
 * PROBLEMA QUE RESUELVE:
 * El IntentRouter sabe QUÉ hacer (WEB, SPORTS, LOCAL...) pero no
 * QUÉ fuentes usar. Resultado: 30 fuentes consultadas, respuesta genérica.
 *
 * SOLUCIÓN:
 * Una vez que IntentRouter dice "esto es WEB", DomainRouter dice
 * "esto es NOTICIAS_LOCALES → usar El Once + APF Digital" o
 * "esto es IA → usar TechCrunch + Hugging Face".
 * 3 fuentes relevantes > 30 fuentes irrelevantes.
 *
 * SIN IA — solo reglas determinísticas. Rápido e impredecible.
 */

export type Domain =
  | 'SPORTS'            // fútbol, resultados, fichajes, fixture
  | 'LOCAL_NEWS'        // noticias Paraná / Entre Ríos
  | 'NATIONAL_NEWS'     // noticias Argentina
  | 'POLITICS'          // política nacional/provincial
  | 'AI'                // IA, LLMs, modelos de lenguaje
  | 'AI_PAPERS'         // papers académicos de IA — arXiv, HuggingFace
  | 'PROGRAMMING'       // código, frameworks, lenguajes
  | 'SCIENCE'           // ciencia general, investigación, salud
  | 'TECHNOLOGY'        // tech general (gadgets, empresas tech)
  | 'ASTROLOGY'         // astrología, horóscopo, planetas
  | 'MUSIC'             // música, bandas, canciones
  | 'MOVIES_TV'         // cine, series, entretenimiento, MCU
  | 'MYSTERY'           // paranormal, misterios, OVNIS
  | 'ECONOMY'           // economía, finanzas, inflación
  | 'GOVERNMENT_LOCAL'  // municipalidad Paraná, gobierno ER
  | 'REFERENCE'         // definiciones, historia, Wikipedia
  | 'PLANTS'            // plantas medicinales, herboristería
  | 'DEVELOPMENT'       // novedades de software, dev.to, GitHub
  | 'MATH'              // matemática — MathWorld, Encyclopedia of Math
  | 'PHYSICS'           // física — HyperPhysics, Physics World
  | 'ASTRONOMY'         // astronomía — NASA, ESA
  | 'WEB_DOCS'          // documentación web — MDN, PostgreSQL docs
  | 'UNKNOWN';          // no se pudo clasificar

export interface DomainResult {
  domain: Domain;
  confidence: number;   // 0.0 — 1.0
  reason: string;
  suggestedSources: string[];  // urlBases de SourceRegistry recomendados
  enrichedQuery?: string;       // query enriquecida con contexto del dominio
}

// ── Reglas de dominio ─────────────────────────────────────────────────────────

interface DomainRule {
  domain: Domain;
  patterns: RegExp[];
  // negación: si alguno de estos patrones aparece, NO aplicar esta regla
  negations?: RegExp[];
  priority: number;  // mayor = se evalúa primero
  sources: string[];
}

@Injectable()
export class DomainRouterService {
  private readonly logger = new Logger(DomainRouterService.name);

  private readonly RULES: DomainRule[] = [
    // ── GOBIERNO LOCAL ────────────────────────────────────────────────────────
    {
      domain: 'GOVERNMENT_LOCAL',
      priority: 100,
      patterns: [
        /intendenta?|gobernador|concejal|concejo deliberante/i,
        /municipalidad\s+de\s+paran[aá]/i,
        /gobierno\s+(de\s+)?paran[aá]/i,
        /entre\s+r[ií]os\s+(gobierno|provincia)/i,
        /gesti[oó]n\s+municipal/i,
        /obra\s+(p[uú]blica|municipal)/i,
        /servicio[s]?\s+municipal/i,
        /secretar[ií]a\s+de\s+(gobierno|salud|obra)/i,
      ],
      sources: ['https://mi.parana.gob.ar', 'https://www.parana.gob.ar', 'https://www.elonce.com'],
    },

    // ── NOTICIAS LOCALES — PARANÁ / ENTRE RÍOS ────────────────────────────────
    {
      domain: 'LOCAL_NEWS',
      priority: 95,
      patterns: [
        /paran[aá]\s+(hoy|noticias|actualidad)/i,
        /noticias\s+(de|en)\s+paran[aá]/i,
        /noticias\s+entre\s+r[ií]os/i,
        /entre\s+r[ií]os\s+hoy/i,
        /elonce|apf\s+digital|apfdigital/i,
        /\bgualeguaych[uú]\b|\bvictoria\b.*entre\s*r[ií]os|\bconcordia\b.*entre/i,
        /litoral\s+argentino/i,
        /costanera\s+paran[aá]/i,
        /parque\s+urquiza/i,
        /puerto\s+viejo\s+paran[aá]/i,
      ],
      sources: [
        'https://www.elonce.com',
        'https://apfdigital.com.ar',
        'https://www.analisisdigital.com.ar',
        'https://www.unoentrerios.com.ar',
      ],
    },

    // ── DEPORTES ──────────────────────────────────────────────────────────────
    {
      domain: 'SPORTS',
      priority: 90,
      patterns: [
        /\bgol(es)?\b|\bpenales?\b|\btiro\s+libre\b/i,
        /\bpartido\b|\bfixture\b|\bclasificaci[oó]n\b/i,
        /\bfutbol\b|\bf[uú]tbol\b|\bsoccer\b/i,
        /\bliga\s+(profesional|argentina|espa[nñ]ola|primera)\b/i,
        /\bcopa\s+(libertadores|argentina|del\s+mundo|mundo|davis|america)/i,
        /\bmundial\b|\bolimpiadas?\b/i,
        /river\s+plate|boca\s+juniors|racing|independiente|san\s+lorenzo|huracan|estudiantes|velez|belgrano|talleres/i,
        /lionel\s+messi|lautaro|di\s+mar[ií]a|scaloni/i,
        /\btenis\b|\bbalonc?esto\b|\bbasket\b|\brugby\b|\bvoleibol\b/i,
        /\bformula\s*1\b|\bf1\b.*\bcircuito\b/i,
        /\btabla\s+(de\s+)?posiciones\b/i,
        /\btransferencia[s]?\b|\bfichaje[s]?\b|\bmercado\s+de\s+pase[s]?\b/i,
      ],
      sources: [
        'https://www.tycsports.com',
        'https://www.ole.com.ar',
        'https://www.promiedos.com.ar',
        'https://www.infobae.com/deportes',
      ],
    },

    // ── INTELIGENCIA ARTIFICIAL ───────────────────────────────────────────────
    {
      domain: 'AI',
      priority: 88,
      patterns: [
        /\bia\b|\binteligencia\s+artificial\b/i,
        /\bllm\b|\blarge\s+language\s+model\b/i,
        /\bgpt[-\s]?\d|\bchatgpt\b|\bclaude\b|\bgemini\b|\bllama\b|\bqwen\b|\bmistral\b/i,
        /\bollama\b|\bopenai\b|\banthropic\b|\bhugging\s*face\b/i,
        /\bmodelo\s+de\s+lenguaje\b|\bembeddings?\b|\bfine.?tuning?\b/i,
        /\bprompt\s*(engineering|injection)?\b/i,
        /\bagente[s]?\s+(ia|inteligente[s]?|autonomo[s]?)\b/i,
        /\bvector\s+(store|database|db)\b|\bpgvector\b|\bpinecone\b/i,
        /\brag\b|\bretrieval.augmented\b/i,
        /\bstable\s+diffusion\b|\bmidjourney\b|\bdall.e\b|\bimagen\b.*ia/i,
      ],
      sources: [
        'https://techcrunch.com',
        'https://huggingface.co/blog',
        'https://arstechnica.com',
        'https://www.fayerwayer.com',
      ],
    },

    // ── PROGRAMACIÓN ─────────────────────────────────────────────────────────
    {
      domain: 'PROGRAMMING',
      priority: 85,
      patterns: [
        /\bnestjs\b|\bnode\.?js\b|\bexpress\.?js\b|\bfastify\b/i,
        /\bnext\.?js\b|\breact\b|\bvue\b|\bangular\b|\bsvelte\b/i,
        /\btypescript\b|\bjavascript\b|\bpython\b|\bjava\b|\brust\b|\bgo\b|\bc\+\+\b/i,
        /\bprisma\b|\bsequelize\b|\btypeorm\b/i,
        /\bpostgresql?\b|\bmongodb\b|\bmysql\b|\bredis\b|\bsqlite\b/i,
        /\bdocker\b|\bkubernetes\b|\bk8s\b|\bnginx\b/i,
        /\bgithub\b|\bgitlab\b|\bci\/cd\b|\bgit\s+(push|pull|merge)\b/i,
        /\bapi\s+rest(ful)?\b|\bgraphql\b|\bwebsocket\b|\bwebhook\b/i,
        /\bdecorador(es)?\b|\binterface[s]?\b|\btipo[s]?\s+genericos?\b/i,
        /\bnpm\b|\byarn\b|\bpnpm\b|\bbun\b.*\binstall\b/i,
      ],
      sources: [
        'https://techcrunch.com',
        'https://arstechnica.com',
        'https://www.fayerwayer.com',
        'https://huggingface.co/blog',
      ],
    },

    // ── CIENCIA ───────────────────────────────────────────────────────────────
    {
      domain: 'SCIENCE',
      priority: 80,
      patterns: [
        /\bconicet\b|\bunciencia\b|\b(investigaci[oó]n|estudio)\s+(cient[ií]fico|acad[eé]mico)\b/i,
        /\bnature\b|\bscience\b.*\b(revista|journal|magazine)\b/i,
        /\bdescubrimiento\s+(cient[ií]fico|arqueol[oó]gico|astronomico)\b/i,
        /\bvacuna\b|\bvirus\b|\bbacteria\b|\bmutaci[oó]n\b|\bgen[oó]mica\b/i,
        /\bpart[ií]cula[s]?\b|\bcern\b|\bfermil?ab\b|\bf[ií]sica\s+cu[aá]ntica\b/i,
        /\bclima\s+(cambio|global|calentamiento)\b|\bco2\b|\bemisiones\b/i,
        /\bexploraci[oó]n\s+(espacial|lunar|marciana)\b|\bnasa\b|\besa\b/i,
        /\bdinosaur[ios]?\b|\bfosil(es)?\b|\bpaleontolog[ií]a\b/i,
      ],
      sources: [
        'https://www.agenciacyta.org.ar',
        'https://www.conicet.gov.ar',
        'https://www.sciencenews.org',
        'https://arstechnica.com',
      ],
    },

    // ── TECNOLOGÍA (general, no programación ni IA) ───────────────────────────
    {
      domain: 'TECHNOLOGY',
      priority: 78,
      patterns: [
        /\bapple\b|\bsamsung\b|\bgoogle\b|\bmicrosoft\b|\bmeta\b|\bamazon\b|\bnvidia\b/i,
        /\biphone\b|\bipad\b|\bmacbook\b|\bandroid\b|\bwindows\b|\blinux\b/i,
        /\bcpu\b|\bgpu\b|\bram\b|\bssd\b|\bprocesador\b/i,
        /\btecnolog[ií]a\b.*\bnoticia[s]?\b/i,
        /\bstartup\b|\bunicornio\b.*\btecn/i,
        /\bapp(licaci[oó]n)?\b.*\blanzamiento\b/i,
        /\bnuevo\s+(celular|smartphone|laptop|tablet|gadget)\b/i,
      ],
      sources: [
        'https://www.fayerwayer.com',
        'https://www.xataka.com',
        'https://techcrunch.com',
        'https://www.muycomputer.com',
      ],
    },

    // ── POLÍTICA NACIONAL ─────────────────────────────────────────────────────
    {
      domain: 'POLITICS',
      priority: 82,
      patterns: [
        /\bmilei\b|\bkirchner\b|\bmacri\b|\bbolsonaro\b/i,
        /\bcongreso\b.*\b(argentina|nacion)\b|\bsenado\b.*\bvot[oó]\b/i,
        /\belecciones?\b.*\b(argentina|nacional|presidencial)\b/i,
        /\bla\s+libertad\s+avanza\b|\buc[eé][dé][eé]\b|\bperonismo\b/i,
        /\bpresidenta?|presidenci/i,
        /\bcasa\s+rosada\b|\bjefatura\s+de\s+gabinete\b/i,
        /\bveto\b.*\bley\b|\bdecret[oó]\b.*\bpresidencial\b/i,
      ],
      sources: [
        'https://www.infobae.com',
        'https://www.lanacion.com.ar',
        'https://www.elonce.com',
      ],
    },

    // ── ECONOMÍA ─────────────────────────────────────────────────────────────
    {
      domain: 'ECONOMY',
      priority: 80,
      patterns: [
        /\bdolar\b|\beuros?\b|\bmoneda\b|\btipo\s+de\s+cambio\b/i,
        /\binflaci[oó]n\b|\brecesi[oó]n\b|\bpbi\b|\bgdp\b/i,
        /\bbanco\s+(central|mundial|nacion)\b/i,
        /\bbonos?\b|\bacciones?\b|\bbolsa\b|\bmerval\b|\bs&p\b/i,
        /\bcripto(moneda)?\b|\bbitcoin\b|\bethereum\b/i,
        /\bcuenta\s+corriente\b|\bfisco\b|\bsuperavit\b|\bdeficit\b/i,
        /\bfmi\b|\bfondo\s+monetario\b/i,
      ],
      sources: [
        'https://www.infobae.com',
        'https://www.lanacion.com.ar',
        'https://arstechnica.com',
      ],
    },

    // ── MÚSICA ───────────────────────────────────────────────────────────────
    {
      domain: 'MUSIC',
      priority: 75,
      patterns: [
        /\bm[uú]sica\b.*\bnueva\b|\b(nuevo|nueva)\s+(canci[oó]n|disco|[aá]lbum)\b/i,
        /\bconcierto\b|\bgira\b|\bfestival\s+(de\s+m[uú]sica|lollapalooza|coachella)\b/i,
        /\bspotify\b.*\b(top|ranking|lista)\b/i,
        /\bbillboard\b|\bhot\s+100\b|\bgrammys?\b/i,
        /\btaylor\s+swift\b|\bbad\s+bunny\b|\bmaluma\b|\bj\s*balvin\b/i,
        /\broad\s+(rock|rolling|stones)\b|\bthe\s+beatles?\b/i,
        /\breggeaton\b|\bcumbia\b|\bfolklore\b|\btango\b/i,
      ],
      sources: [
        'https://www.rollingstone.com.ar',
        'https://los40.com.ar',
        'https://www.lanacion.com.ar/espectaculos/musica',
      ],
    },

    // ── CINE / SERIES ─────────────────────────────────────────────────────────
    {
      domain: 'MOVIES_TV',
      priority: 72,
      patterns: [
        /\bpelicula[s]?\b.*\b(nueva|estreno|cartelera)\b/i,
        /\bserie[s]?\b.*\b(nueva|temporada|estreno)\b/i,
        /\bnetflix\b|\bdisney\+?\b|\bamazon\s+prime\b|\bhbo\s+(max)?\b/i,
        /\boscar(es)?\b|\bcanes\b|\bvenecia\b.*\bfestival\b/i,
        /\bmarvel\b|\bdcu\b|\bstar\s+wars\b|\bpixar\b/i,
        /\bimdb\b|\brottentomat(oes|os)\b/i,
        /\bdirector\b.*\bfilm\b|\bactor(es)?\b.*\bpeli\b/i,
      ],
      sources: [
        'https://www.infobae.com',
        'https://www.lanacion.com.ar',
        'https://whenisthenextmcufilm.com',
      ],
    },

    // ── MISTERIOS ─────────────────────────────────────────────────────────────
    {
      domain: 'MYSTERY',
      priority: 70,
      patterns: [
        /\bovni[s]?\b|\bufo[s]?\b|\bextraterrestre[s]?\b/i,
        /\bparanormal\b|\bsobrenatural\b|\bfenomeno\s+(inexplicable|misterioso)\b/i,
        /\bconspirac[iy][oó]n\b|\billuminati\b|\bmasoneria\b/i,
        /\bcriptido[s]?\b|\bmonstruo\s+(del|de)\b|\bbigfoot\b|\bnessie\b/i,
        /\bzona\s+51\b|\btriangulo\s+de\s+las\s+bermudas\b/i,
        /\barqueolog[ií]a\s+(prohibida|alternativa)\b/i,
      ],
      sources: [
        'https://mysteryplanet.com.ar/site',
        'https://www.infobae.com',
      ],
    },

    // ── NOTICIAS NACIONALES (fallback) ────────────────────────────────────────
    {
      domain: 'NATIONAL_NEWS',
      priority: 60,
      patterns: [
        /\bnoticias?\s+(de\s+)?argentina\b/i,
        /\bultimas?\s+noticias?\b/i,
        /\bactualidad\s+argentina\b/i,
        /\bque\s+pas[oó]\s+(en\s+argentina|hoy)\b/i,
      ],
      sources: [
        'https://www.infobae.com',
        'https://www.lanacion.com.ar',
      ],
    },

    // ── REFERENCIA — Wikipedia y conocimiento enciclopédico ──────────────────
    {
      domain: 'REFERENCE',
      priority: 75,
      patterns: [
        /\bwikipedia\b/i,
        /\bqu[eé]\s+es\s+(?!un\s+bot|el\s+asistente)/i,
        /\bdefinici[oó]n\s+de\b/i,
        /\bhistoria\s+(de|del|de\s+la)\b/i,
        /\benciclopedia\b|\bconcepto\s+de\b/i,
        /\bcu[aá]ndo\s+(naci[oó]|fue\s+fundad|se\s+cre[oó])\b/i,
        /\bdonde\s+(queda|est[aá]|se\s+ubica)\b/i,
        /\bbiograf[ií]a\s+de\b/i,
        /\bpor\s+qu[eé]\s+se\s+llama\b/i,
      ],
      sources: [
        'https://es.wikipedia.org',
        'https://www.infobae.com',
      ],
    },

    // ── PLANTAS MEDICINALES ───────────────────────────────────────────────────
    {
      domain: 'PLANTS',
      priority: 85,
      patterns: [
        /\bplanta[s]?\s+(medicinal|curativa|terapeutica|herbal)\b/i,
        /\bhierba[s]?\s+(medicinal|curativa|natural)\b/i,
        /\bremedio\s+(natural|herbal|casero)\b/i,
        /\binfusi[oó]n\s+de\b|\bt[eé]\s+de\s+\w+\b/i,
        /\bherboristeria\b|\bfitoterapia\b|\bfarmacognosia\b/i,
        /\bpropiedades\s+(curativas|medicinales)\s+(de|del|de\s+la)\b/i,
        /\baloe\s+vera\b|\bburritos?\s+de\s+agua\b|\bmanzanilla\b|\boreg[aá]no\b/i,
        /\balbahaca\b|\bromero\b|\btomillo\b|\bm[eé]nta\b|\bjengibre\b/i,
        /para\s+qu[eé]\s+sirve\s+(?:la|el|las|los)?\s*\w+.*plant/i,
      ],
      sources: [
        'https://ifernandez89.github.io/PlantasMedicinales',
        'https://es.wikipedia.org',
      ],
    },

    // ── DESARROLLO DE SOFTWARE ────────────────────────────────────────────────
    {
      domain: 'DEVELOPMENT',
      priority: 84,
      patterns: [
        /\bdev\.?to\b|\bgithub\s+(blog|release[s]?|changelog)\b/i,
        /\bnueva\s+(version|release)\s+(de|del)\s+\w+/i,
        /\bcambios\s+en\s+(npm|yarn|nestjs|react|node|prisma)\b/i,
        /\brelease\s+notes?\b|\bchangelog\b/i,
        /\bopen\s*source\b.*\b(proyecto|herramienta|libreria|paquete)\b/i,
        /\bpull\s+request\b|\bmerge\b.*\bgithub\b/i,
        /\bnpm\s+(package|paquete)\b|\bnuevo\s+paquete\s+de\b/i,
      ],
      sources: [
        'https://dev.to',
        'https://github.blog',
        'https://arstechnica.com',
      ],
    },

    // ── MCU / MARVEL (especialización de MOVIES_TV) ───────────────────────────
    {
      domain: 'MOVIES_TV',
      priority: 88,
      patterns: [
        /\bmarvel\b|\bmcu\b|\bavengers\b|\bspider.?man\b/i,
        /\biron\s+man\b|\bcapitan\s+america\b|\bthor\b|\bhulk\b/i,
        /\bblack\s+panther\b|\bdoctor\s+strange\b|\bwanda\b/i,
        /\b(proxim[ao]|siguiente|cuando\s+es)\s+.*(pelicula|film)\s+de\s+marvel\b/i,
        /\bcuando\s+(sale|estrena|llega)\s+.*marvel\b/i,
      ],
      sources: [
        'https://whenisthenextmcufilm.com',
        'https://www.infobae.com',
        'https://www.lanacion.com.ar',
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // 🎓 DOMINIOS ACADÉMICOS — Knowledge on Demand
    //
    // Solo se consultan cuando el usuario pregunta algo específico.
    // NO se scrapean periódicamente — TTL largo en SourceRegistry (7-30 días).
    // La definición de derivada no cambia todos los días.
    // ══════════════════════════════════════════════════════════════════════════

    // ── 📐 MATEMÁTICA ─────────────────────────────────────────────────────────
    {
      domain: 'MATH',
      priority: 92, // alta para ganar a referencias genéricas
      patterns: [
        /\bteorema\s+(de\s+)?\w+\b/i,
        /\b(algebra|c[aá]lculo|geometr[ií]a|topolog[ií]a|estad[ií]stica|probabilidad)\b/i,
        /\b(integral|derivada|l[ií]mite|gradiente|divergencia)\b/i,
        /\b(matriz|vector|tensor|espacio\s+(vectorial|de\s+hilbert|m[eé]trico))\b/i,
        /\b(n[uú]mero\s+(primo|complejo|irracional)|serie\s+de\s+fourier)\b/i,
        /\b(ecuaci[oó]n\s+diferencial|transformada|wavelets?)\b/i,
        /\b(bayesian[ao]?|teorema\s+de\s+bayes|distribuci[oó]n\s+(normal|gaussiana))\b/i,
        /\bcombinatori[ca]?\b|\bpermutacion(es)?\b|\bbinomio\s+de\s+newton\b/i,
        /qu[eé]\s+es\s+(un\s+)?(fractal|grupo\s+abeliano|espacio\s+de\s+hilbert|anillo\s+algebraico)/i,
      ],
      sources: [
        'https://mathworld.wolfram.com',
        'https://encyclopediaofmath.org',
        'https://es.wikipedia.org',
      ],
    },

    // ── ⚛️ FÍSICA ─────────────────────────────────────────────────────────────
    {
      domain: 'PHYSICS',
      priority: 91,
      patterns: [
        /\bf[ií]sica\s+(cu[aá]ntica|cl[aá]sica|nuclear|te[oó]rica|experimental)\b/i,
        /\brelativi(dad|ty)\s+(especial|general)?\b/i,
        /\bmec[aá]nica\s+(cl[aá]sica|cu[aá]ntica|de\s+fluidos|newtoniana)\b/i,
        /\btermodin[aá]mica\b|\belectromagnetismo\b|\b[oó]ptica\s+f[ií]sica\b/i,
        /\bpart[ií]cula[s]?\s+(subat[oó]mica[s]?|elementales?|de\s+higgs)\b/i,
        /\bqu[aá]rks?\b|\bboson(es)?\s+de\s+higgs\b|\blepton(es)?\b|\bfot[oó]n\b/i,
        /\bmodelo\s+est[aá]ndar\b|\bteor[ií]a\s+de\s+cuerdas\b/i,
        /\bsuperconductividad\b|\bpl[aá]sma\s+f[ií]sico\b|\bacelerador\s+de\s+part/i,
        /qu[eé]\s+es\s+(el|la|un[ao]?)?\s*(gravitaci[oó]n|entrop[ií]a|energ[ií]a\s+oscura|materia\s+oscura)/i,
      ],
      sources: [
        'http://hyperphysics.phy-astr.gsu.edu/hbase/hph.html',
        'https://physicsworld.com',
        'https://es.wikipedia.org',
      ],
    },

    // ── 🌌 ASTRONOMÍA ─────────────────────────────────────────────────────────
    {
      domain: 'ASTRONOMY',
      priority: 90,
      negations: [
        // NO confundir con astrología
        /\bhoroscopo\b|\bsigno\s+zodiacal\b|\bcarta\s+astral\b/i,
      ],
      patterns: [
        /\bnasa\b|\besa\b|\bagencia\s+espacial\b/i,
        /\bmisi[oó]n\s+(espacial|lunar|marciana|artemis|james\s+webb)\b/i,
        /\btelesc[oó]pio\s+(james\s+webb|hubble|espacial)\b/i,
        /\bexoplaneta[s]?\b|\bexoplnet\b|\bplaneta\s+extrasolar\b/i,
        /\bagujero\s+negro\b|\bestrella\s+de\s+neutrones\b|\bp[uú]lsar\b/i,
        /\bexpansi[oó]n\s+del\s+universo\b|\bbig\s+bang\b|\bcosmolog[ií]a\b/i,
        /\bastrof[ií]sica\b|\bgalaxia[s]?\s+(cercana[s]?|espiral)\b/i,
        /\borb[ií]ta\s+(lunar|marciana|terrestre)\b|\bsat[eé]lite\s+(artificial)?\b/i,
        /\ballunizaje\b|\bexplorac[ií]on\s+de\s+marte\b/i,
      ],
      sources: [
        'https://science.nasa.gov',
        'https://www.esa.int/Science_Exploration',
        'https://es.wikipedia.org',
      ],
    },

    // ── 💻 DOCUMENTACIÓN WEB ─────────────────────────────────────────────────
    {
      domain: 'WEB_DOCS',
      priority: 89,
      patterns: [
        /\bcss\s+(grid|flexbox|variables|animacion|selector)\b/i,
        /\bjavascript\s+(fetch|promise|async|dom|event)\b/i,
        /\bhtml\s+(semantico|accesible|form|elemento)\b/i,
        /\bweb\s+(api|components?|workers?|sockets?)\b/i,
        /\bmdn\b|\bdeveloper\.mozilla\b/i,
        /\bpostgresql\s+(query|index[es]?|join|transaction)\b/i,
        /\bsql\s+(join|index|explain|query|postgres)\b/i,
        /\bpostgres\s+(doc|command|syntax|function)\b/i,
        /c[oó]mo\s+(usar|funciona)\s+(flex|grid|promise|fetch)\b/i,
      ],
      sources: [
        'https://developer.mozilla.org/es/docs/Web',
        'https://www.postgresql.org/docs/current',
        'https://es.wikipedia.org',
      ],
    },

    // ── 🤖 PAPERS DE IA ───────────────────────────────────────────────────────
    {
      domain: 'AI_PAPERS',
      priority: 87,
      patterns: [
        /\bpaper[s]?\s+(de|sobre|en)\s+(ia|inteligencia|machine\s+learning|llm)\b/i,
        /\barxiv\b|\bpreprint\b/i,
        /\b(nuevo|reciente)\s+(paper|estudio|investigaci[oó]n)\s+(de|sobre|en)\s+(ia|ml|llm)\b/i,
        /\bpublicaci[oó]n\s+cient[ií]fica\s+(de|sobre)\s+(ia|transformers?|llm)\b/i,
        /\btransformers?\s+(architecture|paper|attention)\b/i,
        /\battention\s+is\s+all\s+you\s+need\b/i,
        /\bstate\s+of\s+the\s+art\s+(en|de)\s+(ia|nlp|llm)\b/i,
        /\bhugging\s*face\s+papers?\b/i,
      ],
      sources: [
        'https://arxiv.org/list/cs.AI/recent',
        'https://huggingface.co/papers',
        'https://arxiv.org/list/cs.LG/recent',
      ],
    },
  ];

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Clasifica el dominio de una consulta WEB.
   * Devuelve el dominio más probable con fuentes sugeridas.
   *
   * @param query  La pregunta del usuario (normalizada o no)
   */
  classify(query: string): DomainResult {
    const scores = new Map<Domain, { score: number; rule: DomainRule }>();

    for (const rule of this.RULES) {
      // Verificar negaciones primero
      if (rule.negations?.some((neg) => neg.test(query))) continue;

      // Contar patrones que coinciden
      let matches = 0;
      for (const pattern of rule.patterns) {
        if (pattern.test(query)) matches++;
      }

      if (matches > 0) {
        // Score = matches × priority (normalizado)
        const score = (matches / rule.patterns.length) * rule.priority;
        const existing = scores.get(rule.domain);
        if (!existing || score > existing.score) {
          scores.set(rule.domain, { score, rule });
        }
      }
    }

    if (scores.size === 0) {
      return {
        domain: 'UNKNOWN',
        confidence: 0,
        reason: 'no matching domain rules',
        suggestedSources: [],
      };
    }

    // Ordenar por score descendente
    const sorted = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
    const [topDomain, topData] = sorted[0];

    // Calcular confianza (0-1) basada en score relativo al máximo posible
    const maxPossibleScore = topData.rule.priority;
    const confidence = Math.min(topData.score / maxPossibleScore, 1.0);

    const result: DomainResult = {
      domain: topDomain,
      confidence: parseFloat(confidence.toFixed(2)),
      reason: `matched ${topData.rule.patterns.filter((p) => p.test(query)).length}/${topData.rule.patterns.length} patterns of ${topDomain} (priority ${topData.rule.priority})`,
      suggestedSources: topData.rule.sources,
      enrichedQuery: this.enrichQuery(query, topDomain),
    };

    this.logger.log(
      `[domain] ${topDomain} (${result.confidence}) — "${query.slice(0, 60)}"`,
    );

    return result;
  }

  /**
   * Enriquece la query con contexto del dominio para mejorar el scraping.
   */
  private enrichQuery(query: string, domain: Domain): string {
    const n = query.toLowerCase();

    switch (domain) {
      case 'LOCAL_NEWS':
      case 'GOVERNMENT_LOCAL':
        if (!/paran[aá]|entre\s*r[ií]os/i.test(n)) {
          return `${query} Paraná Entre Ríos`;
        }
        return query;

      case 'NATIONAL_NEWS':
      case 'POLITICS':
        if (!/argentin/i.test(n)) return `${query} Argentina`;
        return query;

      case 'SPORTS':
        if (!/argentin|liga|copa/i.test(n)) return `${query} Argentina`;
        return query;

      case 'AI':
        if (!/ia\b|inteligencia/i.test(n)) return `${query} inteligencia artificial`;
        return query;

      default:
        return query;
    }
  }
}
