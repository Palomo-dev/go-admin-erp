/**
 * Catálogo de estilos y plantillas del sitio por giro (Figma A/06a-06c, A/06h-06i):
 * UNA fuente para Diseño (presets de estilo), Plantillas (galería), el asistente
 * de creación y el estilo global del editor. Código puro y versionado, sin React
 * ni Supabase, para poder moverlo al paquete del contrato o copiarlo a
 * goadmin-websites (ADR-002 D2, enmienda A4), como `documentoSitio.ts`.
 *
 * Qué es cada cosa (A/06h):
 * - Un ESTILO (preset) es solo apariencia: modo, fondo, texto, acento, par
 *   tipográfico, redondeo, botones y movimiento. Elegirlo en Diseño no toca las
 *   secciones.
 * - Una PLANTILLA es estructura + estilo: el orden y las variantes de las
 *   secciones de Inicio y su estilo. Usarla crea un borrador y conserva el
 *   contenido («Solo estilo», `usarPlantilla.ts`) o arma el sitio completo
 *   («Plantilla completa», `v2/plantillaCompleta.ts`).
 *
 * De dónde sale:
 * - Restaurante: las 8 plantillas aprobadas en Figma (A/06b, A/07h), con sus
 *   tokens medidos en las capturas. Cada una se apoya en una plantilla base que
 *   el sitio público ya sabe pintar (`base`: `restaurant_elegant`, …): esa es la
 *   que se guarda en `tema.plantillaBase`, porque el sitio resuelve la plantilla
 *   con ese id (`getTemplate(template_id)` en goadmin-websites).
 * - Los demás giros (tienda, hotel, servicios, gimnasio, transporte y
 *   parqueadero) aún no tienen diseño propio en Figma: se construyen desde las
 *   plantillas reales del sitio (`TEMPLATE_PRESETS`, que se pasan a
 *   `construirCatalogo`) y su estructura de Inicio, copiada de
 *   `goadmin-websites/lib/templates/presets.ts` en `SECCIONES_INICIO_BASE` (la
 *   prueba de contrato la compara con el sitio cuando el repositorio está al lado).
 */
import type { EstiloBoton, MovimientoSitio, RadioSitio, TokensEstilo } from '@/lib/website/v2/tokensEstilo';
import { CONTRASTE_AA, contraste } from '@/lib/utils/contrasteColor';

export const VERSION_CATALOGO_PLANTILLAS = 1 as const;

/** Giros del catálogo (las pestañas de A/06b más transporte y parqueadero). */
export const GIROS_CATALOGO = ['restaurante', 'tienda', 'hotel', 'servicios', 'gimnasio', 'transporte', 'parqueadero'] as const;
export type GiroCatalogo = (typeof GIROS_CATALOGO)[number];

/** `organizations.type_id` → giro (verificado en `organization_types`: 1…7). */
const GIRO_DE_TIPO: Record<number, GiroCatalogo> = {
  1: 'restaurante',
  2: 'hotel',
  3: 'tienda',
  4: 'servicios',
  5: 'gimnasio',
  6: 'transporte',
  7: 'parqueadero',
};

/** `business_type` de las plantillas del sitio → giro. */
const GIRO_DE_NEGOCIO: Record<string, GiroCatalogo> = {
  restaurant: 'restaurante',
  retail: 'tienda',
  hotel: 'hotel',
  services: 'servicios',
  gym: 'gimnasio',
  transport: 'transporte',
  parking: 'parqueadero',
};

export function giroCatalogoDeTipo(typeId: number | null | undefined): GiroCatalogo | null {
  return typeId ? GIRO_DE_TIPO[typeId] ?? null : null;
}

/** Sección de la estructura de una plantilla: `[tipo, variante]` del catálogo de secciones. */
export type SeccionPlantilla = readonly [tipo: string, variante: string];

/** Clase del par tipográfico, para la descripción de FontPairOption («Elegante · títulos con serifa»). */
export type ClaseFuentes = 'editorial' | 'elegante' | 'clasica' | 'calida' | 'artesanal' | 'divertida' | 'neutra' | 'moderna';

