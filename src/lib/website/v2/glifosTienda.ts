/**
 * Íconos con más estilos (Figma «16 Sitio web», propuesta 8 `2852:70951`, aprobada 2026-11-23):
 * el dibujo de cada ícono de la cabecera y del menú inferior, y su «Estilo de los íconos».
 *
 * Librería: Phosphor (licencia MIT), unos 1.500 íconos en 6 pesos (thin, light, regular, bold,
 * fill y duotone). Los nombres de Lucide que ya guardan las tiendas («cart», «shopping-bag»…) se
 * siguen leyendo igual (decisión técnica `2852:71426`).
 *
 * Cómo se guarda (documento V2, sin columnas nuevas):
 * - Menú inferior: `mobile_header.bottom_nav.items[].icon` admite `{ set: 'phosphor', name, weight? }`
 *   además del texto de siempre, y `mobile_header.bottom_nav.style.iconStyle` (ver {@link EstiloGlifos}).
 * - Cabecera: `header_iconos.glifos[icono]` (el mismo objeto, por ícono) y `header_iconos.iconStyle`.
 *
 * La regla de siempre: sin `iconStyle` y con nombres de Lucide, la tienda pinta exactamente lo de
 * hoy (mismo dibujo, mismo trazo, sin fondo ni sombra). Cada lector devuelve `null` cuando no hay
 * nada válido y quien pinta sigue el camino de hoy.
 *
 * Código puro y sin imports: lo usan el editor (ERP), la tienda y sus pruebas. goadmin-websites
 * guarda una copia IDÉNTICA en `lib/website/v2/glifosTienda.ts` (`npm run verify:copias`).
 */

// ─── Pesos, grosor, sombra, fondo y alcance ─────────────────────────────────────────────────

/** Pesos reales de Phosphor (los 6). Es lo que se guarda en `weight`. */
export const PESOS_GLIFO = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;
export type PesoGlifo = (typeof PESOS_GLIFO)[number];

/** Las cuatro tarjetas «Estilo» del editor: Línea, Relleno, Duotono y Línea gruesa. */
export const ESTILOS_GLIFO = ['linea', 'relleno', 'duotono', 'gruesa'] as const;
export type EstiloGlifo = (typeof ESTILOS_GLIFO)[number];

/** «Grosor» del editor: fino (light), normal (regular) o grueso (bold). Solo en Línea. */
export const GROSORES_GLIFO = ['fino', 'normal', 'grueso'] as const;
export type GrosorGlifo = (typeof GROSORES_GLIFO)[number];

export const SOMBRAS_GLIFO = ['none', 'soft', 'strong'] as const;
export type SombraGlifo = (typeof SOMBRAS_GLIFO)[number];

export const FORMAS_FONDO_GLIFO = ['none', 'circle', 'square'] as const;
export type FormaFondoGlifo = (typeof FORMAS_FONDO_GLIFO)[number];

/** «Igual para todos» o «Propio por botón» (cada ícono con su propio peso). */
export const ALCANCES_GLIFO = ['all', 'item'] as const;
export type AlcanceGlifo = (typeof ALCANCES_GLIFO)[number];

/** Tamaño del glifo en px (deslizador del editor). Sin la clave, el de hoy. */
export const TAMANO_GLIFO_MIN = 14;
export const TAMANO_GLIFO_MAX = 36;

/** Grosor del trazo de Lucide para cada peso (los nombres de siempre no tienen pesos reales). */
export const TRAZO_LUCIDE: Readonly<Record<'thin' | 'light' | 'regular' | 'bold', number>> = {
  thin: 1.25,
  light: 1.5,
  regular: 2,
  bold: 2.5,
};

/** Un ícono del catálogo nuevo. `name` en PascalCase de Phosphor («ShoppingCart»). */
export interface RefGlifo {
  set: 'phosphor';
  name: string;
  /** Peso propio del ícono (vale con «Propio por botón» o si no hay estilo general). */
  weight?: PesoGlifo;
}

