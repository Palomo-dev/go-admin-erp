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
 */
import type { DocumentoSitio, ItemMenu, MenuSitio, PaginaSitio, SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import { construirCatalogo, plantillasDelGiro, type CatalogoPlantillas, type GiroCatalogo, type PlantillaCatalogo, type SeccionPlantilla } from '@/lib/website/contrato/catalogoPlantillas';
import { construirPaginaBase, paginasBasePorGiro, plantillaPorId, type GenerarId, type Giro, type PaginaBase } from '@/components/sitio-web/paginas/plantillasPagina';
import { VARIANTE_CARTA_QR, VARIANTE_PORTADA_MESA } from '@/lib/website/contrato/seccionesMesa';
import { esInicio, esPaginaLegal, esPlantillaTienda } from '@/components/sitio-web/paginas/tipoPagina';
import { TEMPLATE_PRESETS } from '@/lib/website/contrato/presetsPlantillas';
import { aplicarEstiloPlantilla } from './usarPlantilla';
import { COMPOSICIONES_FOOTER, COMPOSICIONES_HEADER } from './mapeoAjustes';
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
  categorias: readonly { id: number; nombre: string }[];
  /** Testimonios activos de verdad (`testimonials`). */
  testimonios: number;
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
  const carta = c.ruta('menu');
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
      if (!c.esInicio) {
        const imagen = variante === 'minimal' ? null : (fotos[0]?.url ?? c.portada);
        return { contenido: conValor({ title: c.pagina.titulo, subtitle: SUBTITULO_PAGINA[c.pagina.slug] ?? null, image_url: imagen }), visible: true };
      }
      return {
        contenido: conValor({
          title: nombre ?? textos.bienvenida,
          subtitle: lema ?? textos.subtituloInicio,
          image_url: c.portada,
          cta_text: cta?.texto ?? null,
          cta_url: rutaCta,
          show_cta: Boolean(rutaCta),
          show_title: true,
          show_overlay: Boolean(c.portada),
        }),
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
      return { contenido: { title: 'Nuestra carta' }, visible: true };
    case 'reservation':
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
      return {
        contenido: conValor({
          title: 'Nuestra historia',
          body: limpio(datos.descripcion) ?? `${nombre ?? 'Nuestro equipo'} te recibe con gusto. Conoce quiénes somos y lo que hacemos cada día.`,
          image_url: fotos[0]?.url ?? c.portada,
          cta_text: c.ruta('nosotros') ? 'Conócenos' : null,
          cta_url: c.ruta('nosotros'),
        }),
        visible: true,
      };
    case 'text_block':
      return {
        contenido: c.esInicio
          ? { title: nombre ?? textos.bienvenida, body: limpio(datos.descripcion) ?? textos.subtituloInicio }
          : { title: 'Quiénes somos', body: limpio(datos.descripcion) ?? `${nombre ?? 'Nuestro equipo'} te recibe con gusto. Conoce quiénes somos y lo que hacemos cada día.` },
        visible: true,
      };
    case 'faq':
      return { contenido: { title: 'Preguntas frecuentes', items: textos.preguntas.map((p) => ({ ...p })) }, visible: true };
    case 'how_it_works':
      return { contenido: { title: 'Así funciona', items: textos.pasos.map((p, i) => ({ step: i + 1, ...p })) }, visible: true };
    case 'features_grid':
    case 'why_choose_us':
    case 'gym_features':
    case 'parking_features':
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

function armarSeccion(
  [tipo, variante]: SeccionPlantilla,
  contexto: ContextoSeccion,
  generarId: GenerarId,
  ocultas: SeccionOculta[],
): SeccionSitio {
  const { contenido, visible } = contenidoInicial(tipo, variante, contexto);
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
function conFotoDePortada(tipo: string, variante: string, portada: string | null): SeccionPlantilla {
  return tipo === 'restaurant_hero' && variante === 'typographic' && portada ? [tipo, 'split_bento'] : [tipo, variante];
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
      // «Tratamiento de datos» (Ley 1581 de 2012, Colombia) apunta a la política de privacidad;
      // el sitio lo pinta en la barra inferior del pie, como en las láminas.
      const privacidad = c.paginas.find((p) => ['privacidad', 'politica-de-privacidad', 'politica-privacidad'].includes(p.slug));
      return {
        nombre: 'Legales',
        items: [
          ...legales(c.menusPedidos.includes('politicas') ? ['politica-estadia'] : []),
          ...(privacidad ? [{ ...itemPagina(privacidad, c.generarId), etiqueta: 'Tratamiento de datos' }] : []),
        ],
      };
    }
    case 'politicas':
      return {
        nombre: 'Políticas',
        items: c.menusPedidos.includes('legal') ? [...porSlug('politica-estadia'), enlace('Reservar', '/reservas'), ...porSlug('contacto')] : legales(),
      };
    case 'la-casa':
      return { nombre: 'La casa', items: porSlug('nosotros', 'galeria', 'contacto') };
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
  const conEstilo = opciones.conEstilo === false ? base : aplicarEstiloPlantilla(base, plantilla, opciones.extendidos);
  const shell = shellDePlantilla(plantilla.id, giro);

  // 1. Lo que se conserva: páginas de sistema (carrito, checkout…) y legales.
  const conservadas = base.paginas.filter((p) => esPlantillaTienda(p) || esPaginaLegal(p));
  const slugsConservados = new Set(conservadas.map((p) => p.slug));
  const delGiro = paginasBasePorGiro(giro);
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
    // Las legales nacen con su texto base vacío (el de «Restaurar páginas base»), sin contenido inventado.
    if (esPaginaLegal({ tipo: b.tipo, slug: b.slug })) return { pagina: construirPaginaBase(b, generarId), enMenu: b.enMenu };
    const pagina = { titulo: b.titulo, slug: b.slug };
    const inicio = esInicio({ tipo: b.tipo, slug: b.slug });
    const estructura: readonly SeccionPlantilla[] = inicio
      ? plantilla.inicio.map(([tipo, variante]) => conFotoDePortada(tipo, variante, portada))
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
  // Inicio primero, como lo lista el editor; luego el juego y lo conservado.
  const paginas: PaginaSitio[] = [...nuevas.map((n) => n.pagina), ...conservadas];

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
    resumen: { paginas: nuevas.length, secciones, ocultas, conservadas: conservadas.length },
  };
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
