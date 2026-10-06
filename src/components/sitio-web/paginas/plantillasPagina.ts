/**
 * Plantillas de PÁGINA (nivel T de docs/website-builder-v2/CATALOGO-COMPOSICIONES.md) para
 * «Nueva página» (Figma A/04b), «Restaurar páginas base» (A/04e) y el asistente de creación.
 * Puro: sin React ni Supabase, para que lo usen el diálogo y los route handlers.
 *
 * Cada plantilla trae las secciones típicas con tipos y variantes que existen en el catálogo de
 * secciones del constructor (`SECTION_CATALOG`; lo comprueba la prueba) y contenido de ejemplo
 * reemplazable. La página nace con el estilo del sitio: aquí no hay colores ni fuentes.
 *
 * Las PÁGINAS BASE por giro repiten el juego que siembra la base al crear la organización
 * (`public.create_default_pages`), más las dos políticas. Ver `PAGINAS_BASE_GIRO`.
 */
import type { PaginaSitio, SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import type { TipoMiniaturaSeccion } from '@/components/sitio-web/ui/SectionThumbnail';

/** Giro del negocio según `organization_types` (ids verificados por MCP el 2026-10-06). */
export type Giro = 'restaurante' | 'hotel' | 'tienda' | 'servicios' | 'gimnasio' | 'transporte' | 'parqueadero';

const GIRO_POR_TIPO_ORGANIZACION: Record<number, Giro> = {
  1: 'restaurante',
  2: 'hotel',
  3: 'tienda',
  4: 'servicios',
  5: 'gimnasio',
  6: 'transporte',
  7: 'parqueadero',
};

export function giroDeTipoOrganizacion(typeId: number | null | undefined): Giro {
  return (typeId && GIRO_POR_TIPO_ORGANIZACION[typeId]) || 'tienda';
}

/** Giro según `branches.branch_type` (valores de `BranchType`). */
const GIRO_POR_TIPO_SEDE: Record<string, Giro> = {
  restaurant: 'restaurante',
  hotel: 'hotel',
  retail: 'tienda',
  services: 'servicios',
  gym: 'gimnasio',
  transport: 'transporte',
  parking: 'parqueadero',
};

/**
 * Giro del sitio de una sede: el de su `branch_type` si lo tiene, si no el de la organización.
 * Un hotel con una sede restaurante ofrece en esa sede las páginas de restaurante (Carta,
 * Carta QR…), igual que «Añadir sección» recomienda por el tipo de la sede.
 */
export function giroDeSede(branchType: string | null | undefined, giroOrganizacion: Giro): Giro {
  return giroDeTipoSede(branchType) ?? giroOrganizacion;
}

/** Giro de un `branch_type`, sin respaldo: `null` si la sede no tiene tipo con plantilla. */
export function giroDeTipoSede(branchType: string | null | undefined): Giro | null {
  return (branchType && Object.prototype.hasOwnProperty.call(GIRO_POR_TIPO_SEDE, branchType) && GIRO_POR_TIPO_SEDE[branchType]) || null;
}

export type IdPlantillaPagina =
  | 'inicio'
  | 'carta'
  | 'carta_qr'
  | 'reservas'
  | 'eventos'
  | 'nosotros'
  | 'sedes'
  | 'contacto'
  | 'servicios'
  | 'productos'
  | 'habitaciones'
  | 'planes'
  | 'galeria'
  | 'preguntas'
  | 'legal'
  | 'en_blanco';

export interface SeccionPlantilla {
  tipo: string;
  variante: string;
  contenido: Record<string, unknown>;
}

export interface PlantillaPagina {
  id: IdPlantillaPagina;
  /** `pagina.tipo` del documento V2. */
  tipo: string;
  /** Dirección sugerida (sin «/»). */
  slug: string;
  /** Miniatura esquemática (A/07j). */
  miniatura: TipoMiniaturaSeccion | 'en_blanco';
  /** Giros donde se ofrece; `null` = todos. */
  giros: readonly Giro[] | null;
  secciones: readonly SeccionPlantilla[];
}

const hero = (title: string, subtitle: string): SeccionPlantilla => ({
  tipo: 'hero',
  variante: 'minimal',
  contenido: { title, subtitle },
});

/** Orden del diálogo (A/04b): las del giro primero, «En blanco» siempre al final. */
export const PLANTILLAS_PAGINA: readonly PlantillaPagina[] = [
  {
    id: 'inicio',
    tipo: 'home',
    slug: 'inicio',
    miniatura: 'portada',
    giros: null,
    secciones: [
      hero('Bienvenido', 'Cuéntale a tus clientes qué te hace diferente'),
      { tipo: 'featured_products', variante: 'grid', contenido: { title: 'Lo más pedido' } },
      { tipo: 'testimonials', variante: 'carousel', contenido: { title: 'Lo que dicen nuestros clientes' } },
      { tipo: 'cta', variante: 'centered', contenido: { title: '¿Listo para visitarnos?' } },
    ],
  },
  {
    id: 'carta',
    tipo: 'carta',
    slug: 'carta',
    miniatura: 'carta_destacada',
    giros: ['restaurante'],
    secciones: [hero('Nuestra carta', 'Descubre nuestros platos'), { tipo: 'menu_full', variante: 'tabs', contenido: {} }],
  },
  {
    id: 'carta_qr',
    tipo: 'carta_qr',
    slug: 'carta-qr',
    miniatura: 'carta_destacada',
    giros: ['restaurante'],
    secciones: [{ tipo: 'menu_full', variante: 'anchors', contenido: {} }],
  },
  {
    id: 'reservas',
    tipo: 'reservas',
    slug: 'reservas',
    miniatura: 'reservas',
    giros: ['restaurante', 'hotel', 'servicios', 'gimnasio'],
    secciones: [
      hero('Reserva tu mesa', 'Elige el día, la hora y cuántas personas vienen'),
      { tipo: 'reservation', variante: 'stepper', contenido: {} },
      { tipo: 'hours_location', variante: 'hours_map', contenido: {} },
    ],
  },
  {
    id: 'eventos',
    tipo: 'eventos',
    slug: 'eventos',
    miniatura: 'eventos',
    giros: ['restaurante', 'hotel', 'gimnasio', 'servicios'],
    secciones: [
      hero('Eventos', 'Celebra con nosotros'),
      { tipo: 'events', variante: 'list', contenido: {} },
      { tipo: 'private_events', variante: 'default', contenido: {} },
    ],
  },
  {
    id: 'nosotros',
    tipo: 'nosotros',
    slug: 'nosotros',
    miniatura: 'texto',
    giros: null,
    secciones: [
      hero('Nosotros', 'Nuestra historia'),
      { tipo: 'image_text', variante: 'image_left', contenido: { title: 'Cómo empezamos' } },
      { tipo: 'team', variante: 'grid', contenido: { title: 'Nuestro equipo' } },
    ],
  },
  {
    id: 'sedes',
    tipo: 'sedes',
    slug: 'sedes',
    miniatura: 'ubicacion_horario',
    giros: null,
    secciones: [hero('Nuestras sedes', 'Encuentra la más cercana'), { tipo: 'hours_location', variante: 'cards', contenido: {} }],
  },
  {
    id: 'contacto',
    tipo: 'contacto',
    slug: 'contacto',
    miniatura: 'ubicacion_horario',
    giros: ['tienda', 'hotel', 'servicios', 'gimnasio', 'transporte', 'parqueadero'],
    secciones: [
      hero('Contáctanos', 'Estamos aquí para ayudarte'),
      { tipo: 'contact_form', variante: 'split', contenido: {} },
      { tipo: 'map', variante: 'full_width', contenido: { title: 'Encuéntranos', subtitle: 'Visítanos en nuestra sede' } },
    ],
  },
  {
    id: 'servicios',
    tipo: 'servicios',
    slug: 'servicios',
    miniatura: 'productos',
    giros: ['servicios', 'hotel', 'gimnasio'],
    secciones: [hero('Nuestros servicios', 'Conoce todo lo que podemos hacer por ti'), { tipo: 'services_list', variante: 'cards', contenido: {} }],
  },
  {
    id: 'productos',
    tipo: 'productos',
    slug: 'productos',
    miniatura: 'productos',
    giros: ['tienda'],
    secciones: [hero('Nuestros productos', 'Descubre todo lo que tenemos para ti'), { tipo: 'products_grid', variante: 'grid', contenido: {} }],
  },
  {
    id: 'habitaciones',
    tipo: 'espacios',
    slug: 'espacios',
    miniatura: 'galeria',
    giros: ['hotel'],
    secciones: [hero('Nuestras habitaciones', 'Comodidad y descanso para ti'), { tipo: 'room_types', variante: 'cards', contenido: {} }],
  },
  {
    id: 'planes',
    tipo: 'membresias',
    slug: 'membresias',
    miniatura: 'productos',
    giros: ['gimnasio', 'parqueadero'],
    secciones: [hero('Nuestros planes', 'Elige el plan perfecto para ti'), { tipo: 'membership_plans', variante: 'pricing_table', contenido: {} }],
  },
  {
    id: 'galeria',
    tipo: 'galeria',
    slug: 'galeria',
    miniatura: 'galeria',
    giros: ['hotel', 'servicios', 'tienda', 'gimnasio'],
    secciones: [hero('Galería', 'Así se vive la experiencia'), { tipo: 'gallery', variante: 'masonry', contenido: {} }],
  },
  {
    id: 'preguntas',
    tipo: 'preguntas',
    slug: 'preguntas-frecuentes',
    miniatura: 'texto',
    giros: ['tienda', 'servicios', 'transporte', 'parqueadero'],
    secciones: [hero('Preguntas frecuentes', 'Resolvemos tus dudas'), { tipo: 'faq', variante: 'accordion', contenido: {} }],
  },
  {
    id: 'legal',
    tipo: 'legal',
    slug: 'legal',
    miniatura: 'texto',
    giros: null,
    secciones: [{ tipo: 'text_block', variante: 'left', contenido: { title: 'Términos y condiciones', content: '' } }],
  },
  {
    id: 'en_blanco',
    tipo: 'custom',
    slug: 'nueva-pagina',
    miniatura: 'en_blanco',
    giros: null,
    secciones: [],
  },
];

export function plantillaPorId(id: string): PlantillaPagina | undefined {
  return PLANTILLAS_PAGINA.find((p) => p.id === id);
}

/** Plantillas que se ofrecen a un giro, con «En blanco» siempre al final. */
export function plantillasParaGiro(giro: Giro): PlantillaPagina[] {
  const del = PLANTILLAS_PAGINA.filter((p) => p.id !== 'en_blanco' && (p.giros === null || p.giros.includes(giro)));
  return [...del, plantillaPorId('en_blanco')!];
}

// ─── Construcción de páginas ─────────────────────────────────────────────────────────────────

export type GenerarId = () => string;

/** Convierte un texto libre en dirección válida del contrato (`a-z0-9` y guiones). */
export function slugDesdeTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split('/')
    .map((parte) =>
      parte
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('/')
    .slice(0, 120)
    .replace(/[-/]+$/g, '');
}

/** Dirección libre dentro del documento: `carta`, `carta-2`, `carta-3`… */
export function slugLibre(base: string, usados: ReadonlySet<string>): string {
  const limpio = base || 'pagina';
  if (!usados.has(limpio)) return limpio;
  let n = 2;
  while (usados.has(`${limpio}-${n}`)) n += 1;
  return `${limpio}-${n}`;
}

function seccionDe(s: SeccionPlantilla, generarId: GenerarId): SeccionSitio {
  return {
    id: generarId(),
    tipo: s.tipo,
    variante: s.variante,
    version: 1,
    contenido: JSON.parse(JSON.stringify(s.contenido)) as Record<string, unknown>,
    diseno: {},
    visibilidad: { movil: true, escritorio: true },
  };
}

export function construirPagina(
  plantilla: PlantillaPagina,
  datos: { titulo: string; slug: string },
  generarId: GenerarId,
): PaginaSitio {
  return {
    id: generarId(),
    slug: datos.slug,
    tipo: plantilla.tipo,
    titulo: datos.titulo.trim().slice(0, 200),
    publicada: true,
    secciones: plantilla.secciones.map((s) => seccionDe(s, generarId)),
  };
}

// ─── Páginas base por giro (A/04e «Restaurar páginas base») ─────────────────────────────────

export interface PaginaBase {
  titulo: string;
  slug: string;
  tipo: string;
  enMenu: boolean;
  secciones: readonly SeccionPlantilla[];
}

/** `tipo:variante` → sección de plantilla sin contenido (el render usa los textos por defecto). */
const sec = (clave: string): SeccionPlantilla => {
  const [tipo, variante] = clave.split(':');
  return { tipo, variante, contenido: {} };
};
const pagina = (titulo: string, slug: string, enMenu: boolean, secciones: string): PaginaBase => ({
  titulo,
  slug,
  tipo: 'builtin',
  enMenu,
  secciones: secciones.split(',').map(sec),
});

/**
 * Juego base por giro: el MISMO que siembra la base al crear la organización
 * (`public.create_default_pages`, disparada por `trg_org_create_default_pages`; páginas, orden,
 * «en el encabezado» y secciones `tipo:variante` leídos por MCP el 2026-10-06). Es la fuente
 * real de lo que tienen hoy los sitios: `seedDefaultPages` del servicio ya no se usa para
 * sembrar. Si una migración cambia un bloque de la función, este juego debe seguirla: la prueba
 * `src/lib/website/v2/__tests__/plantillaSede.test.ts` compara cada giro con el bloque `WHEN` de
 * la última migración que define la función (restaurante: `20261006125630_paginas_por_defecto_
 * restaurante`, aplicada). Inicio se incluye aquí porque la función también la siembra con
 * secciones propias del giro. Es también la plantilla con que nace el sitio de una SEDE de ese
 * tipo (`src/lib/website/v2/plantillaSede.ts`).
 */
export const PAGINAS_BASE_GIRO: Record<Giro, readonly PaginaBase[]> = {
  restaurante: [
    pagina('Inicio', 'home', true, 'restaurant_hero:split_bento,signature_dishes:carousel,menu_preview:tabs,delivery_cta:banner,gallery_bento:default,testimonials:carousel,reservation:band,hours_location:hours_map'),
    pagina('Menú', 'menu', true, 'hero:minimal,menu_full:anchors,cta:centered'),
    pagina('Pedir Online', 'domicilios', true, 'hero:minimal,products_grid:grid'),
    pagina('Reservar Mesa', 'reservas-mesa', true, 'hero:minimal,reservation:stepper,private_events:default,faq:accordion'),
    pagina('Nosotros', 'nosotros', true, 'hero:split,text_block:two_columns,stats:counters,team:grid,chef_team:chef'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:embedded'),
    pagina('Galería', 'galeria', false, 'gallery:masonry'),
  ],
  hotel: [
    pagina('Inicio', 'home', true, 'hero:fullscreen,booking_cta:inline_form,room_types:cards,why_choose_us:icons,amenities:icons,gallery:masonry,testimonials:carousel,stats:counters,map:embedded'),
    pagina('Habitaciones', 'espacios', true, 'hero:minimal,room_types:detailed,booking_cta:banner'),
    pagina('Servicios', 'servicios', true, 'hero:minimal,amenities:grid,services_list:cards'),
    pagina('Galería', 'galeria', true, 'gallery:masonry'),
    pagina('Nosotros', 'nosotros', true, 'hero:split,text_block:centered,stats:counters,team:grid'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:embedded'),
  ],
  tienda: [
    pagina('Inicio', 'home', true, 'hero:slider,categories_grid:horizontal,featured_products:grid,promo_banners:grid,products_grid:grid,testimonials:carousel,newsletter:simple,brands:logos'),
    pagina('Productos', 'productos', true, 'hero:minimal,products_grid:grid'),
    pagina('Categorías', 'categorias', true, 'hero:minimal,categories_grid:grid'),
    pagina('Ofertas', 'ofertas', true, 'hero:minimal,promo_banners:grid,featured_products:carousel,cta:banner'),
    pagina('Nosotros', 'nosotros', true, 'hero:split,text_block:two_columns,stats:counters,team:grid,partners:logos'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:full_width'),
  ],
  servicios: [
    pagina('Inicio', 'home', true, 'hero:split,partners:logos,features_grid:alternating,stats:counters,how_it_works:steps,pricing_table:three_columns,testimonials:carousel,faq:accordion,demo_cta:form'),
    pagina('Servicios', 'servicios', true, 'hero:minimal,features_grid:alternating,cta:centered'),
    pagina('Precios', 'precios', true, 'hero:minimal,pricing_table:three_columns,faq:two_columns,cta:banner'),
    pagina('Nosotros', 'nosotros', true, 'hero:split,text_block:two_columns,stats:counters,team:grid'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:default'),
  ],
  gimnasio: [
    pagina('Inicio', 'home', true, 'hero:video,membership_plans:pricing_table,gym_features:icons,class_schedule:grid,trainers:grid,transformation:before_after,testimonials:carousel,cta:with_image,gallery:grid'),
    pagina('Membresías', 'membresias', true, 'hero:minimal,membership_plans:pricing_table,faq:accordion,cta:centered'),
    pagina('Clases', 'clases', true, 'hero:minimal,class_schedule:grid,trainers:grid'),
    pagina('Entrenadores', 'entrenadores', true, 'hero:minimal,trainers:grid'),
    pagina('Nosotros', 'nosotros', true, 'hero:fullscreen,text_block:centered,stats:counters,team:grid'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:full_width'),
  ],
  transporte: [
    pagina('Inicio', 'home', true, 'hero:split,trip_search:form,routes:cards,stats:counters,fleet_showcase:grid,why_choose_us:icons,testimonials:carousel,partners:logos,cta:banner,contact_form:split'),
    pagina('Servicios', 'servicios', true, 'hero:minimal,services_list:cards,cta:centered'),
    pagina('Rutas', 'rutas', true, 'hero:minimal,routes:cards,coverage_map:static'),
    pagina('Nuestra Flota', 'flota', true, 'hero:minimal,fleet_showcase:grid'),
    pagina('Nosotros', 'nosotros', true, 'hero:split,text_block:two_columns,stats:counters,team:grid'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:full_width'),
  ],
  parqueadero: [
    pagina('Inicio', 'home', true, 'hero:split,parking_zones:grid,parking_pricing:cards,parking_features:icons,stats:counters,testimonials:carousel,faq:accordion,map:full_width'),
    pagina('Zonas', 'zonas', true, 'hero:minimal,parking_zones:grid,parking_availability:summary'),
    pagina('Tarifas', 'tarifas', true, 'hero:minimal,parking_pricing:cards,parking_pass_plans:cards,faq:accordion,cta:centered'),
    pagina('Servicios', 'servicios', true, 'hero:minimal,parking_features:icons,services_list:grid'),
    pagina('Nosotros', 'nosotros', true, 'hero:minimal,text_block:left,stats:counters,team:grid'),
    pagina('Contacto', 'contacto', true, 'hero:minimal,contact_form:split,map:full_width'),
  ],
};

/** Ids de `organization_types` tal como los indexa `create_default_pages` (para la prueba). */
export const TIPO_ORGANIZACION_POR_GIRO: Record<Giro, number> = {
  restaurante: 1,
  hotel: 2,
  tienda: 3,
  servicios: 4,
  gimnasio: 5,
  transporte: 6,
  parqueadero: 7,
};

/** Las dos políticas: van al pie (grupo «Legales»), nunca al encabezado. */
const LEGALES_BASE: readonly PaginaBase[] = [
  { titulo: 'Términos y condiciones', slug: 'terminos', tipo: 'legal', enMenu: false, secciones: [{ tipo: 'text_block', variante: 'left', contenido: { title: 'Términos y condiciones', content: '' } }] },
  { titulo: 'Política de privacidad', slug: 'privacidad', tipo: 'legal', enMenu: false, secciones: [{ tipo: 'text_block', variante: 'left', contenido: { title: 'Política de privacidad', content: '' } }] },
];

/** Juego del giro (con Inicio y Contacto, como la siembra real) + las dos políticas (A/04e). */
export function paginasBasePorGiro(giro: Giro): PaginaBase[] {
  return [...PAGINAS_BASE_GIRO[giro], ...LEGALES_BASE];
}

export function construirPaginaBase(base: PaginaBase, generarId: GenerarId): PaginaSitio {
  return {
    id: generarId(),
    slug: base.slug,
    tipo: base.tipo,
    titulo: base.titulo,
    publicada: true,
    secciones: base.secciones.map((s) => seccionDe(s, generarId)),
  };
}