export interface EstiloCatalogo extends TokensEstilo {
  /** Id estable (el de la plantilla que lo trae). */
  id: string;
  nombre: string;
  giro: GiroCatalogo;
  claseFuentes: ClaseFuentes;
}

export interface PlantillaCatalogo {
  id: string;
  nombre: string;
  descripcion: string;
  giro: GiroCatalogo;
  /** Segundo chip del diálogo (A/06c: «Bar de coctelería»). */
  subgiro: string | null;
  /** Plantilla del sitio público sobre la que se apoya (`tema.plantillaBase`). */
  base: string;
  /** Estructura de Inicio, en orden. */
  inicio: readonly SeccionPlantilla[];
  estilo: EstiloCatalogo;
  /** La primera que se sugiere en su giro. */
  porDefecto: boolean;
}

export interface CatalogoPlantillas {
  version: typeof VERSION_CATALOGO_PLANTILLAS;
  plantillas: readonly PlantillaCatalogo[];
}

// ─── Restaurante: las 8 de Figma (A/06b, A/07h) ────────────────────────────────────────────

interface DefinicionRestaurante {
  id: string;
  nombre: string;
  descripcion: string;
  subgiro: string;
  base: string;
  inicio: readonly SeccionPlantilla[];
  modo: 'light' | 'dark';
  fondo: string;
  texto: string;
  acento: string;
  fuenteTitulos: string;
  fuenteCuerpo: string;
  radio: RadioSitio;
  estiloBoton: EstiloBoton;
  movimiento: MovimientoSitio;
  claseFuentes: ClaseFuentes;
}

