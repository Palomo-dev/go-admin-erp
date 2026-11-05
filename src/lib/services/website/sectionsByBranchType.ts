import type { BranchType } from '@/types/branch';
import {
  SECTION_CATALOG,
  type SectionTypeDefinition,
} from '@/lib/services/websitePageBuilderService';
import {
  VARIANTE_CARTA_PUNTOS,
  VARIANTE_HISTORIA_CAPITULOS,
  VARIANTE_PORTADA_EDITORIAL,
  VARIANTE_RESERVA_PLANO,
} from '@/lib/website/contrato/seccionesCafe';

/**
 * Catálogo del diálogo «Añadir sección» (Figma «16 Sitio web › 05 Editor»,
 * marco 1732:878609).
 *
 * Antes este módulo FILTRABA el catálogo por el `branch_type` de la sede: un
 * restaurante no podía añadir «Habitaciones» aunque también alquilara cuartos.
 * Ahora nada queda oculto: todas las secciones sirven para cualquier negocio.
 * El tipo de la sede solo decide cuáles salen primero («Recomendadas para tu
 * negocio»), y el resto se ordena por propósito. Una sección recomendada sigue
 * apareciendo también en su grupo.
 */

export type IdGrupoSecciones =
  | 'presentar'
  | 'carta'
  | 'reservar'
  | 'vender'
  | 'hospedaje'
  | 'membresias'
  | 'transporte'
  | 'parqueadero'
  | 'confianza'
  | 'ubicacion'
  | 'ficha_producto'
  | 'pagina_categoria'
  | 'otras';

export interface DefinicionGrupo {
  id: IdGrupoSecciones;
  /** Nombre corto, el de la lista lateral («Hospedaje»). */
  etiqueta: string;
  /** Para qué sirve, en el título del grupo («habitaciones y servicios del hotel»). */
  proposito: string;
  tipos: string[];
}

/** Grupos por propósito, en el orden de la lista lateral del diálogo. */
export const GRUPOS_SECCIONES: readonly DefinicionGrupo[] = [
  {
    id: 'presentar',
    etiqueta: 'Presentar',
    proposito: 'cuenta quién eres',
    tipos: [
      'hero', 'restaurant_hero', 'image_text', 'text_block', 'gallery', 'gallery_bento', 'marquee',
      'stats', 'team', 'cta', 'countdown', 'newsletter', 'features_grid', 'how_it_works', 'services_list',
    ],
  },
  {
    id: 'carta',
    etiqueta: 'Carta',
    proposito: 'platos y especialidades',
    tipos: [
      'menu_full', 'signature_dishes', 'menu_preview', 'specialties', 'chef_section', 'chef_team',
      // Carta QR en la mesa (Figma 2032:75742).
      'table_service', 'table_order', 'table_bill', 'visit_feedback',
    ],
  },
  {
    id: 'reservar',
    etiqueta: 'Reservar',
    proposito: 'mesas, eventos, estadías y demostraciones',
    tipos: ['reservation', 'reservation_cta', 'private_events', 'events', 'booking_cta', 'demo_cta'],
  },
  {
    id: 'vender',
    etiqueta: 'Vender',
    proposito: 'productos, ofertas, categorías, marcas',
    tipos: [
      'products_grid', 'featured_products', 'categories_grid', 'offers',
      'promo_banners', 'brands', 'pricing_table', 'delivery_cta',
    ],
  },
  {
    id: 'hospedaje',
    etiqueta: 'Hospedaje',
    proposito: 'habitaciones y servicios del hotel',
    tipos: ['room_types', 'amenities', 'why_choose_us'],
  },
  {
    id: 'membresias',
    etiqueta: 'Membresías y clases',
    proposito: 'planes, horarios y entrenadores',
    tipos: ['membership_plans', 'class_schedule', 'trainers', 'gym_features', 'transformation'],
  },
  {
    id: 'transporte',
    etiqueta: 'Transporte',
    proposito: 'rutas, viajes y flota',
    tipos: ['routes', 'trip_search', 'booking_transport', 'fleet_showcase', 'coverage_map'],
  },
  {
    id: 'parqueadero',
    etiqueta: 'Parqueadero',
    proposito: 'zonas, tarifas y planes',
    tipos: ['parking_availability', 'parking_zones', 'parking_pricing', 'parking_pass_plans', 'parking_features'],
  },
  {
    id: 'confianza',
    etiqueta: 'Confianza',
    proposito: 'opiniones, aliados y preguntas',
    tipos: ['testimonials', 'partners', 'faq', 'integrations'],
  },
  {
    id: 'ubicacion',
    etiqueta: 'Ubicación',
    proposito: 'dónde estás y cómo contactarte',
    tipos: ['hours_location', 'map', 'contact_form'],
  },
  {
    id: 'ficha_producto',
    etiqueta: 'Ficha de producto',
    proposito: 'bloques de la página de cada producto',
    tipos: [
      'product_gallery', 'product_info', 'product_actions', 'product_benefits',
      'product_description', 'related_products', 'product_specs', 'product_faq',
      'product_shipping', 'product_reviews',
    ],
  },
  {
    id: 'pagina_categoria',
    etiqueta: 'Página de categoría',
    proposito: 'bloques de la página de cada categoría',
    tipos: [
      'category_header', 'category_filters', 'category_products',
      'category_subcategories', 'category_seo_text',
    ],
  },
];