/** «Estilo de los íconos». Cada clave es opcional: sin ella, lo de hoy. */
export interface EstiloGlifos {
  weight?: PesoGlifo;
  size?: number;
  shadow?: SombraGlifo;
  bg?: { shape: FormaFondoGlifo; color?: string };
  /** Menú inferior: color del ícono activo e inactivo. */
  active?: string;
  inactive?: string;
  scope?: AlcanceGlifo;
}

// ─── Lectores ────────────────────────────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** Nombre de Phosphor: PascalCase, letras y números (así nunca arma una ruta rara). */
const NOMBRE_PHOSPHOR = /^[A-Z][A-Za-z0-9]{1,63}$/;

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function enLista<T extends string>(lista: readonly T[], v: unknown): T | undefined {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : undefined;
}
function colorHex(v: unknown): string | undefined {
  return typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : undefined;
}

/** `true` si el nombre tiene forma de nombre de Phosphor. */
export function nombrePhosphorValido(v: unknown): v is string {
  return typeof v === 'string' && NOMBRE_PHOSPHOR.test(v);
}

/** `{ set: 'phosphor', name, weight? }` válido, o `null` (un texto es un nombre de Lucide). */
export function leerRefGlifo(v: unknown): RefGlifo | null {
  const o = objeto(v);
  if (!o || o.set !== 'phosphor' || !nombrePhosphorValido(o.name)) return null;
  const weight = enLista(PESOS_GLIFO, o.weight);
  return { set: 'phosphor', name: o.name, ...(weight ? { weight } : {}) };
}

/** Forma guardada de un ícono del catálogo nuevo (sin claves vacías). */
export function refAGuardar(r: RefGlifo): Record<string, unknown> {
  return { set: 'phosphor', name: r.name, ...(r.weight ? { weight: r.weight } : {}) };
}

/** «Estilo de los íconos» válido, o `null` si no trae nada (la tienda de hoy). */
export function leerEstiloGlifos(v: unknown): EstiloGlifos | null {
  const o = objeto(v);
  if (!o) return null;
  const r: EstiloGlifos = {};
  const weight = enLista(PESOS_GLIFO, o.weight);
  if (weight) r.weight = weight;
  if (typeof o.size === 'number' && Number.isInteger(o.size) && o.size >= TAMANO_GLIFO_MIN && o.size <= TAMANO_GLIFO_MAX) r.size = o.size;
  const shadow = enLista(SOMBRAS_GLIFO, o.shadow);
  if (shadow && shadow !== 'none') r.shadow = shadow;
  const bg = objeto(o.bg);
  const forma = bg ? enLista(FORMAS_FONDO_GLIFO, bg.shape) : undefined;
  if (forma && forma !== 'none') {
    const color = colorHex(bg?.color);
    r.bg = { shape: forma, ...(color ? { color } : {}) };
  }
  const active = colorHex(o.active);
  if (active) r.active = active;
  const inactive = colorHex(o.inactive);
  if (inactive) r.inactive = inactive;
  const scope = enLista(ALCANCES_GLIFO, o.scope);
  if (scope === 'item') r.scope = scope;
  return Object.keys(r).length > 0 ? r : null;
}

/** Forma guardada del estilo; `null` si quedó como hoy (no se escribe la clave). */
export function estiloGlifosAGuardar(e: EstiloGlifos | null | undefined): Record<string, unknown> | null {
  const limpio = leerEstiloGlifos(e ?? null);
  if (!limpio) return null;
  const o: Record<string, unknown> = { ...limpio };
  if (limpio.bg) o.bg = { ...limpio.bg };
  return o;
}

// ─── Editor: tarjeta «Estilo» y «Grosor» ↔ peso guardado ──────────────────────────────────────

/** Tarjeta marcada para un peso (sin peso, Línea: lo de hoy). */
export function estiloDePeso(peso: PesoGlifo | undefined): EstiloGlifo {
  if (peso === 'fill') return 'relleno';
  if (peso === 'duotone') return 'duotono';
  if (peso === 'bold') return 'gruesa';
  return 'linea';
}

/** Grosor marcado para un peso. Relleno y Duotono no tienen grosor (`null`). */
export function grosorDePeso(peso: PesoGlifo | undefined): GrosorGlifo | null {
  if (peso === 'fill' || peso === 'duotone') return null;
  if (peso === 'thin' || peso === 'light') return 'fino';
  if (peso === 'bold') return 'grueso';
  return 'normal';
}