const RESTAURANTE: readonly DefinicionRestaurante[] = [
  {
    id: 'noir_omakase',
    nombre: 'Noir Omakase',
    descripcion: 'Carta con anclas, reservas y chef.',
    subgiro: 'Barra de autor',
    base: 'restaurant_elegant',
    inicio: [
      ['restaurant_hero', 'typographic'],
      ['chef_team', 'chef'],
      ['signature_dishes', 'scrollytelling'],
      ['menu_preview', 'tabs'],
      ['testimonials', 'quotes'],
      ['reservation', 'form_image'],
      ['hours_location', 'hours_map'],
    ],
    modo: 'dark',
    fondo: '#0E0E0E',
    texto: '#F2EDE4',
    acento: '#C8A97E',
    fuenteTitulos: 'Cormorant',
    fuenteCuerpo: 'Inter',
    radio: 4,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'elegante',
  },
  {
    id: 'velvet_lounge',
    nombre: 'Velvet Lounge',
    descripcion: 'Bar de coctelería con eventos y reservas.',
    subgiro: 'Bar de coctelería',
    base: 'restaurant_elegant',
    inicio: [
      ['hero', 'video'],
      ['menu_preview', 'tabs'],
      ['events', 'list'],
      ['reservation', 'form_image'],
      ['gallery', 'carousel'],
      ['testimonials', 'carousel'],
      ['hours_location', 'hours_map'],
    ],
    modo: 'dark',
    fondo: '#1B0F1E',
    texto: '#F5E9F0',
    acento: '#D4AF37',
    fuenteTitulos: 'Playfair Display',
    fuenteCuerpo: 'Lato',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'elegante',
  },
  {
    id: 'fine_dining_oscuro',
    nombre: 'Fine Dining Oscuro',
    descripcion: 'Menú degustación, maridaje y reserva.',
    subgiro: 'Alta cocina',
    base: 'restaurant_elegant',
    inicio: [
      ['restaurant_hero', 'typographic'],
      ['signature_dishes', 'scrollytelling'],
      ['menu_preview', 'tabs'],
      ['chef_team', 'chef'],
      ['gallery_bento', 'default'],
      ['reservation', 'form_image'],
      ['hours_location', 'hours_map'],
    ],
    modo: 'dark',
    fondo: '#101418',
    texto: '#EDEAE3',
    acento: '#B8975A',
    fuenteTitulos: 'Cormorant Garamond',
    fuenteCuerpo: 'Montserrat',
    radio: 4,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'clasica',
  },
  {
    id: 'editorial_marfil',
    nombre: 'Editorial Marfil',
    descripcion: 'Carta editorial, historia y prensa.',
    subgiro: 'Cocina de autor',
    base: 'restaurant_rustic',
    inicio: [
      ['restaurant_hero', 'split_bento'],
      ['image_text', 'image_right'],
      ['menu_preview', 'tabs'],
      ['signature_dishes', 'carousel'],
      ['testimonials', 'quotes'],
      ['reservation', 'band'],
      ['hours_location', 'cards'],
    ],
    modo: 'light',
    fondo: '#F6F1E7',
    texto: '#1F1B16',
    acento: '#8C2F1B',
    fuenteTitulos: 'Libre Caslon Text',
    fuenteCuerpo: 'Inter',
    radio: 0,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'editorial',
  },
  {
    id: 'mediterraneo',
    nombre: 'Mediterráneo',
    descripcion: 'Carta por estaciones y terraza.',
    subgiro: 'Terraza',
    base: 'restaurant_rustic',
    inicio: [
      ['restaurant_hero', 'split_bento'],
      ['menu_preview', 'tabs'],
      ['marquee', 'photos'],
      ['gallery_bento', 'default'],
      ['testimonials', 'minimal'],
      ['reservation', 'band'],
      ['hours_location', 'cards'],
    ],
    modo: 'light',
    fondo: '#FBF8F2',
    texto: '#1D2B36',
    acento: '#1F6F8B',
    fuenteTitulos: 'DM Serif Display',
    fuenteCuerpo: 'DM Sans',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'bajo',
    claseFuentes: 'calida',
  },
  {
    id: 'bistro_ilustrado',
    nombre: 'Bistró Ilustrado',
    descripcion: 'Menú del día y domicilios.',
    subgiro: 'Bistró',
    base: 'restaurant_casual',
    inicio: [
      ['hero', 'split'],
      ['menu_preview', 'tabs'],
      ['delivery_cta', 'banner'],
      ['promo_banners', 'grid'],
      ['testimonials', 'grid'],
      ['faq', 'simple'],
      ['hours_location', 'list'],
    ],
    modo: 'light',
    fondo: '#FFF6E9',
    texto: '#2B2118',
    acento: '#C2410C',
    fuenteTitulos: 'Fraunces',
    fuenteCuerpo: 'Work Sans',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'artesanal',
  },
  {
    id: 'pop_callejero',
    nombre: 'Pop Callejero',
    descripcion: 'Combos, pedidos rápidos y redes.',
    subgiro: 'Comida callejera',
    base: 'restaurant_casual',
    inicio: [
      ['hero', 'split'],
      ['promo_banners', 'carousel'],
      ['menu_preview', 'tabs'],
      ['delivery_cta', 'banner'],
      ['testimonials', 'grid'],
      ['newsletter', 'banner'],
      ['hours_location', 'list'],
    ],
    modo: 'light',
    fondo: '#FFE94D',
    texto: '#111111',
    acento: '#E11D48',
    fuenteTitulos: 'Bricolage Grotesque',
    fuenteCuerpo: 'Inter',
    radio: 24,
    estiloBoton: 'pastilla',
    movimiento: 'alto',
    claseFuentes: 'divertida',
  },
  {
    id: 'carta_qr',
    nombre: 'Carta QR',
    descripcion: 'Solo la carta, para leer en la mesa.',
    subgiro: 'Carta en la mesa',
    base: 'restaurant_modern',
    inicio: [
      ['restaurant_hero', 'typographic'],
      ['menu_preview', 'tabs'],
      ['hours_location', 'list'],
    ],
    modo: 'light',
    fondo: '#FFFFFF',
    texto: '#18181B',
    acento: '#15803D',
    fuenteTitulos: 'Inter',
    fuenteCuerpo: 'Inter',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'ninguno',
    claseFuentes: 'neutra',
  },
];