/**
 * Variantes que salen como tarjeta propia en «Añadir sección», junto a su tipo (Figma «16 Sitio
 * web» 2223:46106, paso 1 de las láminas 12 a 15: «Portada · Carrusel editorial» al lado de
 * «Portada · Pantalla completa»). No son tipos nuevos: la tarjeta añade el MISMO tipo con esa
 * variante. Sus palabras de búsqueda van aquí porque la del tipo no las nombra.
 */
export interface VarianteEnCatalogo {
  tipo: string;
  variante: string;
  etiqueta: string;
  descripcion: string;
  palabras: string;
}

export const VARIANTES_EN_CATALOGO: readonly VarianteEnCatalogo[] = [
  {
    tipo: 'hero',
    variante: VARIANTE_PORTADA_EDITORIAL,
    etiqueta: 'Portada · Carrusel editorial',
    descripcion: 'Fotos que rotan con texto fijo: antetítulo, título, subtítulo en cursiva y hasta 3 botones.',
    palabras: 'carrusel portada fotos editorial slider',
  },
  {
    tipo: 'how_it_works',
    variante: VARIANTE_HISTORIA_CAPITULOS,
    etiqueta: 'Historia por capítulos',
    descripcion: 'Tarjetas numeradas con etiqueta, imagen, título y texto.',
    palabras: 'historia capitulos nosotros origen quienes somos',
  },
  {
    tipo: 'menu_full',
    variante: VARIANTE_CARTA_PUNTOS,
    etiqueta: 'Carta · Línea de puntos',
    descripcion: 'Pestañas en cursiva, contador y línea de puntos hasta el precio; el visitante elige la sede.',
    palabras: 'carta sede puntos precios menu cafe',
  },
  {
    tipo: 'reservation',
    variante: VARIANTE_RESERVA_PLANO,
    etiqueta: 'Reserva con plano de mesas',
    descripcion: 'El visitante toca una mesa en el plano de la sede y reserva directo o por WhatsApp.',
    palabras: 'plano mesas reservar reserva whatsapp',
  },
];

/** Entrada de «Añadir sección»: un tipo, o un tipo con una variante destacada (`variants[0]`). */
export type EntradaCatalogo = SectionTypeDefinition & { varianteDestacada?: string };

/** Clave única de una entrada: `tipo` o `tipo:variante` (la de las recomendadas). */
export function claveEntrada(entrada: EntradaCatalogo): string {
  return entrada.varianteDestacada ? `${entrada.type}:${entrada.varianteDestacada}` : entrada.type;
}