/** Peso que guarda una tarjeta (Línea conserva el grosor fino si ya lo tenía). */
export function pesoDeEstilo(estilo: EstiloGlifo, actual?: PesoGlifo): PesoGlifo {
  if (estilo === 'relleno') return 'fill';
  if (estilo === 'duotono') return 'duotone';
  if (estilo === 'gruesa') return 'bold';
  return actual === 'thin' || actual === 'light' ? actual : 'regular';
}

/** Peso que guarda el «Grosor» (solo en Línea). */
export function pesoDeGrosor(grosor: GrosorGlifo): PesoGlifo {
  return grosor === 'fino' ? 'light' : grosor === 'grueso' ? 'bold' : 'regular';
}

// ─── Lucide de siempre → Phosphor ────────────────────────────────────────────────────────────

/**
 * Nombres de Lucide que guardan las tiendas (cabecera: ICON_MAP; menú inferior: ICONOS_MENU) y
 * su dibujo equivalente en Phosphor. Solo se usa con Relleno o Duotono (Lucide no tiene esos
 * pesos): con Línea, el dibujo de Lucide se queda. Un nombre fuera de la lista se pinta como hoy.
 */
export const EQUIVALENTE_PHOSPHOR: Readonly<Record<string, string>> = {
  home: 'House',
  grid: 'SquaresFour',
  search: 'MagnifyingGlass',
  'search-lg': 'MagnifyingGlass',
  'zoom-in': 'MagnifyingGlassPlus',
  binoculars: 'Binoculars',
  bag: 'ShoppingBag',
  'shopping-bag': 'ShoppingBag',
  cart: 'ShoppingCart',
  'shopping-cart': 'ShoppingCart',
  basket: 'Basket',
  'shopping-basket': 'Basket',
  store: 'Storefront',
  package: 'Package',
  gift: 'Gift',
  user: 'User',
  'user-round': 'User',
  'user-circle': 'UserCircle',
  'circle-user': 'UserCircle',
  'circle-user-round': 'UserCircle',
  'log-in': 'SignIn',
  menu: 'List',
  list: 'ListBullets',
  phone: 'Phone',
  whatsapp: 'ChatCircle',
  'map-pin': 'MapPin',
  calendar: 'CalendarDots',
  'calendar-check': 'CalendarCheck',
  truck: 'Truck',
  tag: 'Tag',
  percent: 'Percent',
  star: 'Star',
  heart: 'Heart',
  sparkles: 'Sparkle',
  link: 'LinkSimpleHorizontal',
  globe: 'Globe',
  languages: 'Translate',
  coins: 'Coins',
  wallet: 'Wallet',
  banknote: 'Money',
  'dollar-sign': 'CurrencyDollar',
  'circle-dollar-sign': 'CurrencyCircleDollar',
};

// ─── Qué se pinta ────────────────────────────────────────────────────────────────────────────

/** Trazo de Lucide que pisa el de hoy. `null` = no se toca (lo de hoy). */
export interface TrazoLucide {
  strokeWidth?: number;
  fill?: 'currentColor';
  fillOpacity?: number;
}

export type DibujoGlifo =
  | { tipo: 'phosphor'; name: string; weight: PesoGlifo }
  | { tipo: 'lucide'; trazo: TrazoLucide | null };

/**
 * Peso de un ícono del catálogo nuevo: con «Propio por botón», el suyo; si no, el del estilo
 * general (y el suyo si no hay estilo). Sin nada, Línea.
 */
export function pesoEfectivo(ref: RefGlifo | null | undefined, estilo: EstiloGlifos | null | undefined): PesoGlifo {
  if (estilo?.scope === 'item') return ref?.weight ?? estilo.weight ?? 'regular';
  return estilo?.weight ?? ref?.weight ?? 'regular';
}

/**
 * Qué dibujo se pinta:
 * 1. Un ícono del catálogo nuevo: Phosphor con su peso.
 * 2. Un nombre de Lucide con Relleno o Duotono y con equivalente: Phosphor en ese peso (Lucide no
 *    los tiene; Figma 8c M2 y M3).
 * 3. El resto: Lucide, el de hoy. Con un peso elegido cambia solo el trazo; sin estilo, nada.
 */