// ─── Estructura de Inicio de las plantillas del sitio (copia de goadmin-websites) ──────────

/** `lib/templates/presets.ts` de goadmin-websites, página `home` (verificado 2026-10-06). */
export const SECCIONES_INICIO_BASE: Readonly<Record<string, readonly SeccionPlantilla[]>> = {
  retail_modern: [['hero', 'slider'], ['categories_grid', 'horizontal'], ['featured_products', 'grid'], ['offers', 'grid'], ['products_grid', 'grid'], ['testimonials', 'carousel'], ['newsletter', 'simple'], ['brands', 'logos']],
  retail_classic: [['hero', 'fullscreen'], ['categories_grid', 'grid'], ['featured_products', 'hero_product'], ['offers', 'grid'], ['image_text', 'image_right'], ['products_grid', 'list'], ['testimonials', 'quotes'], ['newsletter', 'with_image']],
  retail_bold: [['hero', 'slider'], ['categories_grid', 'icons'], ['featured_products', 'hero_product'], ['offers', 'grid'], ['products_grid', 'carousel'], ['cta', 'with_image'], ['testimonials', 'grid'], ['brands', 'logos'], ['newsletter', 'banner']],
  retail_elegant: [['hero', 'video'], ['text_block', 'centered'], ['featured_products', 'hero_product'], ['offers', 'grid'], ['image_text', 'image_left'], ['products_grid', 'grid'], ['testimonials', 'minimal'], ['newsletter', 'simple']],
  hotel_luxury: [['hero', 'fullscreen'], ['text_block', 'centered'], ['room_types', 'cards'], ['amenities', 'grid'], ['gallery', 'carousel'], ['testimonials', 'carousel'], ['booking_cta', 'banner'], ['newsletter', 'with_image']],
  hotel_boutique: [['hero', 'slider'], ['text_block', 'centered'], ['room_types', 'cards'], ['image_text', 'image_right'], ['gallery', 'fullscreen'], ['testimonials', 'quotes'], ['booking_cta', 'banner']],
  hotel_minimal: [['hero', 'split'], ['room_types', 'cards'], ['amenities', 'icons'], ['gallery', 'grid'], ['booking_cta', 'banner']],
  hotel_resort: [['hero', 'video'], ['booking_cta', 'banner'], ['room_types', 'cards'], ['amenities', 'grid'], ['gallery', 'carousel'], ['testimonials', 'grid'], ['stats', 'cards'], ['newsletter', 'with_image']],
  gym_power: [['hero', 'video'], ['membership_plans', 'pricing_table'], ['gym_features', 'icons'], ['class_schedule', 'grid'], ['trainers', 'grid'], ['transformation', 'before_after'], ['testimonials', 'carousel'], ['cta', 'with_image'], ['gallery', 'grid']],
  gym_wellness: [['hero', 'split'], ['text_block', 'centered'], ['class_schedule', 'grid'], ['trainers', 'grid'], ['gallery', 'masonry'], ['testimonials', 'quotes'], ['membership_plans', 'pricing_table'], ['newsletter', 'simple']],
  gym_urban: [['hero', 'fullscreen'], ['gym_features', 'icons'], ['membership_plans', 'pricing_table'], ['transformation', 'before_after'], ['class_schedule', 'grid'], ['gallery', 'grid'], ['testimonials', 'grid'], ['cta', 'banner']],
  gym_premium: [['hero', 'video'], ['text_block', 'centered'], ['membership_plans', 'pricing_table'], ['trainers', 'grid'], ['gallery', 'fullscreen'], ['testimonials', 'minimal'], ['stats', 'inline'], ['cta', 'with_image']],
  transport_corporate: [['hero', 'split'], ['trip_search', 'form'], ['routes', 'cards'], ['stats', 'counters'], ['fleet_showcase', 'grid'], ['why_choose_us', 'icons'], ['testimonials', 'carousel'], ['partners', 'logos'], ['cta', 'banner'], ['contact_form', 'split']],
  transport_dynamic: [['hero', 'fullscreen'], ['trip_search', 'form'], ['stats', 'inline'], ['routes', 'cards'], ['fleet_showcase', 'grid'], ['testimonials', 'grid'], ['cta', 'with_image']],
  transport_classic: [['hero', 'slider'], ['routes', 'cards'], ['fleet_showcase', 'grid'], ['stats', 'counters'], ['testimonials', 'quotes'], ['partners', 'logos'], ['map', 'full_width']],
  transport_eco: [['hero', 'split'], ['stats', 'cards'], ['routes', 'cards'], ['image_text', 'image_right'], ['fleet_showcase', 'grid'], ['testimonials', 'minimal'], ['newsletter', 'simple']],
  parking_modern: [['hero', 'split'], ['parking_zones', 'grid'], ['parking_pricing', 'cards'], ['parking_features', 'icons'], ['stats', 'counters'], ['testimonials', 'carousel'], ['faq', 'accordion'], ['map', 'full_width']],
  parking_tech: [['hero', 'fullscreen'], ['parking_features', 'icons'], ['parking_zones', 'grid'], ['stats', 'inline'], ['parking_pricing', 'cards'], ['testimonials', 'minimal'], ['faq', 'two_columns']],
  parking_urban: [['hero', 'split'], ['parking_zones', 'grid'], ['parking_pricing', 'cards'], ['stats', 'cards'], ['testimonials', 'grid'], ['map', 'with_directions']],
  parking_premium: [['hero', 'video'], ['parking_features', 'icons'], ['parking_zones', 'grid'], ['parking_pricing', 'cards'], ['testimonials', 'quotes'], ['stats', 'counters'], ['cta', 'with_image']],
  services_modern: [['hero', 'split'], ['partners', 'logos'], ['features_grid', 'alternating'], ['stats', 'counters'], ['how_it_works', 'steps'], ['pricing_table', 'three_columns'], ['testimonials', 'carousel'], ['integrations', 'logos'], ['faq', 'accordion'], ['demo_cta', 'form']],
  services_corporate: [['hero', 'split'], ['partners', 'logos'], ['features_grid', 'alternating'], ['stats', 'cards'], ['testimonials', 'grid'], ['pricing_table', 'three_columns'], ['faq', 'accordion'], ['demo_cta', 'form']],
  services_creative: [['hero', 'fullscreen'], ['how_it_works', 'steps'], ['features_grid', 'alternating'], ['testimonials', 'quotes'], ['pricing_table', 'three_columns'], ['partners', 'carousel'], ['cta', 'with_image']],
  services_minimal: [['hero', 'minimal'], ['features_grid', 'alternating'], ['image_text', 'image_right'], ['pricing_table', 'three_columns'], ['testimonials', 'minimal'], ['demo_cta', 'form']],
};

