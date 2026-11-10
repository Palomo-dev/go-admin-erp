/**
 * «Plantilla completa»: el sitio ENTERO que trae por defecto cada plantilla del catálogo.
 *
 * Pedido del dueño: «las plantillas deberían tener predeterminado un header y un footer y las
 * secciones y las páginas y menús, ya como default». «Usar esta plantilla» solo cambiaba el estilo
 * y reordenaba Inicio (`usarPlantilla.ts`, hoy «Solo estilo» puro); con un sitio importado del viejo, Inicio
 * quedaba arrancando con «Nuestro Menú» bajo el encabezado.
 *
 * FUENTE ÚNICA. Quien necesite «el sitio por defecto de una plantilla o de un giro» llama aquí:
 * - `armarPlantillaCompleta(base, plantilla, datos, opciones)` — puro, sin React ni Supabase.
 * - `plantillaPorDefectoDelGiro(catalogo, giro)` — la que se sugiere primero en cada giro.
 * - En servidor, `documentoPlantillaCompleta(...)` de `src/lib/services/website/plantillaCompletaService.ts`
 *   lee los datos reales de la organización (y de la sede) y llama a esta función. La sede que
 *   nace con la plantilla de su tipo de negocio debe usar esa función, no una copia.
 *
 * Qué arma, sin duplicar lo que ya existe:
 * - Estilo: `aplicarEstiloPlantilla` (el mismo de «Solo estilo»).
 * - Páginas: el juego base del giro (`paginasBasePorGiro`, copia verificada de
 *   `create_default_pages`) más las legales. Inicio lleva la estructura de la plantilla
 *   (`plantilla.inicio`), en su orden.
 * - Encabezado y pie: los de la PLANTILLA aprobados en Figma (`shellPorPlantilla.ts`; el giro como
 *   respaldo). Sus botones y menús se resuelven contra las páginas reales: nunca un enlace roto.
 * - Menús: «Encabezado» con las páginas «en el menú», el megamenú de categorías si la plantilla lo
 *   pide y los menús del pie de la plantilla («Legales», «Ayuda», «Políticas»…), con las páginas
 *   que necesitan (preguntas frecuentes, eventos, alérgenos, políticas de la estadía).
 * - Contenido inicial con los DATOS REALES de la organización: nombre, ciudad, dirección, teléfono,
 *   productos con foto, categorías, el banner del sitio viejo y los testimonios que de verdad existen.
 *   Donde no hay datos, textos de ejemplo en español que no inventan hechos.
 * - Las secciones que necesitan datos que no hay (personas, cifras, logos, opiniones, precios)
 *   quedan OCULTAS en los tres dispositivos: están en el editor para completarlas y el sitio público
 *   no las pinta. Nunca testimonios con nombres inventados.
 *
 * Se conservan del borrador anterior: identidad (logo y nombre), SEO, contenido del negocio, las
 * páginas de sistema (carrito, checkout, cuenta, detalles: `plantillas/*`) y las legales (pueden
 * tener el texto real de la organización). Todo lo demás queda en el historial antes de guardar
 * (instantánea `antes_de_restaurar`), y se puede deshacer.
 *
 * Plantillas de tienda nuevas (2026-11, PLANO §1 y §4; solo las que traen estos campos):
 * - Cada sección puede traer su propio contenido (`SeccionPlantilla[2]`), que va SOBRE el inicial.
 * - `plantilla.detalle` REEMPLAZA la ficha (`product_detail`) y la página de categoría
 *   (`category_detail`) del borrador (decisión D4): conserva su id, su dirección y si estaba
 *   publicada; si no existían, las crea en `plantillas/product-detail` y `plantillas/category-detail`.
 *   Carrito, checkout y cuenta se siguen conservando.
 * - Con el estilo (no en una sede): tarjeta de producto (`tema.tarjetaProducto`), perillas
 *   (`tema.tokens`) y paginación y carrusel (`tema.paginacion`/`tema.carrusel`), cada una solo con
 *   su bandera ya existente encendida (`OpcionesPlantillaCompleta`).
 * Las plantillas de antes no traen nada de esto: su resultado es el mismo de siempre.
 */
import { valorPropio, type DocumentoSitio, type ItemMenu, type MenuSitio, type PaginaSitio, type SeccionSitio, type TarjetaProductoDocumento } from '@/lib/website/contrato/documentoSitio';
import { construirCatalogo, plantillasDelGiro, type CatalogoPlantillas, type GiroCatalogo, type PlantillaCatalogo, type SeccionPlantilla } from '@/lib/website/contrato/catalogoPlantillas';
import { construirPaginaBase, paginasBasePorGiro, plantillaPorId, type GenerarId, type Giro, type PaginaBase } from '@/components/sitio-web/paginas/plantillasPagina';
import { VARIANTE_CARTA_QR, VARIANTE_PORTADA_MESA } from '@/lib/website/contrato/seccionesMesa';
import {
  CAPITULOS_EJEMPLO,
  VARIANTE_CARTA_PUNTOS,
  VARIANTE_HISTORIA_CAPITULOS,
  VARIANTE_PORTADA_EDITORIAL,
  VARIANTE_RESERVA_PLANO,
} from '@/lib/website/contrato/seccionesCafe';
import { esInicio, esPaginaLegal, esPlantillaTienda } from '@/components/sitio-web/paginas/tipoPagina';
import { type ClaveLegal } from '@/lib/website/configuracionSitio';
import { paginaPorClave } from '@/lib/website/legales/documentoLegal';
import { TEMPLATE_PRESETS } from '@/lib/website/contrato/presetsPlantillas';
import { aplicarEstiloPlantilla } from './usarPlantilla';
import { COMPOSICIONES_FOOTER, COMPOSICIONES_HEADER } from './mapeoAjustes';
import { normalizarSlug } from './importadorLegacy';
import { MAX_BLOQUES_COLOR } from '@/lib/website/contrato/seccionesTienda';
import { shellDePlantilla, type BotonPlantilla, type ClaveMenuPie, type DestinoBoton, type ShellPlantilla } from './shellPorPlantilla';

/** Catálogo completo (las 8 de restaurante y las del sitio), el mismo de Diseño y Plantillas. */
export const CATALOGO_PLANTILLAS: CatalogoPlantillas = construirCatalogo(TEMPLATE_PRESETS);

// ─── Encabezado y pie por plantilla ────────────────────────────────────────────────────────────

/** Composiciones que el sitio público sabe pintar (las del contrato, `mapeoAjustes.ts`). */
export const COMPOSICIONES_ENCABEZADO = COMPOSICIONES_HEADER;
export const COMPOSICIONES_PIE = COMPOSICIONES_FOOTER;
export type ComposicionEncabezado = (typeof COMPOSICIONES_ENCABEZADO)[number];
export type ComposicionPie = (typeof COMPOSICIONES_PIE)[number];

/**
 * Encabezado y pie: UN SOLO LUGAR, `shellPorPlantilla.ts` (por plantilla, el giro como respaldo).
 * Aquí solo se resuelven sus destinos contra las páginas reales del documento.
 */
export { SHELL_POR_PLANTILLA, SHELL_RESPALDO_GIRO, shellDePlantilla } from './shellPorPlantilla';

// ─── Datos reales de la organización ───────────────────────────────────────────────────────────

export interface CategoriaPlantilla {
  id: number;
  nombre: string;
  slug?: string | null;
  /** Color propio de la categoría (hex); otro valor = sin color. */
  color?: string | null;
  imagenUrl?: string | null;
}

export interface ProductoPlantilla {
  id: number;
  nombre: string;
  imagenUrl: string | null;
  categoriaId: number | null;
}

/** Lo que la plantilla lee de la organización. Todo opcional: sin datos, textos de ejemplo. */
export interface DatosNegocio {
  nombre: string | null;
  /** Descripción corta de la organización (eslogan). */
  descripcion: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  /** Portada de la sede (`branches.website_cover_url`). */
  portadaUrl: string | null;
  /** Productos activos, primero los que tienen foto. */
  productos: readonly ProductoPlantilla[];
  /**
   * Categorías activas. `slug`, `color` e `imagenUrl` (`categories.slug/color/image_url`) los usan
   * solo las secciones de las plantillas de tienda nuevas (bloques de color, enlaces).
   */
  categorias: readonly CategoriaPlantilla[];
  /** Testimonios activos de verdad (`testimonials`). */
  testimonios: number;
  /** true si el sitio tiene envíos activos y el giro no es tienda ni restaurante. */
  envios?: boolean;
}

export const DATOS_VACIOS: DatosNegocio = {
  nombre: null,
  descripcion: null,
  ciudad: null,
  direccion: null,
  telefono: null,
  portadaUrl: null,
  productos: [],
  categorias: [],
  testimonios: 0,
};

/**
 * Imagen de portada del sitio anterior: la del primer hero de su Inicio (el banner que ya tenían).
 * Se usa antes que la portada de la sede y que la foto de un producto.
 */
export function bannerDelSitio(documento: DocumentoSitio): string | null {
  const inicio = documento.paginas.find((p) => esInicio(p));
  for (const s of inicio?.secciones ?? []) {
    if (s.tipo !== 'hero' && s.tipo !== 'restaurant_hero') continue;
    const url = s.contenido.image_url;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
    const slides = s.contenido.slides;
    if (Array.isArray(slides)) {
      const conImagen = slides.find((x) => x && typeof (x as { image_url?: unknown }).image_url === 'string');
      if (conImagen) return (conImagen as { image_url: string }).image_url;
    }
  }
  return null;
}

// ─── Textos de ejemplo (solo donde no hay datos; no inventan hechos) ──────────────────────────