export function dibujoGlifo(ref: RefGlifo | null | undefined, nombreLucide: string | null | undefined, estilo: EstiloGlifos | null | undefined): DibujoGlifo {
  if (ref) return { tipo: 'phosphor', name: ref.name, weight: pesoEfectivo(ref, estilo) };
  const peso = estilo?.weight;
  if (!peso) return { tipo: 'lucide', trazo: null };
  const equivalente = nombreLucide ? EQUIVALENTE_PHOSPHOR[nombreLucide] : undefined;
  if ((peso === 'fill' || peso === 'duotone') && equivalente) return { tipo: 'phosphor', name: equivalente, weight: peso };
  if (peso === 'fill') return { tipo: 'lucide', trazo: { fill: 'currentColor', strokeWidth: 1.25 } };
  if (peso === 'duotone') return { tipo: 'lucide', trazo: { fill: 'currentColor', fillOpacity: 0.28, strokeWidth: TRAZO_LUCIDE.regular } };
  return { tipo: 'lucide', trazo: { strokeWidth: TRAZO_LUCIDE[peso] } };
}

/** Nombre del archivo de Phosphor (`ShoppingCart` → `shopping-cart`). */
export function kebabPhosphor(nombre: string): string {
  return nombre.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
}

/**
 * Ruta del dibujo en la tienda (`app/api/iconos/[peso]/[nombre]`): un SVG con un `<symbol id="g">`
 * que se pinta con `<use href="…#g">` y toma el color del texto. Solo se descarga el ícono usado.
 */
export function rutaGlifo(nombre: string, peso: PesoGlifo): string {
  return `/api/iconos/${peso}/${nombre}.svg`;
}

/** Sombra del ícono (`filter`) o de su fondo (`box-shadow`). `null` = sin sombra (hoy). */
export function sombraGlifo(estilo: EstiloGlifos | null | undefined, conFondo: boolean): string | null {
  const s = estilo?.shadow;
  if (!s || s === 'none') return null;
  if (conFondo) return s === 'soft' ? '0 1px 3px rgba(15,23,42,0.18)' : '0 4px 10px rgba(15,23,42,0.32)';
  return s === 'soft' ? 'drop-shadow(0 1px 1.5px rgba(15,23,42,0.28))' : 'drop-shadow(0 2px 3px rgba(15,23,42,0.5))';
}

/** Radio del fondo: círculo o cuadrado redondeado. */
export function radioFondoGlifo(forma: FormaFondoGlifo): string {
  return forma === 'circle' ? '9999px' : '28%';
}

// ─── Cabecera ────────────────────────────────────────────────────────────────────────────────

/** Los íconos de la cabecera con dibujo propio (mismas claves que `header_iconos.por_icono`). */
export const ICONOS_CABECERA_GLIFO = ['buscar', 'favoritos', 'carrito', 'cuenta', 'moneda'] as const;
export type IconoCabeceraGlifo = (typeof ICONOS_CABECERA_GLIFO)[number];

/** Dibujos del catálogo nuevo elegidos para la cabecera (`header_iconos.glifos`). */
export function glifosCabecera(ajustes: Record<string, unknown> | null | undefined): Partial<Record<IconoCabeceraGlifo, RefGlifo>> {
  const crudo = objeto(objeto((ajustes ?? {}).header_iconos)?.glifos) ?? {};
  const r: Partial<Record<IconoCabeceraGlifo, RefGlifo>> = {};
  for (const clave of ICONOS_CABECERA_GLIFO) {
    const ref = leerRefGlifo(crudo[clave]);
    if (ref) r[clave] = ref;
  }
  return r;
}

/** «Estilo de los íconos» de la cabecera (`header_iconos.iconStyle`), o `null` (hoy). */
export function estiloGlifosCabecera(ajustes: Record<string, unknown> | null | undefined): EstiloGlifos | null {
  return leerEstiloGlifos(objeto((ajustes ?? {}).header_iconos)?.iconStyle);
}