// ─── Plantillas del sitio → catálogo ───────────────────────────────────────────────────────

/** Lo que el catálogo lee de una plantilla del sitio (`TemplatePresetInfo` de websiteSettingsService). */
export interface PlantillaBaseSitio {
  id: string;
  name: string;
  description: string;
  business_type: string;
  is_default: boolean;
  theme_mode: 'light' | 'dark';
  colors: { primary: string; secondary: string };
  fonts: { heading: string; body: string };
}

/** Familias con serifa del catálogo (para la descripción del par tipográfico). */
const CON_SERIFA = new Set([
  'Playfair Display', 'Merriweather', 'Cormorant', 'Cormorant Garamond', 'Lora', 'Libre Caslon Text',
  'DM Serif Display', 'Fraunces',
]);

/** ¿La familia es con serifa? (respaldo CSS `serif` o `sans-serif` en las muestras). */
export function tieneSerifa(familia: string): boolean {
  return CON_SERIFA.has(familia);
}

/** Tipo de letra de los títulos (`serifa` o no): la clase del par en las plantillas del sitio. */
export function claseDeFuentes(titulos: string, cuerpo: string): ClaseFuentes {
  if (CON_SERIFA.has(titulos)) return 'clasica';
  return titulos === cuerpo ? 'neutra' : 'moderna';
}