/** La tarjeta de una variante: el tipo con esa variante primero (la que se añade). */
function entradaDeVariante(def: SectionTypeDefinition, v: VarianteEnCatalogo): EntradaCatalogo | null {
  const variante = def.variants.find((x) => x.id === v.variante);
  if (!variante) return null;
  return {
    ...def,
    label: v.etiqueta,
    description: v.descripcion,
    variants: [variante, ...def.variants.filter((x) => x.id !== v.variante)],
    varianteDestacada: v.variante,
  };
}

/**
 * Secciones recomendadas por tipo de sede, en orden. Solo ordenan: no
 * restringen nada. `tipo:variante` recomienda la tarjeta de esa variante.
 */
export const RECOMENDADAS_POR_TIPO: Readonly<Record<BranchType, readonly string[]>> = {
  restaurant: [
    'restaurant_hero', `hero:${VARIANTE_PORTADA_EDITORIAL}`, 'signature_dishes', 'menu_full', `menu_full:${VARIANTE_CARTA_PUNTOS}`,
    'reservation', `reservation:${VARIANTE_RESERVA_PLANO}`, `how_it_works:${VARIANTE_HISTORIA_CAPITULOS}`,
    'private_events', 'gallery_bento', 'hours_location',
  ],
  hotel: ['room_types', 'amenities', 'booking_cta', 'why_choose_us', 'gallery', 'testimonials'],
  retail: ['products_grid', 'featured_products', 'categories_grid', 'offers', 'promo_banners', 'brands'],
  gym: ['membership_plans', 'class_schedule', 'trainers', 'gym_features', 'transformation'],
  transport: ['trip_search', 'routes', 'booking_transport', 'fleet_showcase', 'coverage_map'],
  parking: ['parking_availability', 'parking_pricing', 'parking_pass_plans', 'parking_zones', 'parking_features'],
  services: ['services_list', 'features_grid', 'how_it_works', 'pricing_table', 'demo_cta', 'integrations'],
};

/** En las plantillas de detalle lo recomendado son sus propios bloques. */
const RECOMENDADAS_POR_TIPO_DE_PAGINA: Readonly<Record<string, IdGrupoSecciones>> = {
  product_detail: 'ficha_producto',
  category_detail: 'pagina_categoria',
};

/**
 * Tipo de sede que recomienda secciones cuando la página no es de una sede con `branch_type`
 * (sitio principal o sede sin tipo): sale del giro del sitio (`organizations.type_id` vía
 * `giroDesdeTipo`, o el giro elegido en el asistente). Así un restaurante ve primero Carta,
 * Reservar y Horario aunque edite el sitio principal. `otro` → sin recomendadas.
 */
export function tipoSedeDesdeGiro(giro: string | null | undefined): BranchType | null {
  switch (giro) {
    case 'restaurante':
      return 'restaurant';
    case 'hotel':
      return 'hotel';
    case 'tienda':
      return 'retail';
    case 'servicios':
      return 'services';
    case 'gimnasio':
      return 'gym';
    default:
      return null;
  }
}

/** Tipo de sede en palabras, para el subtítulo de «Recomendadas». */
export const NOMBRE_TIPO_SEDE: Readonly<Record<BranchType, string>> = {
  restaurant: 'restaurante',
  hotel: 'hotel',
  retail: 'tienda',
  gym: 'gimnasio',
  transport: 'empresa de transporte',
  parking: 'parqueadero',
  services: 'empresa de servicios',
};

/**
 * Palabras con las que la gente busca una sección y que no están en su nombre
 * («piscina» no está: la búsqueda vacía también es un estado del diseño).
 */