interface TextosGiro {
  bienvenida: string;
  subtituloInicio: string;
  ctaFinal: { titulo: string; subtitulo: string };
  preguntas: readonly { question: string; answer: string }[];
  ventajas: readonly { title: string; description: string; icon: string }[];
  pasos: readonly { title: string; description: string }[];
}

const PREGUNTAS_CONTACTO = { question: '¿Cómo los contacto?', answer: 'Escríbenos desde la página de contacto o llámanos: te respondemos lo antes posible.' };

const TEXTOS_GIRO: Record<Giro, TextosGiro> = {
  restaurante: {
    bienvenida: 'Bienvenido a nuestra mesa',
    subtituloInicio: 'Cocina hecha cada día. Reserva tu mesa o pide en línea para recoger o a domicilio.',
    ctaFinal: { titulo: 'Te esperamos', subtitulo: 'Reserva tu mesa o haz tu pedido en línea.' },
    preguntas: [
      { question: '¿Puedo reservar en línea?', answer: 'Sí. En «Reservar mesa» eliges el día, la hora y cuántas personas vienen.' },
      { question: '¿Hacen pedidos para llevar?', answer: 'Sí. En «Pedir online» eliges tus platos y los pagas en línea.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'ChefHat', title: 'Cocina de la casa', description: 'Recetas preparadas en nuestra cocina.' },
      { icon: 'CalendarCheck', title: 'Reserva fácil', description: 'Aparta tu mesa en pocos pasos.' },
      { icon: 'ShoppingBag', title: 'Pide en línea', description: 'Para recoger o a domicilio.' },
    ],
    pasos: [
      { title: 'Elige', description: 'Mira la carta y escoge tus platos.' },
      { title: 'Pide o reserva', description: 'Haz tu pedido en línea o aparta tu mesa.' },
      { title: 'Disfruta', description: 'Te esperamos en la mesa o en tu casa.' },
    ],
  },
  tienda: {
    bienvenida: 'Bienvenido a nuestra tienda',
    subtituloInicio: 'Compra en línea y recibe tu pedido donde estés.',
    ctaFinal: { titulo: '¿Encontraste lo que buscabas?', subtitulo: 'Mira todo el catálogo y compra en línea.' },
    preguntas: [
      { question: '¿Cómo compro?', answer: 'Agrega los productos al carrito y paga en línea en pocos pasos.' },
      { question: '¿Puedo ver el estado de mi pedido?', answer: 'Sí. Desde tu cuenta ves tus pedidos y su estado.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'ShoppingBag', title: 'Compra en línea', description: 'Elige, paga y listo.' },
      { icon: 'ShieldCheck', title: 'Pago seguro', description: 'Pagas con los medios de pago habilitados.' },
      { icon: 'MessageCircle', title: 'Te acompañamos', description: 'Escríbenos si tienes una duda.' },
    ],
    pasos: [
      { title: 'Elige', description: 'Busca en el catálogo y agrega al carrito.' },
      { title: 'Paga', description: 'Paga en línea de forma segura.' },
      { title: 'Recibe', description: 'Te avisamos cuando tu pedido esté listo.' },
    ],
  },
  hotel: {
    bienvenida: 'Bienvenido',
    subtituloInicio: 'Reserva tu habitación en línea y prepárate para descansar.',
    ctaFinal: { titulo: 'Reserva tu estadía', subtitulo: 'Elige tus fechas y la habitación que prefieras.' },
    preguntas: [
      { question: '¿Cómo reservo?', answer: 'En «Habitaciones» eliges las fechas y la habitación, y confirmas en línea.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'BedDouble', title: 'Habitaciones para descansar', description: 'Elige la que mejor te quede.' },
      { icon: 'CalendarCheck', title: 'Reserva en línea', description: 'Confirma tu estadía en pocos pasos.' },
      { icon: 'MessageCircle', title: 'Te atendemos', description: 'Escríbenos antes de tu llegada.' },
    ],
    pasos: [
      { title: 'Elige tus fechas', description: 'Revisa la disponibilidad.' },
      { title: 'Reserva', description: 'Confirma la habitación en línea.' },
      { title: 'Llega y descansa', description: 'Te esperamos.' },
    ],
  },
  servicios: {
    bienvenida: 'Te ayudamos',
    subtituloInicio: 'Cuéntanos qué necesitas y agenda una cita con nuestro equipo.',
    ctaFinal: { titulo: '¿Hablamos?', subtitulo: 'Escríbenos y agenda una cita.' },
    preguntas: [
      { question: '¿Cómo agendo una cita?', answer: 'Desde la página de contacto nos dejas tus datos y te confirmamos.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'UserCheck', title: 'Atención personalizada', description: 'Te escuchamos antes de proponer.' },
      { icon: 'CalendarCheck', title: 'Citas a tu medida', description: 'Agenda cuando te quede bien.' },
      { icon: 'MessageCircle', title: 'Seguimiento', description: 'Te contamos cómo va tu caso.' },
    ],
    pasos: [
      { title: 'Cuéntanos', description: 'Escríbenos qué necesitas.' },
      { title: 'Agenda', description: 'Elegimos juntos el mejor momento.' },
      { title: 'Te acompañamos', description: 'Hacemos el trabajo y te mantenemos al tanto.' },
    ],
  },
  gimnasio: {
    bienvenida: 'Entrena con nosotros',
    subtituloInicio: 'Elige tu membresía y empieza hoy.',
    ctaFinal: { titulo: 'Empieza hoy', subtitulo: 'Mira las membresías y elige la tuya.' },
    preguntas: [
      { question: '¿Cómo me inscribo?', answer: 'Elige tu membresía en «Membresías» o escríbenos desde contacto.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'Dumbbell', title: 'Entrena a tu ritmo', description: 'Planes para cada objetivo.' },
      { icon: 'CalendarCheck', title: 'Clases', description: 'Mira el horario y separa tu cupo.' },
      { icon: 'Users', title: 'Acompañamiento', description: 'Nuestro equipo te orienta.' },
    ],
    pasos: [
      { title: 'Elige tu plan', description: 'Mira las membresías.' },
      { title: 'Inscríbete', description: 'Te damos la bienvenida.' },
      { title: 'Entrena', description: 'Empieza cuando quieras.' },
    ],
  },
  transporte: {
    bienvenida: 'Viaja con nosotros',
    subtituloInicio: 'Consulta nuestras rutas y cotiza tu viaje.',
    ctaFinal: { titulo: '¿Planeas un viaje?', subtitulo: 'Escríbenos y te enviamos una cotización.' },
    preguntas: [
      { question: '¿Cómo cotizo un viaje?', answer: 'Escríbenos desde contacto con el origen, el destino y la fecha.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'Route', title: 'Rutas', description: 'Consulta a dónde vamos.' },
      { icon: 'CalendarCheck', title: 'Reserva', description: 'Aparta tu cupo con tiempo.' },
      { icon: 'MessageCircle', title: 'Te atendemos', description: 'Resolvemos tus dudas antes del viaje.' },
    ],
    pasos: [
      { title: 'Cotiza', description: 'Cuéntanos tu viaje.' },
      { title: 'Reserva', description: 'Confirmamos tu cupo.' },
      { title: 'Viaja', description: 'Te llevamos a tu destino.' },
    ],
  },
  parqueadero: {
    bienvenida: 'Parquea con tranquilidad',
    subtituloInicio: 'Consulta tarifas y zonas antes de llegar.',
    ctaFinal: { titulo: '¿Necesitas dónde parquear?', subtitulo: 'Mira las tarifas y los planes mensuales.' },
    preguntas: [
      { question: '¿Tienen planes mensuales?', answer: 'Consulta los planes en «Tarifas» o escríbenos desde contacto.' },
      PREGUNTAS_CONTACTO,
    ],
    ventajas: [
      { icon: 'ParkingSquare', title: 'Zonas', description: 'Consulta dónde parquear.' },
      { icon: 'Receipt', title: 'Tarifas claras', description: 'Mira el valor antes de llegar.' },
      { icon: 'MessageCircle', title: 'Te atendemos', description: 'Escríbenos si tienes una duda.' },
    ],
    pasos: [
      { title: 'Consulta', description: 'Mira tarifas y zonas.' },
      { title: 'Llega', description: 'Parquea en la zona disponible.' },
      { title: 'Paga', description: 'Paga al salir o con tu plan.' },
    ],
  },
};

/** Subtítulo de la cabecera de cada página del juego base (por dirección). */
const SUBTITULO_PAGINA: Readonly<Record<string, string>> = {
  menu: 'Descubre nuestros platos y bebidas',
  carta: 'Los precios y algunos platos cambian según la sede.',
  historia: 'Cómo empezó todo y lo que nos mueve',
  domicilios: 'Pide en línea para recoger o a domicilio',
  'reservas-mesa': 'Elige el día, la hora y cuántas personas vienen',
  nosotros: 'Conoce quiénes somos',
  contacto: 'Estamos aquí para ayudarte',
  galeria: 'Así se vive la experiencia',
  espacios: 'Elige la habitación para tu estadía',
  servicios: 'Todo lo que podemos hacer por ti',
  productos: 'Todo nuestro catálogo',
  categorias: 'Encuentra lo que buscas',
  ofertas: 'Aprovecha nuestras promociones',
  precios: 'Elige el plan que más te sirve',
  membresias: 'Elige el plan perfecto para ti',
  clases: 'Consulta el horario y separa tu cupo',
  entrenadores: 'Conoce a nuestro equipo',
  rutas: 'Consulta a dónde vamos',
  flota: 'Conoce nuestros vehículos',
  zonas: 'Encuentra dónde parquear',
  tarifas: 'Consulta el valor antes de llegar',
  eventos: 'Celebra con nosotros',
  alergenos: 'Pregúntanos antes de pedir',
  'preguntas-frecuentes': 'Resolvemos tus dudas',
};

// ─── Secciones: qué se oculta sin datos ────────────────────────────────────────────────────────

/**
 * Tipos que muestran personas, cifras, logos, precios o eventos de la organización. Sin esos datos
 * reales se crean OCULTOS (no inventamos nada); el dueño los completa y los muestra en el editor.
 */
export const TIPOS_QUE_NECESITAN_DATOS: ReadonlySet<string> = new Set([
  'testimonials',
  'team',
  'chef_team',
  'trainers',
  'stats',
  'partners',
  'brands',
  'integrations',
  'transformation',
  'events',
  'private_events',
  'routes',
  'fleet_showcase',
  'pricing_table',
  'class_schedule',
  'coverage_map',
  'amenities',
  // Plantillas de tienda nuevas: piden fotos con puntos, detalles de una pieza o un cupón real.
  'shop_the_look',
  'product_anatomy',
  'welcome_popup',
]);

interface ContextoSeccion {
  giro: Giro;
  datos: DatosNegocio;
  textos: TextosGiro;
  /** Dirección pública de una página del juego por su slug (o `null` si no está). */
  ruta: (slug: string) => string | null;
  portada: string | null;
  fotos: readonly { url: string; alt: string }[];
  esInicio: boolean;
  pagina: { titulo: string; slug: string };
  /** Botón principal de la plantilla con su destino ya resuelto (o `null`). */
  cta: { texto: string; url: string } | null;
}

interface SeccionArmada {
  contenido: Record<string, unknown>;
  visible: boolean;
}

const limpio = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Primera frase de la descripción, si es corta (eslogan). */
function eslogan(datos: DatosNegocio): string | null {
  const d = limpio(datos.descripcion);
  if (!d) return null;
  const frase = d.split(/(?<=[.!?])\s/)[0];
  return frase.length <= 160 ? frase : null;
}

const conValor = (obj: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));

/**
 * Portadas de las plantillas de tienda nuevas (`hero · search | brand_giant | floating |
 * split_products`, contrato `seccionesTienda.ts`). `null` = no es una de ellas (lo de siempre).
 * La marca gigante no lleva `brand_text`: vacío = el nombre de la organización (lo pone el sitio).
 */
function portadaDeTienda(variante: string, c: ContextoSeccion, nombre: string | null, lema: string | null): SeccionArmada | null {
  const titulo = nombre ?? c.textos.bienvenida;
  const subtitulo = lema ?? c.textos.subtituloInicio;
  const fondo = { section_background: { padding_top: 0 } };
  switch (variante) {
    case 'search':
      return { contenido: { ...conValor({ title: titulo, subtitle: subtitulo, image_url: c.portada, search_placeholder: '¿Qué buscas?' }), ...fondo }, visible: true };
    case 'brand_giant':
      return { contenido: { ...conValor({ title: subtitulo, image_url: c.portada }), ...fondo }, visible: true };
    case 'floating':
      return { contenido: { ...conValor({ title: titulo, subtitle: subtitulo, image_url: c.portada }), ...fondo }, visible: true };
    case 'split_products': {
      const ids = c.datos.productos.filter((p) => p.imagenUrl).slice(0, 3).map((p) => p.id);
      return {
        contenido: { ...conValor({ title: titulo, subtitle: subtitulo, image_url: c.portada, product_ids: ids.length > 0 ? ids : null }), ...fondo },
        visible: true,
      };
    }
    default:
      return null;
  }
}

/**
 * Contenido inicial de una sección. Solo usa claves que el editor declara para ese tipo
 * (`SECTION_CATALOG`, verificado contra el manifiesto del sitio); la prueba lo comprueba.
 */
export function contenidoInicial(tipo: string, variante: string, c: ContextoSeccion): SeccionArmada {
  const { datos, textos } = c;
  const nombre = limpio(datos.nombre);
  const lema = eslogan(datos);
  // Solo destinos internos (página o ruta del sitio): «whatsapp» / «maps» no van en una sección.
  const cta = c.cta && c.cta.url.startsWith('/') ? c.cta : null;
  const rutaCta = cta?.url ?? null;
  // «Café de especialidad» llama «Carta» (/carta) a la página del menú.
  const carta = c.ruta('menu') ?? c.ruta('carta');
  const reservas = c.ruta('reservas-mesa');
  const pedir = c.ruta('domicilios');
  const contacto = c.ruta('contacto');
  const fotos = c.fotos;

  if (TIPOS_QUE_NECESITAN_DATOS.has(tipo)) {
    if (tipo === 'testimonials') {
      // Solo los testimonios reales de la tabla `testimonials`; nunca ítems inventados.
      return { contenido: { title: 'Lo que dicen nuestros clientes', data_source: 'database', max_items: 6 }, visible: datos.testimonios > 0 };
    }
    return { contenido: {}, visible: false };
  }

  switch (tipo) {
    case 'restaurant_hero': {
      // Bienvenida de la mesa (Carta QR): los textos por defecto del contrato, con {mesa}.
      if (variante === VARIANTE_PORTADA_MESA) return { contenido: {}, visible: true };
      const bento = variante === 'split_bento';
      const tarjetas = [
        carta && { label: 'Carta', url: carta, image_url: fotos[1]?.url },
        reservas && { label: 'Reservas', url: reservas, image_url: fotos[2]?.url },
        c.ruta('nosotros') && { label: 'Nosotros', url: c.ruta('nosotros'), image_url: fotos[3]?.url },
      ].filter(Boolean) as Record<string, unknown>[];
      return {
        contenido: conValor({
          eyebrow: limpio(datos.ciudad),
          title: nombre,
          subtitle: lema ?? textos.subtituloInicio,
          primary_cta_text: cta?.texto ?? null,
          primary_cta_url: rutaCta,
          secondary_cta_text: carta ? 'Ver la carta' : null,
          secondary_cta_url: carta,
          image_url: c.portada,
          image_alt: c.portada ? (nombre ?? 'Portada') : null,
          cards: bento && tarjetas.length > 0 ? tarjetas.map(conValor) : null,
        }),
        visible: true,
      };
    }
    case 'hero': {
      if (variante === VARIANTE_PORTADA_EDITORIAL) {
        // Carrusel editorial (lámina 12): una foto (la portada) para empezar; el dueño suma las suyas.
        const foto = c.portada ?? fotos[0]?.url ?? null;
        const botones = [
          reservas && { label: 'Reservar mesa', url: reservas, variant: 'solid' },
          carta && { label: 'Ver carta', url: carta, variant: 'outline' },
        ].filter(Boolean) as Record<string, unknown>[];
        return {
          contenido: {
            ...conValor({
              eyebrow: limpio(datos.ciudad),
              title: nombre ?? textos.bienvenida,
              subtitle: lema ?? textos.subtituloInicio,
              subtitle_style: 'italic',
              slides: foto ? [{ image_url: foto, alt: nombre ?? 'Portada' }] : null,
              buttons: botones.length > 0 ? botones : null,
              show_title: true,
              show_cta: botones.length > 0,
              show_overlay: Boolean(foto),
            }),
            section_background: { padding_top: 0 },
          },
          visible: true,
        };
      }
      const tienda = portadaDeTienda(variante, c, nombre, lema);
      if (tienda) return tienda;
      if (!c.esInicio) {
        const imagen = variante === 'minimal' ? null : (fotos[0]?.url ?? c.portada);
        return { contenido: { ...conValor({ title: c.pagina.titulo, subtitle: SUBTITULO_PAGINA[c.pagina.slug] ?? null, image_url: imagen }), section_background: { padding_top: 0 } }, visible: true };
      }
      return {
        contenido: { ...conValor({
          title: nombre ?? textos.bienvenida,
          subtitle: lema ?? textos.subtituloInicio,
          image_url: c.portada,
          cta_text: cta?.texto ?? null,
          cta_url: rutaCta,
          show_cta: Boolean(rutaCta),
          show_title: true,
          show_overlay: Boolean(c.portada),
        }),
        // Portada nueva: margen superior en 0 explícito (las tiendas guardadas sin él no cambian).
        section_background: { padding_top: 0 } },
        visible: true,
      };
    }
    case 'signature_dishes': {
      const platos = datos.productos.filter((p) => p.imagenUrl).slice(0, 4);
      return {
        contenido: { eyebrow: 'De la casa', title: 'Platos estrella', dishes: platos.map((p) => ({ product_id: p.id })) },
        visible: platos.length > 0,
      };
    }
    case 'menu_preview':
      return { contenido: { title: 'Nuestra carta', subtitle: 'Lo que más piden nuestros clientes' }, visible: true };
    case 'menu_full':
      // La carta QR va sin título grande: arriba están la bienvenida y la barra de la mesa.
      if (variante === VARIANTE_CARTA_QR) return { contenido: {}, visible: true };
      // Línea de puntos (lámina 14): en Inicio, una muestra; en Carta, con la nota de la sede.
      if (variante === VARIANTE_CARTA_PUNTOS) {
        return {
          contenido: c.esInicio
            ? // Inicio (láminas 11 y 12): solo los destacados, con el botón a la carta completa.
              { eyebrow: 'De la barra', title: 'Lo que más se pide', subtitle: 'En la carta completa eliges la sede.', only_featured: true }
            : { title: 'Nuestra carta', subtitle: SUBTITULO_PAGINA.carta },
          visible: true,
        };
      }
      return { contenido: { title: 'Nuestra carta' }, visible: true };
    case 'reservation':
      if (variante === VARIANTE_RESERVA_PLANO) {
        // Plano de mesas (lámina 15). El modo de confirmación queda sin elegir: lo resuelve la
        // sede (E1, `resolverModoReserva`): directo al ERP si tiene reservas activas.
        return {
          contenido: {
            eyebrow: 'Reservas',
            title: 'Elige tu mesa',
            subtitle: 'Escoge la fecha, toca en el plano la mesa que prefieras y déjanos tus datos.',
            cta_text: 'Solicitar reserva',
            anchor_id: 'reservar',
          },
          visible: true,
        };
      }
      return {
        contenido: conValor({
          eyebrow: 'Reservas',
          title: 'Reserva tu mesa',
          subtitle: 'Elige el día, la hora y cuántas personas vienen.',
          cta_text: reservas && variante === 'band' ? 'Reservar mesa' : null,
          cta_url: variante === 'band' ? reservas : null,
          image_url: variante === 'form_image' ? (fotos[0]?.url ?? c.portada) : null,
        }),
        visible: true,
      };
    case 'hours_location':
      return {
        contenido: conValor({
          eyebrow: 'Visítanos',
          title: 'Horario y ubicación',
          show_map: true,
          show_directions: true,
          show_call: Boolean(limpio(datos.telefono)),
          show_reserve: Boolean(reservas),
          reserve_url: reservas,
          show_order: Boolean(pedir),
          order_url: pedir,
        }),
        visible: true,
      };
    case 'map':
      return { contenido: conValor({ title: 'Encuéntranos', subtitle: limpio(datos.direccion) ? null : 'Visítanos en nuestra sede', address: limpio(datos.direccion) }), visible: true };
    case 'gallery':
    case 'gallery_bento': {
      // Collage (Radiante) e Instagram (Contraste): fotos como texto (contrato `seccionesTienda.ts`).
      if (tipo === 'gallery' && variante === 'collage') {
        const imagenes = fotos.slice(0, 3).map((f) => f.url);
        return { contenido: conValor({ images: imagenes.length > 0 ? imagenes : null }), visible: imagenes.length >= 3 };
      }
      if (tipo === 'gallery' && variante === 'instagram_cta') {
        const imagenes = fotos.slice(0, 5).map((f) => f.url);
        return { contenido: conValor({ images: imagenes.length > 0 ? imagenes : null, cta_title: 'Síguenos' }), visible: imagenes.length > 0 };
      }
      const imagenes = fotos.slice(0, 8);
      return { contenido: conValor({ title: 'Galería', images: imagenes.length > 0 ? imagenes : null }), visible: imagenes.length >= (tipo === 'gallery_bento' ? 4 : 1) };
    }
    case 'marquee':
      if (variante === 'photos') {
        const imagenes = fotos.slice(0, 8);
        return { contenido: conValor({ images: imagenes.length > 0 ? imagenes : null }), visible: imagenes.length >= 3 };
      }
      return { contenido: { phrases: datos.categorias.map((x) => x.nombre).join('\n'), separator: '·' }, visible: datos.categorias.length >= 2 };
    case 'delivery_cta':
      return {
        contenido: conValor({ title: '¿Prefieres en casa?', subtitle: 'Haz tu pedido en línea para recoger o a domicilio.', cta_text: pedir ? 'Pedir ahora' : null, cta_url: pedir, image_url: fotos[1]?.url }),
        visible: Boolean(pedir),
      };
    case 'promo_banners': {
      const banners = datos.categorias.slice(0, 3).map((cat) => {
        const foto = datos.productos.find((p) => p.categoriaId === cat.id && p.imagenUrl);
        return conValor({ title: cat.nombre, image_url: foto?.imagenUrl, link_type: 'category', link_category_id: cat.id, button_text: 'Ver más' });
      });
      return { contenido: { title: 'Lo que tenemos para ti', banners }, visible: banners.length > 0 };
    }
    case 'image_text':
      // Bloque de color (Marea): uno por categoría real, lo arma `bloquesDeColor`. Sin categoría, vacío y oculto.
      if (variante === 'color_block') return { contenido: {}, visible: false };
      if (variante === 'editorial') {
        return {
          contenido: conValor({
            title: 'Nuestra historia',
            body: limpio(datos.descripcion) ?? `${nombre ?? 'Nuestro equipo'} te recibe con gusto. Conoce quiénes somos y lo que hacemos cada día.`,
            image_url: fotos[0]?.url ?? c.portada,
            image_small_url: fotos[1]?.url,
          }),
          visible: true,
        };
      }
      return {
        contenido: conValor({
          // En «Historia» la cuentan los capítulos: aquí va lo que mueve al negocio.
          title: c.pagina.slug === 'historia' ? 'Lo que nos mueve' : 'Nuestra historia',
          body: limpio(datos.descripcion) ?? `${nombre ?? 'Nuestro equipo'} te recibe con gusto. Conoce quiénes somos y lo que hacemos cada día.`,
          image_url: fotos[0]?.url ?? c.portada,
          cta_text: c.ruta('nosotros') ? 'Conócenos' : null,
          cta_url: c.ruta('nosotros'),
        }),
        visible: true,
      };
    case 'text_block':
      // Texto con íconos (Contraste): los nombres de las categorías reales con un ícono entre ellos.
      if (variante === 'inline_icons') {
        const nombres = datos.categorias.slice(0, 6).map((x) => x.nombre);
        const segments = nombres.flatMap((n, i) => (i === 0 ? [{ text: n }] : [{ icon: 'Sparkles' }, { text: n }]));
        return { contenido: { segments }, visible: nombres.length >= 2 };
      }
      return {
        contenido: c.esInicio
          ? { title: nombre ?? textos.bienvenida, body: limpio(datos.descripcion) ?? textos.subtituloInicio }
          : { title: 'Quiénes somos', body: limpio(datos.descripcion) ?? `${nombre ?? 'Nuestro equipo'} te recibe con gusto. Conoce quiénes somos y lo que hacemos cada día.` },
        visible: true,
      };
    case 'faq':
      return { contenido: { title: 'Preguntas frecuentes', items: textos.preguntas.map((p) => ({ ...p })) }, visible: true };
    case 'how_it_works':
      // Capítulos (lámina 13): tres de ejemplo que no inventan hechos; el dueño cuenta su historia.
      if (variante === VARIANTE_HISTORIA_CAPITULOS) {
        return { contenido: { eyebrow: 'Nuestra historia', title: 'Nuestra historia', items: CAPITULOS_EJEMPLO.map((x) => ({ ...x })), show_numbers: true }, visible: true };
      }
      return { contenido: { title: 'Así funciona', items: textos.pasos.map((p, i) => ({ step: i + 1, ...p })) }, visible: true };
    case 'features_grid':
    case 'why_choose_us':
    case 'gym_features':
    case 'parking_features':
      // Columnas con foto (Roble): las ventajas del giro con una foto de producto cada una.
      if (tipo === 'features_grid' && variante === 'photo_columns') {
        return {
          contenido: { items: textos.ventajas.map((v, i) => conValor({ image_url: fotos[i]?.url, title: v.title, text: v.description })) },
          visible: true,
        };
      }
      return {
        contenido: {
          title: '¿Por qué elegirnos?',
          items: textos.ventajas.map((v) => (tipo === 'features_grid' ? { title: v.title, description: v.description } : { ...v })),
        },
        visible: true,
      };
    case 'services_list':
      return { contenido: { title: 'Nuestros servicios' }, visible: true };
    case 'newsletter':
      return { contenido: { title: 'Recibe nuestras novedades', subtitle: 'Te escribimos solo cuando hay algo que contar.', button_text: 'Suscribirme', placeholder: 'Tu correo' }, visible: true };
    case 'cta':
    case 'demo_cta':
      return {
        contenido: conValor({
          title: textos.ctaFinal.titulo,
          subtitle: textos.ctaFinal.subtitulo,
          cta_text: cta ? cta.texto : contacto ? 'Contáctanos' : null,
          ...(tipo === 'cta' ? { cta_url: rutaCta ?? contacto, image_url: variante === 'with_image' ? (fotos[0]?.url ?? c.portada) : null } : {}),
        }),
        visible: true,
      };
    case 'booking_cta':
      return { contenido: conValor({ title: textos.ctaFinal.titulo, cta_text: cta?.texto ?? 'Reservar' }), visible: true };
    case 'contact_form':
      return { contenido: { title: 'Escríbenos', subtitle: 'Te respondemos lo antes posible.' }, visible: true };
    case 'trip_search':
      return { contenido: { title: 'Busca tu viaje', cta_text: 'Buscar' }, visible: true };
    case 'categories_grid':
      return { contenido: { title: 'Categorías' }, visible: true };
    case 'featured_products':
      return { contenido: { title: c.giro === 'restaurante' ? 'Lo más pedido' : 'Destacados' }, visible: true };
    case 'products_grid':
      return { contenido: c.esInicio ? { title: 'Nuestros productos' } : {}, visible: true };
    case 'offers':
      return { contenido: { title: 'Ofertas' }, visible: true };
    case 'room_types':
      return { contenido: { title: 'Nuestras habitaciones' }, visible: true };
    case 'membership_plans':
      return { contenido: { title: 'Membresías' }, visible: true };
    case 'parking_zones':
      return { contenido: { title: 'Zonas' }, visible: true };
    case 'parking_pricing':
      return { contenido: { title: 'Tarifas' }, visible: true };
    case 'parking_pass_plans':
      return { contenido: { title: 'Planes mensuales' }, visible: true };
    case 'parking_availability':
      return { contenido: { title: 'Disponibilidad' }, visible: true };
    // ─── Plantillas de tienda nuevas (contrato `seccionesTienda.ts`) ───────────────────────────
    case 'link_cloud':
      // Enlaces a las categorías reales: con menos de 3 no es una nube y el sitio no la pinta.
      return { contenido: { title: 'Explora por categoría', source: 'categories', max: 12 }, visible: datos.categorias.length >= 3 };
    case 'service_cards': {
      const ayuda = [
        contacto && { label: 'Contacto', url: contacto },
        c.ruta('preguntas-frecuentes') && { label: 'Preguntas frecuentes', url: c.ruta('preguntas-frecuentes') },
        { label: 'Consultar mi pedido', url: '/consultar-pedido' },
      ].filter(Boolean) as { label: string; url: string }[];
      return {
        contenido: conValor({
          image_url: fotos[0]?.url ?? c.portada,
          cards: [
            { title: 'Te ayudamos', links: ayuda, benefits: [] },
            { title: 'Compra en línea', links: [], benefits: textos.ventajas.map((v) => v.title) },
          ],
        }),
        visible: true,
      };
    }
    case 'product_index':
      // Sin `product_ids` el sitio pinta los primeros productos con foto.
      return { contenido: {}, visible: fotos.length > 0 };
    case 'product_faq':
      return { contenido: { title: 'Preguntas frecuentes', items: textos.preguntas.map((p) => ({ ...p })) }, visible: true };
    default:
      return { contenido: {}, visible: true };
  }
}

// ─── Armado del documento ──────────────────────────────────────────────────────────────────────

export interface SeccionOculta {
  pagina: string;
  tipo: string;
}

export interface ResumenPlantillaCompleta {
  paginas: number;
  secciones: number;
  /** Secciones creadas ocultas porque esperan datos del dueño (personas, opiniones, cifras…). */
  ocultas: SeccionOculta[];
  /** Páginas del borrador anterior que se conservaron (sistema y legales). */
  conservadas: number;
}

export interface ResultadoPlantillaCompleta {
  documento: DocumentoSitio;
  resumen: ResumenPlantillaCompleta;
}

export interface OpcionesPlantillaCompleta {
  /** Escribe los tokens extendidos del tema (`tokensExtendidosDisponibles()`). */
  extendidos: boolean;
  generarId: GenerarId;
  /**
   * Aplica el estilo de la plantilla (por defecto `true`). Una SEDE lo deja en `false`: su tema
   * sigue heredando del principal campo a campo (ADR-002 D6); solo toma estructura, encabezado y pie.
   */
  conEstilo?: boolean;
  /**
   * Escribe la tarjeta de producto de la plantilla (`tema.tarjetaProducto`) si la trae. Solo con
   * `tarjetaProductoTemaDisponible()`: el sitio rechaza la clave hasta aceptarla. Por defecto no.
   */
  tarjeta?: boolean;
  /** Escribe las perillas de la plantilla (`tema.tokens`). Solo con `tokensDisenoDisponibles()`. */
  tokensDiseno?: boolean;
  /** Escribe `tema.paginacion` y `tema.carrusel` de la plantilla. Solo con `paginacionTemaDisponible()`. */
  paginacion?: boolean;
}

/** La plantilla que se sugiere primero en el giro (la de «por defecto»). */
export function plantillaPorDefectoDelGiro(catalogo: CatalogoPlantillas, giro: GiroCatalogo): PlantillaCatalogo | null {
  return plantillasDelGiro(catalogo, giro)[0] ?? null;
}

/** Fotos de producto para portada, galería y tarjetas (sin repetir). */
function fotosDe(datos: DatosNegocio): { url: string; alt: string }[] {
  const vistas = new Set<string>();
  const fotos: { url: string; alt: string }[] = [];
  for (const p of datos.productos) {
    if (!p.imagenUrl || vistas.has(p.imagenUrl)) continue;
    vistas.add(p.imagenUrl);
    fotos.push({ url: p.imagenUrl, alt: p.nombre });
  }
  return fotos;
}

/** Destino `'@pagina:<slug>'` del contenido propio de una plantilla (`SeccionPlantilla[2]`). */
const RUTA_DE_PAGINA = /^@pagina:([a-z0-9/-]+)$/;

/**
 * Resuelve los `'@pagina:<slug>'` contra las páginas reales. Sin la página: la clave se quita
 * (con su `*_text` si es un `*_url`) y un ítem de una lista (un botón) se quita entero. Nunca un
 * enlace roto. Devuelve una copia: el catálogo no se comparte con el documento.
 */
function resolverPaginas(valor: unknown, ruta: (slug: string) => string | null): { valor: unknown; roto: boolean } {
  if (typeof valor === 'string') {
    const m = RUTA_DE_PAGINA.exec(valor);
    if (!m) return { valor, roto: false };
    const r = ruta(m[1]);
    return r ? { valor: r, roto: false } : { valor: undefined, roto: true };
  }
  if (Array.isArray(valor)) {
    const lista = valor.map((v) => resolverPaginas(v, ruta)).filter((r) => !r.roto).map((r) => r.valor);
    return { valor: lista, roto: false };
  }
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    let roto = false;
    for (const [clave, v] of Object.entries(valor)) {
      const r = resolverPaginas(v, ruta);
      if (r.roto) {
        roto = true;
        continue;
      }
      salida[clave] = r.valor;
    }
    return { valor: salida, roto };
  }
  return { valor, roto: false };
}

/**
 * Contenido propio de la plantilla SOBRE el inicial (plantillas de tienda nuevas). Las reglas de
 * «oculta sin datos» se vuelven a mirar con el contenido final: banners sin banners, bloque de
 * color sin título ni foto. Una portada con destino propio muestra su botón.
 */
function conContenidoPropio(
  tipo: string,
  variante: string,
  inicial: SeccionArmada,
  propio: Readonly<Record<string, unknown>>,
  ruta: (slug: string) => string | null,
): SeccionArmada {
  const resueltas: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(propio)) {
    const r = resolverPaginas(v, ruta);
    if (!r.roto) resueltas[clave] = r.valor;
  }
  // Sin la página: ni el destino ni su texto (no queda un botón que no lleva a ningún lado).
  for (const clave of Object.keys(propio)) {
    if (clave.endsWith('_url') && !(clave in resueltas)) delete resueltas[clave.replace(/_url$/, '_text')];
  }
  const contenido: Record<string, unknown> = { ...inicial.contenido, ...resueltas };
  let visible = inicial.visible;
  if (tipo === 'promo_banners') visible = Array.isArray(contenido.banners) && contenido.banners.length > 0;
  if (tipo === 'image_text' && variante === 'color_block') visible = Boolean(contenido.title || contenido.image_url);
  if (tipo === 'hero' && (typeof contenido.cta_url === 'string' || (Array.isArray(contenido.buttons) && contenido.buttons.length > 0))) {
    contenido.show_cta = true;
  }
  return { contenido, visible };
}

function armarSeccion(
  [tipo, variante, propio]: SeccionPlantilla,
  contexto: ContextoSeccion,
  generarId: GenerarId,
  ocultas: SeccionOculta[],
): SeccionSitio {
  const inicial = contenidoInicial(tipo, variante, contexto);
  const { contenido, visible } = propio ? conContenidoPropio(tipo, variante, inicial, propio, contexto.ruta) : inicial;
  if (!visible) ocultas.push({ pagina: contexto.pagina.titulo, tipo });
  return {
    id: generarId(),
    tipo,
    variante,
    version: 1,
    contenido,
    diseno: {},
    visibilidad: visible ? { movil: true, escritorio: true } : { movil: false, escritorio: false },
  };
}

/**
 * Pedido del dueño: Inicio arranca con una portada CON FOTO cuando la hay (el banner del sitio
 * anterior, la portada de la sede o la foto de un producto). La portada tipográfica no pinta
 * imagen: con foto disponible se usa la variante con imagen de la misma sección; sin foto, la
 * tipográfica de la plantilla.
 */
function conFotoDePortada(seccion: SeccionPlantilla, portada: string | null): SeccionPlantilla {
  const [tipo, variante, propio] = seccion;
  if (!(tipo === 'restaurant_hero' && variante === 'typographic' && portada)) return seccion;
  return propio ? [tipo, 'split_bento', propio] : [tipo, 'split_bento'];
}

const esHex = (v: string | null | undefined): v is string => typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());

/**
 * `image_text · color_block` (Marea, decisión 3): el sitio pinta UN bloque por sección
 * (`ImageTextColor` lee un solo bloque de su `contenido`), así que «Plantilla completa» arma una
 * sección por categoría real, hasta `MAX_BLOQUES_COLOR`, con su número, su nombre, su color
 * (`categories.color`, si es un hex), su foto (la de la categoría o la de un producto suyo) y el
 * enlace a su página. A todo el ancho y sin relleno, como lo pide el sitio (W5). Sin categorías,
 * la sección de la plantilla tal cual (vacía y oculta) para que el dueño la complete.
 */
export function bloquesDeColor(seccion: SeccionPlantilla, datos: DatosNegocio): SeccionPlantilla[] {
  const [tipo, variante, propio] = seccion;
  const categorias = datos.categorias.slice(0, MAX_BLOQUES_COLOR);
  if (categorias.length === 0) return [seccion];
  return categorias.map((cat, i) => {
    const foto = limpio(cat.imagenUrl) ?? datos.productos.find((p) => p.categoriaId === cat.id && p.imagenUrl)?.imagenUrl ?? null;
    const slug = limpio(cat.slug);
    const contenido = conValor({
      number: String(i + 1).padStart(2, '0'),
      title: cat.nombre,
      image_url: foto,
      bg_color: esHex(cat.color) ? cat.color.trim().toUpperCase() : null,
      cta_url: slug ? `/categorias/${encodeURIComponent(slug)}` : null,
      full_bleed: true,
      padding_top: 'none',
      padding_bottom: 'none',
      padding_x: 'none',
    });
    return [tipo, variante, { ...contenido, ...(propio ?? {}) }] as const;
  });
}

/** Inicio de la plantilla: portada con foto si la hay y los bloques de color repetidos. */
function estructuraInicio(plantilla: PlantillaCatalogo, portada: string | null, datos: DatosNegocio): SeccionPlantilla[] {
  return plantilla.inicio.flatMap((s) =>
    s[0] === 'image_text' && s[1] === 'color_block' ? bloquesDeColor(s, datos) : [conFotoDePortada(s, portada)],
  );
}

// ─── Páginas de detalle de la plantilla (D4) ──────────────────────────────────────────────────

const TIPOS_DETALLE = ['product_detail', 'category_detail'] as const;
type TipoDetalle = (typeof TIPOS_DETALLE)[number];
const TITULO_DETALLE: Record<TipoDetalle, string> = { product_detail: 'Ficha de producto', category_detail: 'Página de categoría' };

/**
 * La página de detalle del borrador que la plantilla reemplaza: la de la dirección canónica
 * (`plantillas/product-detail`, como la elige el sitio) o, si no, la primera de ese tipo.
 */
function detalleDelBorrador(base: DocumentoSitio, tipo: TipoDetalle): PaginaSitio | null {
  const candidatas = base.paginas.filter((p) => p.tipo === tipo);
  const canonica = normalizarSlug(`__${tipo}`);
  return candidatas.find((p) => p.slug === canonica) ?? candidatas[0] ?? null;
}

function itemPagina(pagina: PaginaSitio, generarId: GenerarId): ItemMenu {
  return { id: generarId(), etiqueta: pagina.titulo || 'Página', tipo: 'page', paginaId: pagina.id };
}

// ─── Páginas y menús que pide el encabezado y el pie de la plantilla ──────────────────────────

const sec = (tipo: string, variante: string, contenido: Record<string, unknown> = {}) => ({ tipo, variante, contenido });

/**
 * Páginas que un menú o un botón de la plantilla necesita y el juego base del giro no trae.
 * Contenido sin hechos inventados: las secciones que esperan datos quedan ocultas (regla general)
 * y la política nace con el texto vacío, como las demás legales.
 */
const PAGINAS_DEL_SHELL: Readonly<Record<string, PaginaBase>> = {
  'preguntas-frecuentes': {
    titulo: 'Preguntas frecuentes',
    slug: 'preguntas-frecuentes',
    tipo: 'builtin',
    enMenu: false,
    secciones: [sec('hero', 'minimal'), sec('faq', 'accordion')],
  },
  eventos: {
    titulo: 'Eventos',
    slug: 'eventos',
    tipo: 'builtin',
    enMenu: false,
    secciones: [sec('hero', 'minimal'), sec('events', 'list'), sec('private_events', 'default'), sec('contact_form', 'split')],
  },
  alergenos: {
    titulo: 'Alérgenos',
    slug: 'alergenos',
    tipo: 'builtin',
    enMenu: false,
    secciones: [
      sec('hero', 'minimal'),
      sec('text_block', 'left', {
        title: 'Alérgenos e ingredientes',
        body: 'Si tienes una alergia o una restricción, cuéntale a nuestro equipo antes de pedir: te decimos qué lleva cada plato.',
      }),
    ],
  },
  'politica-estadia': {
    titulo: 'Políticas de la estadía',
    slug: 'politica-estadia',
    tipo: 'legal',
    enMenu: false,
    secciones: [sec('text_block', 'left', { title: 'Políticas de la estadía', content: '' })],
  },
};

/**
 * Páginas que el giro suma al juego base aunque no estén en el menú. Restaurante: «Carta QR», la
 * página que abre el QR de la mesa (Figma 2032:75742), con sus secciones de la lámina 17 (la
 * plantilla de página `carta_qr`, que las toma del contrato `seccionesMesa.ts`).
 */
export function paginasExtraDelGiro(giro: Giro, yaEnElJuego: readonly PaginaBase[]): PaginaBase[] {
  if (giro !== 'restaurante') return [];
  const plantilla = plantillaPorId('carta_qr');
  if (!plantilla || yaEnElJuego.some((b) => b.slug === plantilla.slug)) return [];
  return [{ titulo: 'Carta QR', slug: plantilla.slug, tipo: plantilla.tipo, enMenu: false, secciones: plantilla.secciones }];
}

/**
 * Páginas propias de una plantilla sobre el juego del giro: `reemplaza` cambia la página de esa
 * dirección por la propia (en su lugar del menú); `quita`, las que la plantilla no trae.
 */
interface PaginasDePlantilla {
  reemplazos: readonly { reemplaza: string; pagina: PaginaBase }[];
  quita: readonly string[];
}

/**
 * «Café de especialidad» (Figma 2223:46106, lámina 11): Inicio, Carta (/carta), Reservas
 * (/reservas-mesa) e Historia (/historia). Las legales y la Carta QR del giro siguen.
 */
export const PAGINAS_POR_PLANTILLA: Readonly<Record<string, PaginasDePlantilla>> = {
  cafe_especialidad: {
    reemplazos: [
      { reemplaza: 'menu', pagina: { titulo: 'Carta', slug: 'carta', tipo: 'builtin', enMenu: true, secciones: [sec('menu_full', VARIANTE_CARTA_PUNTOS)] } },
      {
        reemplaza: 'reservas-mesa',
        pagina: { titulo: 'Reservas', slug: 'reservas-mesa', tipo: 'builtin', enMenu: true, secciones: [sec('reservation', VARIANTE_RESERVA_PLANO), sec('hours_location', 'list')] },
      },
      {
        reemplaza: 'nosotros',
        pagina: {
          titulo: 'Historia',
          slug: 'historia',
          tipo: 'builtin',
          enMenu: true,
          secciones: [sec('how_it_works', VARIANTE_HISTORIA_CAPITULOS), sec('image_text', 'image_left'), sec('reservation', 'band')],
        },
      },
    ],
    quita: ['domicilios', 'contacto', 'galeria'],
  },
};

/**
 * Páginas que trae la plantilla por sí misma (Inicio más las suyas), para la tarjeta de la galería
 * («5 secciones · 4 páginas», lámina 10). null si la plantilla solo trae Inicio: la tarjeta no
 * dice nada de páginas (las demás salen del giro, igual en todas sus plantillas).
 */
export function paginasPropiasDePlantilla(plantillaId: string): number | null {
  const propias = PAGINAS_POR_PLANTILLA[plantillaId];
  return propias && propias.reemplazos.length > 0 ? 1 + propias.reemplazos.length : null;
}

/** El juego del giro con las páginas propias de la plantilla (si las tiene). */
export function paginasDePlantilla(plantillaId: string, delGiro: readonly PaginaBase[]): PaginaBase[] {
  const propias = PAGINAS_POR_PLANTILLA[plantillaId];
  if (!propias) return [...delGiro];
  return delGiro
    .filter((b) => !propias.quita.includes(b.slug))
    .map((b) => propias.reemplazos.find((r) => r.reemplaza === b.slug)?.pagina ?? b);
}

/** Páginas extra (por dirección) que piden los menús del pie y los botones de la lámina. */
export function paginasQuePideElShell(shell: ShellPlantilla): string[] {
  const porMenu: Partial<Record<ClaveMenuPie, readonly string[]>> = {
    ayuda: ['preguntas-frecuentes'],
    atencion: ['preguntas-frecuentes'],
    eventos: ['eventos'],
    alergenos: ['alergenos'],
    politicas: ['politica-estadia'],
  };
  const pedidas = new Set<string>();
  for (const m of shell.pie.menus) for (const slug of porMenu[m] ?? []) pedidas.add(slug);
  for (const b of [shell.encabezado.boton, shell.encabezado.boton2]) {
    if (b && 'paginas' in b.destino) {
      const primera = b.destino.paginas.find((slug) => slug in PAGINAS_DEL_SHELL);
      if (primera) pedidas.add(primera);
    }
  }
  return [...pedidas];
}

/** URL de un destino, o `null` si no existe en el documento (entonces el botón no se pone). */
export function resolverDestino(destino: DestinoBoton, ruta: (slug: string) => string | null): string | null {
  if ('especial' in destino) return destino.especial;
  if ('ruta' in destino) return destino.ruta;
  for (const slug of destino.paginas) {
    const r = ruta(slug);
    if (r) return r;
  }
  return null;
}

function botonResuelto(b: BotonPlantilla | null, ruta: (slug: string) => string | null): { texto: string; url: string } | null {
  if (!b) return null;
  const url = resolverDestino(b.destino, ruta);
  return url ? { texto: b.texto, url } : null;
}

/**
 * Opciones del encabezado de la lámina con los botones resueltos (claves de `OPCIONES_SHELL`).
 * La barra superior no muestra el correo salvo que la lámina lo pida (como antes).
 */
export function opcionesEncabezadoPlantilla(shell: ShellPlantilla, ruta: (slug: string) => string | null): Record<string, unknown> {
  const boton = botonResuelto(shell.encabezado.boton, ruta);
  const boton2 = botonResuelto(shell.encabezado.boton2, ruta);
  return {
    topbar_show_email: false,
    ...shell.encabezado.opciones,
    ...(boton ? { header_cta_text: boton.texto, header_cta_url: boton.url } : {}),
    ...(boton2 ? { header_cta2_text: boton2.texto, header_cta2_url: boton2.url } : {}),
  };
}

/**
 * Opciones del pie de la lámina. «Hecho con…»: sale solo en las láminas que lo traen
 * (`show_powered_by: true` en su shell); en las demás nace apagado. Si la organización ya lo había
 * cambiado, su decisión se conserva. El default del contrato (true, lo de hoy) no cambia: los
 * sitios que no aplican una plantilla siguen igual.
 */
export function opcionesPiePlantilla(shell: ShellPlantilla, anteriores: Record<string, unknown>): Record<string, unknown> {
  return {
    footer_show_contact: true,
    footer_show_social: true,
    footer_columns: 3,
    show_powered_by: false,
    ...shell.pie.opciones,
    ...('show_powered_by' in anteriores ? { show_powered_by: anteriores.show_powered_by } : {}),
  };
}

type Item = ItemMenu;

interface ContextoMenus {
  paginas: readonly PaginaSitio[];
  generarId: GenerarId;
  giro: Giro;
  menusPedidos: readonly ClaveMenuPie[];
}

/** Ítems de un menú del pie: páginas reales (por dirección) y rutas del sitio público. */
function itemsMenuPie(clave: ClaveMenuPie, c: ContextoMenus): { nombre: string; items: Item[] } {
  const porSlug = (...slugs: string[]): Item[] =>
    slugs.flatMap((slug) => {
      const p = c.paginas.find((x) => x.slug === slug);
      return p ? [itemPagina(p, c.generarId)] : [];
    });
  const enlace = (etiqueta: string, url: string): Item => ({ id: c.generarId(), etiqueta, tipo: 'custom', url });
  const legales = (excluir: readonly string[] = []) =>
    c.paginas.filter((p) => esPaginaLegal(p) && !esPlantillaTienda(p) && !excluir.includes(p.slug)).map((p) => itemPagina(p, c.generarId));
  switch (clave) {
    case 'legal': {
      // Con «Políticas» en el mismo pie, la de la estadía va allá y no se repite.
      // «Tratamiento de datos» apunta a su propia página (Ley 1581 de 2012).
      const orden: ClaveLegal[] = ['terminos', 'privacidad', 'envios', 'devoluciones', 'cookies'];
      const usados = new Set<string>();
      const items: Item[] = [];
      for (const clave of orden) {
        const pagina = paginaPorClave(c.paginas, clave);
        if (!pagina || usados.has(pagina.id)) continue;
        usados.add(pagina.id);
        items.push(itemPagina(pagina, c.generarId));
      }
      for (const pagina of c.paginas) {
        if (!esPaginaLegal(pagina) || esPlantillaTienda(pagina) || usados.has(pagina.id)) continue;
        if (c.menusPedidos.includes('politicas') && pagina.slug === 'politica-estadia') continue;
        if (paginaPorClave([pagina], 'tratamiento')) continue;
        usados.add(pagina.id);
        items.push(itemPagina(pagina, c.generarId));
      }
      const tratamiento = paginaPorClave(c.paginas, 'tratamiento');
      if (tratamiento) items.push({ ...itemPagina(tratamiento, c.generarId), etiqueta: 'Tratamiento de datos' });
      return { nombre: 'Legales', items };
    }
    case 'politicas':
      return {
        nombre: 'Políticas',
        items: c.menusPedidos.includes('legal') ? [...porSlug('politica-estadia'), enlace('Reservar', '/reservas'), ...porSlug('contacto')] : legales(),
      };
    case 'la-casa':
      return { nombre: 'La casa', items: porSlug('nosotros', 'historia', 'galeria', 'contacto') };
    case 'eventos':
      return { nombre: 'Eventos', items: porSlug('eventos', 'reservas-mesa', 'contacto') };
    case 'ayuda':
      return {
        nombre: 'Ayuda',
        items: [
          ...porSlug('preguntas-frecuentes', 'contacto'),
          // En tienda, «Consultar mi pedido»; si el pie trae «Envíos», ya va allá.
          ...(c.giro === 'tienda' && !c.menusPedidos.some((m) => m === 'envios' || m === 'envios-devoluciones')
            ? [enlace('Consultar mi pedido', '/consultar-pedido')]
            : []),
        ],
      };
    case 'envios-devoluciones':
    case 'envios':
      return {
        nombre: clave === 'envios' ? 'Envíos' : 'Envíos y devoluciones',
        items: [
          enlace('Rastrear mi envío', '/tracking'),
          enlace('Consultar mi pedido', '/consultar-pedido'),
          // Los términos ya van en «Legales» cuando el pie lo trae.
          ...(c.menusPedidos.includes('legal') ? [] : porSlug('terminos')),
        ],
      };
    case 'atencion':
      return { nombre: 'Atención al cliente', items: [...porSlug('contacto', 'preguntas-frecuentes'), enlace('Mi cuenta', '/mi-cuenta')] };
    case 'alergenos':
      return { nombre: 'Alérgenos', items: porSlug('alergenos', 'menu') };
    case 'servicios':
      return { nombre: 'Servicios', items: [...porSlug('servicios', 'precios'), enlace('Agendar cita', '/agendar')] };
    case 'empresa':
      return { nombre: 'Empresa', items: porSlug('nosotros', 'contacto') };
    case 'planes':
      return { nombre: 'Planes', items: porSlug('membresias', 'clases', 'entrenadores') };
    case 'el-club':
      return { nombre: 'El club', items: porSlug('nosotros', 'entrenadores', 'clases', 'contacto') };
    case 'tarifas':
      return { nombre: 'Tarifas', items: porSlug('tarifas', 'zonas', 'servicios') };
  }
}

/** Megamenú «Categorías»: las del Inventario; sin categorías, las páginas de catálogo. */
function menuCategorias(datos: DatosNegocio, paginas: readonly PaginaSitio[], generarId: GenerarId): MenuSitio {
  const items: Item[] =
    datos.categorias.length > 0
      ? datos.categorias.slice(0, 12).map((cat) => ({ id: generarId(), etiqueta: cat.nombre, tipo: 'entity', entidad: 'category', entidadId: String(cat.id) }))
      : paginas.filter((p) => ['productos', 'categorias', 'ofertas'].includes(p.slug)).map((p) => itemPagina(p, generarId));
  return { id: generarId(), nombre: 'Categorías', items };
}

/**
 * Arma el sitio completo de `plantilla` sobre `base` (el borrador actual o la base del principal
 * para una sede). Puro e inmutable. El resultado cumple el contrato (`validarDocumentoSitio`).
 */
export function armarPlantillaCompleta(
  base: DocumentoSitio,
  plantilla: PlantillaCatalogo,
  datos: DatosNegocio,
  opciones: OpcionesPlantillaCompleta,
): ResultadoPlantillaCompleta {
  const { generarId } = opciones;
  const giro = plantilla.giro as Giro;
  const conEstilo = opciones.conEstilo === false ? base : temaDePlantilla(aplicarEstiloPlantilla(base, plantilla, opciones.extendidos), plantilla, opciones);
  const shell = shellDePlantilla(plantilla.id, giro);

  // 1. Lo que se conserva: páginas de sistema (carrito, checkout…) y legales. Con `detalle` (D4),
  //    la ficha y la página de categoría del borrador se REEMPLAZAN (conservan id, dirección y si
  //    estaban publicadas).
  const detalle = plantilla.detalle ?? null;
  const reemplazadas = new Map<TipoDetalle, PaginaSitio | null>(
    detalle ? TIPOS_DETALLE.map((tipo) => [tipo, detalleDelBorrador(base, tipo)] as const) : [],
  );
  const idsReemplazados = new Set([...reemplazadas.values()].flatMap((p) => (p ? [p.id] : [])));
  const conservadas = base.paginas.filter((p) => (esPlantillaTienda(p) || esPaginaLegal(p)) && !idsReemplazados.has(p.id));
  const slugsConservados = new Set(conservadas.map((p) => p.slug));
  const delGiro = paginasDePlantilla(plantilla.id, paginasBasePorGiro(giro, { envios: giro === 'tienda' || giro === 'restaurante' || datos.envios === true }));
  const extras = paginasQuePideElShell(shell)
    .filter((slug) => !delGiro.some((b) => b.slug === slug))
    .map((slug) => PAGINAS_DEL_SHELL[slug]);
  const juego: PaginaBase[] = [...delGiro, ...extras, ...paginasExtraDelGiro(giro, [...delGiro, ...extras])].filter(
    (b) => !slugsConservados.has(b.slug),
  );
  const slugs = new Set([...slugsConservados, ...juego.map((b) => b.slug)]);
  const ruta = (slug: string): string | null => (slugs.has(slug) ? (slug === 'home' ? '/' : `/${slug}`) : null);
  const cta = botonResuelto(shell.encabezado.boton, ruta);

  // 2. Páginas del juego con su contenido inicial; Inicio con la estructura de la plantilla.
  const fotos = fotosDe(datos);
  const portada = bannerDelSitio(base) ?? limpio(datos.portadaUrl) ?? fotos[0]?.url ?? null;
  const textos = TEXTOS_GIRO[giro];
  const ocultas: SeccionOculta[] = [];
  let secciones = 0;
  const nuevas = juego.map((b) => {
    // Las legales nuevas nacen con el texto de la plantilla (body). Las ya escritas se conservan.
    if (esPaginaLegal({ tipo: b.tipo, slug: b.slug })) return { pagina: construirPaginaBase(b, generarId), enMenu: b.enMenu };
    const pagina = { titulo: b.titulo, slug: b.slug };
    const inicio = esInicio({ tipo: b.tipo, slug: b.slug });
    const estructura: readonly SeccionPlantilla[] = inicio
      ? estructuraInicio(plantilla, portada, datos)
      : b.secciones.map((s) => [s.tipo, s.variante] as const);
    const contexto: ContextoSeccion = { giro, datos, textos, ruta, portada, fotos, esInicio: inicio, pagina, cta };
    const armadas = estructura.map((s, i) => {
      const armada = armarSeccion(s, contexto, generarId, ocultas);
      // Texto propio de la página del shell (p. ej. alérgenos), sobre el de ejemplo.
      const propio = inicio ? null : b.secciones[i]?.contenido;
      return propio && Object.keys(propio).length > 0 ? { ...armada, contenido: { ...propio } } : armada;
    });
    secciones += armadas.length;
    const construida: PaginaSitio = { id: generarId(), slug: b.slug, tipo: b.tipo, titulo: b.titulo, publicada: true, secciones: armadas };
    return { pagina: construida, enMenu: b.enMenu };
  });
  // Ficha y categoría de la plantilla (D4), en el lugar de las que reemplazan.
  const detalles = new Map<TipoDetalle, PaginaSitio>();
  if (detalle) {
    for (const tipo of TIPOS_DETALLE) {
      const anterior = reemplazadas.get(tipo) ?? null;
      const titulo = anterior?.titulo || TITULO_DETALLE[tipo];
      const slug = anterior?.slug ?? normalizarSlug(`__${tipo}`);
      const contexto: ContextoSeccion = { giro, datos, textos, ruta, portada, fotos, esInicio: false, pagina: { titulo, slug }, cta };
      const bloques = (tipo === 'product_detail' ? detalle.producto : detalle.categoria).map((s) => armarSeccion(s, contexto, generarId, ocultas));
      secciones += bloques.length;
      detalles.set(tipo, { id: anterior?.id ?? generarId(), slug, tipo, titulo, publicada: anterior?.publicada ?? true, secciones: bloques });
    }
  }
  const sistema: PaginaSitio[] = [
    ...base.paginas.flatMap((p) => {
      if (!idsReemplazados.has(p.id)) return conservadas.includes(p) ? [p] : [];
      const tipo = TIPOS_DETALLE.find((t) => reemplazadas.get(t)?.id === p.id);
      return tipo ? [detalles.get(tipo)!] : [];
    }),
    ...TIPOS_DETALLE.filter((t) => detalles.has(t) && !reemplazadas.get(t)).map((t) => detalles.get(t)!),
  ];
  // Inicio primero, como lo lista el editor; luego el juego y lo conservado.
  const paginas: PaginaSitio[] = [...nuevas.map((n) => n.pagina), ...sistema];

  // 3. Menús: encabezado (páginas «en el menú»), megamenú y los menús del pie de la plantilla.
  const menuEncabezado: MenuSitio = {
    id: generarId(),
    nombre: 'Encabezado',
    items: nuevas.filter((n) => n.enMenu).map((n) => itemPagina(n.pagina, generarId)),
  };
  const mega = shell.encabezado.megaCategorias ? menuCategorias(datos, paginas, generarId) : null;
  const contextoMenus: ContextoMenus = { paginas, generarId, giro, menusPedidos: shell.pie.menus };
  const menusPie: MenuSitio[] = shell.pie.menus
    .map((clave) => ({ id: generarId(), ...itemsMenuPie(clave, contextoMenus) }))
    .filter((m) => m.items.length > 0);
  const menuMega = mega && mega.items.length > 0 ? mega : null;

  // 4. Encabezado y pie de la plantilla.
  const documento: DocumentoSitio = {
    ...conEstilo,
    menus: [menuEncabezado, ...(menuMega ? [menuMega] : []), ...menusPie],
    paginas,
    shell: {
      header: {
        composicion: shell.encabezado.composicion,
        menuPrincipalId: menuEncabezado.id,
        menuMegaId: menuMega?.id ?? null,
        opciones: opcionesEncabezadoPlantilla(shell, ruta),
      },
      footer: {
        composicion: shell.pie.composicion,
        menuIds: menusPie.map((m) => m.id),
        opciones: opcionesPiePlantilla(shell, base.shell.footer.opciones ?? {}),
      },
    },
  };
  return {
    documento,
    resumen: { paginas: nuevas.length + detalles.size, secciones, ocultas, conservadas: conservadas.length },
  };
}

/**
 * Lo que «Plantilla completa» escribe en el tema además del estilo (plantillas de tienda nuevas),
 * cada cosa solo con su bandera ya existente: tarjeta de producto, perillas (fusionadas con las
 * que ya haya) y paginación y carrusel. Sin esos campos en la plantilla, el tema queda igual.
 */
function temaDePlantilla(documento: DocumentoSitio, plantilla: PlantillaCatalogo, opciones: OpcionesPlantillaCompleta): DocumentoSitio {
  const tema: DocumentoSitio['tema'] = { ...documento.tema };
  let cambio = false;
  if (opciones.tarjeta && plantilla.tarjetaProducto) {
    tema.tarjetaProducto = valorPropio(JSON.parse(JSON.stringify(plantilla.tarjetaProducto)) as TarjetaProductoDocumento);
    cambio = true;
  }
  if (opciones.tokensDiseno && plantilla.tokens) {
    const previos = tema.tokens ?? {};
    const tokens: NonNullable<DocumentoSitio['tema']['tokens']> = { ...previos };
    if (plantilla.tokens.hover) tokens.hover = valorPropio(plantilla.tokens.hover);
    if (typeof plantilla.tokens.boton?.mayusculas === 'boolean') tokens.boton = { ...previos.boton, mayusculas: valorPropio(plantilla.tokens.boton.mayusculas) };
    tema.tokens = tokens;
    cambio = true;
  }
  if (opciones.paginacion && plantilla.paginacion) {
    tema.paginacion = valorPropio({ ...plantilla.paginacion });
    cambio = true;
  }
  if (opciones.paginacion && plantilla.carrusel) {
    tema.carrusel = valorPropio({ ...plantilla.carrusel });
    cambio = true;
  }
  return cambio ? { ...documento, tema } : documento;
}

export interface ShellPorDefecto {
  plantillaId: string | null;
  nombre: string | null;
  header: { composicion: string; opciones: Record<string, unknown> };
  footer: { composicion: string; opciones: Record<string, unknown> };
}

/**
 * Valores de la plantilla para el editor («Valores por defecto de la plantilla» y «Restablecer
 * a la plantilla»): composición y opciones de la lámina, con los botones resueltos contra las
 * páginas que el sitio tiene HOY (`slugs`). Los menús no se tocan: son del dueño. Sin plantilla
 * conocida, la del giro.
 */
export function shellPorDefecto(
  plantillaId: string | null | undefined,
  giro: Giro,
  slugs: Iterable<string>,
  opcionesPieActuales: Record<string, unknown> = {},
): ShellPorDefecto {
  const plantilla = plantillaId ? CATALOGO_PLANTILLAS.plantillas.find((p) => p.id === plantillaId) ?? null : null;
  const shell = shellDePlantilla(plantilla?.id ?? null, (plantilla?.giro as Giro | undefined) ?? giro);
  const existentes = new Set(slugs);
  const ruta = (slug: string): string | null => (existentes.has(slug) ? (slug === 'home' ? '/' : `/${slug}`) : null);
  return {
    plantillaId: plantilla?.id ?? null,
    nombre: plantilla?.nombre ?? null,
    header: { composicion: shell.encabezado.composicion, opciones: opcionesEncabezadoPlantilla(shell, ruta) },
    footer: { composicion: shell.pie.composicion, opciones: opcionesPiePlantilla(shell, opcionesPieActuales) },
  };
}

/** {@link shellPorDefecto} de un documento V2: la plantilla sale de `tema.preset`. */
export function shellPorDefectoDelDocumento(documento: DocumentoSitio, giro: Giro): ShellPorDefecto {
  const preset = documento.tema.preset;
  const plantillaId = preset && preset.mode === 'value' && typeof preset.value === 'string' ? preset.value : null;
  return shellPorDefecto(plantillaId, giro, documento.paginas.map((p) => p.slug), documento.shell.footer.opciones ?? {});
}

/**
 * Sitio por defecto de un GIRO: la plantilla por defecto del giro, completa. Es el enganche de la
 * sede que nace con la plantilla de su tipo de negocio (`documentoPlantillaSede` de
 * `plantillaSede.ts`), que pasa `conEstilo: false`. Sin `datos`, textos de ejemplo.
 */
export function construirSitioDePlantilla(
  giro: Giro,
  base: DocumentoSitio,
  generarId: GenerarId,
  opciones: { datos?: DatosNegocio; plantilla?: PlantillaCatalogo; conEstilo?: boolean; extendidos?: boolean } = {},
): DocumentoSitio {
  const plantilla = opciones.plantilla ?? plantillaPorDefectoDelGiro(CATALOGO_PLANTILLAS, giro);
  if (!plantilla) throw new Error(`El giro ${giro} no tiene plantilla en el catálogo.`);
  return armarPlantillaCompleta(base, plantilla, opciones.datos ?? DATOS_VACIOS, {
    generarId,
    extendidos: opciones.extendidos ?? false,
    conEstilo: opciones.conEstilo,
  }).documento;
}

export type ModoPlantilla = 'completa' | 'estilo';

/**
 * Opción marcada por defecto en el diálogo. Sin revisión V2 publicada, el borrador es el que se
 * importó del sitio viejo (o uno recién creado) y nunca se publicó como propio: conviene
 * «Plantilla completa». Con una revisión publicada, el sitio ya es del dueño: «Solo estilo».
 * Cualquiera de las dos deja lo anterior en el historial o lo conserva, así que no hay pérdida.
 */
export function modoPorDefecto(sitio: { revisionPublicadaId: string | null } | null): ModoPlantilla {
  return sitio?.revisionPublicadaId ? 'estilo' : 'completa';
}