/** Blanco y casi negro para el modo de las plantillas del sitio (como las pinta el sitio público). */
const FONDO_CLARO = '#FFFFFF';
const TEXTO_OSCURO_SOBRE_FONDO = '#FFFFFF';
/** Texto por defecto de las plantillas claras cuando el secundario del preset no se lee sobre blanco. */
const TEXTO_CLARO_POR_DEFECTO = '#1A1A1A';

/**
 * Texto de una plantilla clara: el secundario del preset solo si se lee sobre el fondo (AA). Varios
 * presets traen como secundario un color de fondo o de acento (#F7FAFC, #FFFFFF, #FF7043…) y el
 * texto quedaba casi blanco sobre blanco o naranja.
 */
export function textoPlantillaClara(secundario: string, fondo: string = FONDO_CLARO): string {
  const razon = contraste(secundario, fondo);
  return razon !== null && razon >= CONTRASTE_AA ? secundario.toUpperCase() : TEXTO_CLARO_POR_DEFECTO;
}

function plantillaDesdeBase(p: PlantillaBaseSitio): PlantillaCatalogo | null {
  const giro = GIRO_DE_NEGOCIO[p.business_type];
  const inicio = SECCIONES_INICIO_BASE[p.id];
  if (!giro || giro === 'restaurante' || !inicio) return null;
  const oscuro = p.theme_mode === 'dark';
  return {
    id: p.id,
    nombre: p.name,
    descripcion: p.description,
    giro,
    subgiro: null,
    base: p.id,
    inicio,
    porDefecto: p.is_default,
    estilo: {
      id: p.id,
      nombre: p.name,
      giro,
      modo: p.theme_mode,
      fondo: oscuro ? p.colors.secondary.toUpperCase() : FONDO_CLARO,
      texto: oscuro ? TEXTO_OSCURO_SOBRE_FONDO : textoPlantillaClara(p.colors.secondary),
      acento: p.colors.primary.toUpperCase(),
      fuenteTitulos: p.fonts.heading,
      fuenteCuerpo: p.fonts.body,
      radio: 4,
      estiloBoton: 'solido',
      movimiento: 'bajo',
      claseFuentes: claseDeFuentes(p.fonts.heading, p.fonts.body),
    },
  };
}

function plantillaRestaurante(d: DefinicionRestaurante, indice: number): PlantillaCatalogo {
  return {
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion,
    giro: 'restaurante',
    subgiro: d.subgiro,
    base: d.base,
    inicio: d.inicio,
    porDefecto: indice === 0,
    estilo: {
      id: d.id,
      nombre: d.nombre,
      giro: 'restaurante',
      modo: d.modo,
      fondo: d.fondo,
      texto: d.texto,
      acento: d.acento,
      fuenteTitulos: d.fuenteTitulos,
      fuenteCuerpo: d.fuenteCuerpo,
      radio: d.radio,
      estiloBoton: d.estiloBoton,
      movimiento: d.movimiento,
      claseFuentes: d.claseFuentes,
    },
  };
}

/** Catálogo completo: las 8 de restaurante y las plantillas del sitio de los demás giros. */
export function construirCatalogo(bases: readonly PlantillaBaseSitio[]): CatalogoPlantillas {
  const otras = bases.map(plantillaDesdeBase).filter((p): p is PlantillaCatalogo => p !== null);
  return { version: VERSION_CATALOGO_PLANTILLAS, plantillas: [...RESTAURANTE.map(plantillaRestaurante), ...otras] };
}

// ─── Consultas ─────────────────────────────────────────────────────────────────────────────

/** Las del giro, la de por defecto primero; `'todas'` no filtra. */
export function plantillasDelGiro(catalogo: CatalogoPlantillas, giro: GiroCatalogo | 'todas'): PlantillaCatalogo[] {
  if (giro === 'todas') return [...catalogo.plantillas];
  return catalogo.plantillas.filter((p) => p.giro === giro).sort((a, b) => Number(b.porDefecto) - Number(a.porDefecto));
}