const PALABRAS_CLAVE: Readonly<Record<string, string>> = {
  hero: 'portada banner inicio principal',
  room_types: 'habitaciones cuartos hotel espacios alojamiento',
  amenities: 'servicios hotel comodidades amenidades',
  booking_cta: 'reservas reservar estadia hotel',
  menu_full: 'carta menu platos comida',
  menu_preview: 'carta menu platos destacados',
  specialties: 'carta platos especialidades',
  chef_section: 'chef cocina equipo',
  chef_team: 'chef cocina equipo cocineros',
  restaurant_hero: 'portada inicio restaurante mesa qr bienvenida',
  table_service: 'mesero llamar mesa qr servicio cuenta',
  table_order: 'pedido mesa rondas qr cocina comanda',
  table_bill: 'cuenta mesa pagar propina dividir qr',
  visit_feedback: 'valorar valoracion opinion estrellas encuesta visita',
  signature_dishes: 'platos estrella especialidades carta destacados',
  events: 'eventos agenda calendario',
  private_events: 'eventos privados celebraciones reservas grupos',
  gallery_bento: 'galeria fotos imagenes',
  marquee: 'cinta texto movimiento anuncio',
  reservation_cta: 'reservas reservar mesa restaurante',
  reservation: 'reservas reservar mesa restaurante',
  hours_location: 'horario ubicacion sedes direccion abierto',
  delivery_cta: 'domicilios delivery envios pedidos',
  products_grid: 'productos tienda catalogo',
  featured_products: 'productos destacados tienda',
  categories_grid: 'categorias tienda catalogo',
  offers: 'ofertas descuentos promociones',
  promo_banners: 'banners promociones',
  brands: 'marcas',
  membership_plans: 'membresias planes gimnasio',
  class_schedule: 'clases horarios gimnasio',
  trainers: 'entrenadores instructores',
  routes: 'rutas viajes transporte',
  trip_search: 'viajes buscar pasajes transporte',
  fleet_showcase: 'flota vehiculos buses',
  parking_zones: 'parqueadero zonas',
  parking_pricing: 'parqueadero tarifas precios',
  parking_pass_plans: 'parqueadero planes mensualidades',
  testimonials: 'opiniones resenas testimonios',
  map: 'mapa ubicacion direccion',
  contact_form: 'contacto formulario',
  gallery: 'galeria fotos imagenes',
};

export interface GrupoCatalogo {
  id: IdGrupoSecciones;
  etiqueta: string;
  proposito: string;
  secciones: EntradaCatalogo[];
}

export interface CatalogoSede {
  /** Secciones recomendadas por el tipo de la sede (vacío si no tiene tipo). */
  recomendadas: EntradaCatalogo[];
  /** Todas las secciones del catálogo, agrupadas por propósito (con las tarjetas de variante). */
  grupos: GrupoCatalogo[];
  /** Número de tarjetas: cada tipo del catálogo más las de {@link VARIANTES_EN_CATALOGO}. */
  total: number;
}

/**
 * Catálogo completo para una sede: «recomendadas» primero según su
 * `branch_type` (o según el tipo de página en las plantillas de detalle) y
 * todas las secciones agrupadas por propósito. Nunca quita secciones: una
 * sección que ningún grupo declara cae en «Otras».
 */