/** Contador de cada pestaña de A/06b (sale del catálogo, no de la captura). */
export function contarPorGiro(catalogo: CatalogoPlantillas): Record<GiroCatalogo | 'todas', number> {
  const cuenta = { todas: catalogo.plantillas.length } as Record<GiroCatalogo | 'todas', number>;
  GIROS_CATALOGO.forEach((g) => {
    cuenta[g] = catalogo.plantillas.filter((p) => p.giro === g).length;
  });
  return cuenta;
}

export function plantillaPorId(catalogo: CatalogoPlantillas, id: string | null | undefined): PlantillaCatalogo | null {
  return id ? catalogo.plantillas.find((p) => p.id === id) ?? null : null;
}

/** Presets de estilo del giro (los de sus plantillas). Sin giro: los de todas. */
export function estilosDelGiro(catalogo: CatalogoPlantillas, giro: GiroCatalogo | null): EstiloCatalogo[] {
  return plantillasDelGiro(catalogo, giro ?? 'todas').map((p) => p.estilo);
}

export function estiloPorId(catalogo: CatalogoPlantillas, id: string | null | undefined): EstiloCatalogo | null {
  return plantillaPorId(catalogo, id)?.estilo ?? null;
}

/**
 * Plantilla en uso del borrador («En uso», A/06b):
 * 1. el preset guardado (`tema.preset`), si es una plantilla;
 * 2. `tema.plantillaBase` igual al id de una plantilla (las de los demás giros);
 * 3. entre las que comparten esa base, la que usa la misma fuente de títulos;
 *    si solo una comparte la base, esa.
 * Sin coincidencia clara: `null` (sin insignia; mejor que una falsa).
 */
export function plantillaEnUso(
  catalogo: CatalogoPlantillas,
  tema: { preset?: string | null; plantillaBase?: string | null; fuenteTitulos?: string | null },
): PlantillaCatalogo | null {
  const porPreset = plantillaPorId(catalogo, tema.preset);
  if (porPreset) return porPreset;
  if (!tema.plantillaBase) return null;
  const exacta = plantillaPorId(catalogo, tema.plantillaBase);
  if (exacta && exacta.base === tema.plantillaBase) return exacta;
  const conBase = catalogo.plantillas.filter((p) => p.base === tema.plantillaBase);
  if (conBase.length === 1) return conBase[0];
  return conBase.find((p) => p.estilo.fuenteTitulos === tema.fuenteTitulos) ?? null;
}

/**
 * Preset elegido en Diseño: el guardado; si no, el que tiene el mismo fondo,
 * acento y fuente de títulos; si no, el estilo de la plantilla en uso cuando
 * coincide la fuente de títulos.
 */
export function estiloEnUso(
  estilos: readonly EstiloCatalogo[],
  estilo: Pick<TokensEstilo, 'fondo' | 'acento' | 'fuenteTitulos'> & { preset: string | null },
  enUso: PlantillaCatalogo | null,
): EstiloCatalogo | null {
  const guardado = estilo.preset ? estilos.find((e) => e.id === estilo.preset) : undefined;
  if (guardado) return guardado;
  const igual = estilos.find(
    (e) => e.fondo === estilo.fondo && e.acento === estilo.acento && e.fuenteTitulos === estilo.fuenteTitulos,
  );
  if (igual) return igual;
  return enUso && enUso.estilo.fuenteTitulos === estilo.fuenteTitulos ? enUso.estilo : null;
}

/** Pares tipográficos distintos de una lista de estilos (Tipografía de A/06a), en orden. */
export function paresTipograficos(estilos: readonly EstiloCatalogo[]): { titulos: string; cuerpo: string; clase: ClaseFuentes }[] {
  const vistos = new Set<string>();
  const pares: { titulos: string; cuerpo: string; clase: ClaseFuentes }[] = [];
  estilos.forEach((e) => {
    const clave = `${e.fuenteTitulos}|${e.fuenteCuerpo}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    pares.push({ titulos: e.fuenteTitulos, cuerpo: e.fuenteCuerpo, clase: e.claseFuentes });
  });
  return pares;
}