export function getSectionCatalogForBranch(
  branchType: BranchType | null | undefined,
  opciones: { pageType?: string | null; catalogo?: readonly SectionTypeDefinition[] } = {},
): CatalogoSede {
  const catalogo = opciones.catalogo ?? SECTION_CATALOG;
  const porTipo = new Map(catalogo.map((s) => [s.type, s]));
  const porClave = new Map<string, EntradaCatalogo>(catalogo.map((s) => [s.type, s]));
  const variantesDe = new Map<string, EntradaCatalogo[]>();
  for (const v of VARIANTES_EN_CATALOGO) {
    const def = porTipo.get(v.tipo);
    const entrada = def ? entradaDeVariante(def, v) : null;
    if (!entrada) continue;
    porClave.set(claveEntrada(entrada), entrada);
    variantesDe.set(v.tipo, [...(variantesDe.get(v.tipo) ?? []), entrada]);
  }
  // Cada tipo seguido de las tarjetas de sus variantes destacadas.
  const conVariantes = (secciones: SectionTypeDefinition[]): EntradaCatalogo[] =>
    secciones.flatMap((s) => [s, ...(variantesDe.get(s.type) ?? [])]);
  const usados = new Set<string>();

  const grupos: GrupoCatalogo[] = [];
  for (const g of GRUPOS_SECCIONES) {
    const secciones = g.tipos
      .map((t) => porTipo.get(t))
      .filter((s): s is SectionTypeDefinition => Boolean(s) && !usados.has((s as SectionTypeDefinition).type));
    secciones.forEach((s) => usados.add(s.type));
    if (secciones.length > 0) {
      grupos.push({ id: g.id, etiqueta: g.etiqueta, proposito: g.proposito, secciones: conVariantes(secciones) });
    }
  }
  const sueltas = catalogo.filter((s) => !usados.has(s.type));
  if (sueltas.length > 0) {
    grupos.push({ id: 'otras', etiqueta: 'Otras', proposito: 'más bloques', secciones: conVariantes(sueltas) });
  }

  const grupoDePagina = opciones.pageType ? RECOMENDADAS_POR_TIPO_DE_PAGINA[opciones.pageType] : undefined;
  const tiposRecomendados = grupoDePagina
    ? GRUPOS_SECCIONES.find((g) => g.id === grupoDePagina)?.tipos ?? []
    : branchType
      ? RECOMENDADAS_POR_TIPO[branchType] ?? []
      : [];
  const recomendadas = tiposRecomendados
    .map((t) => porClave.get(t))
    .filter((s): s is EntradaCatalogo => Boolean(s));

  return { recomendadas, grupos, total: grupos.reduce((n, g) => n + g.secciones.length, 0) };
}

/** Minúsculas y sin tildes, para buscar «menú» con «menu». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** ¿La sección coincide con lo buscado? (nombre, tipo, descripción, grupo o palabras clave). */
export function coincideBusqueda(seccion: EntradaCatalogo, busqueda: string, grupo?: GrupoCatalogo): boolean {
  const q = normalizarBusqueda(busqueda);
  if (!q) return true;
  const deVariante = seccion.varianteDestacada
    ? VARIANTES_EN_CATALOGO.find((v) => v.tipo === seccion.type && v.variante === seccion.varianteDestacada)
    : undefined;
  const pajar = normalizarBusqueda(
    [
      seccion.label,
      seccion.type.replace(/_/g, ' '),
      seccion.description,
      grupo ? `${grupo.etiqueta} ${grupo.proposito}` : '',
      PALABRAS_CLAVE[seccion.type] ?? '',
      deVariante?.palabras ?? '',
    ].join(' '),
  );
  return q.split(/\s+/).every((palabra) => pajar.includes(palabra));
}

/** Catálogo filtrado por la búsqueda: mismos grupos, solo las secciones que coinciden. */
export function filtrarCatalogo(catalogo: CatalogoSede, busqueda: string): CatalogoSede & { coincidencias: number } {
  if (!normalizarBusqueda(busqueda)) return { ...catalogo, coincidencias: catalogo.total };
  const grupoDe = new Map<string, GrupoCatalogo>();
  catalogo.grupos.forEach((g) => g.secciones.forEach((s) => grupoDe.set(claveEntrada(s), g)));
  const grupos = catalogo.grupos.map((g) => ({
    ...g,
    secciones: g.secciones.filter((s) => coincideBusqueda(s, busqueda, g)),
  }));
  const recomendadas = catalogo.recomendadas.filter((s) => coincideBusqueda(s, busqueda, grupoDe.get(claveEntrada(s))));
  const coincidencias = grupos.reduce((n, g) => n + g.secciones.length, 0);
  return { recomendadas, grupos, total: catalogo.total, coincidencias };
}
