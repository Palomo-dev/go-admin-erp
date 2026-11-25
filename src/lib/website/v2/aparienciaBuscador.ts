/**
 * Apariencia del buscador (Figma «16 Sitio web», sección 3241:99000: panel 3242:99098, plantillas
 * 3247:98931, estados 3248:99253 y lámina de claves y decisiones 3252:99475; aprobado 2026-11-25).
 *
 * Dos objetos en `shell.header.opciones` del documento V2 (sin columnas, ADR-002):
 * - `search_appearance`: computador (o los dos con «Buscador del celular igual al de escritorio»).
 * - `mobile_search_appearance`: celular con el interruptor apagado; vacío o `null` = copia del computador.
 *
 * Reglas:
 * - Cada subclave ausente o inválida = el valor de hoy de la forma elegida (`search_style`). Sin
 *   ninguna subclave visual (ausente, `{}`, solo `preset`) la tienda pinta EXACTAMENTE lo de hoy:
 *   `aparienciaActiva` es falso y ningún componente cambia de camino.
 * - Las plantillas son un atajo: llenan subclaves y después todo se edita («Personalizado (desde …)»).
 * - Sombras: 5 niveles fijos + «al enfocar: un nivel más». El anillo de foco no se apaga.
 * - El dibujo de la lupa NO vive aquí: sigue en `search_icon` (Encabezado › Íconos).
 * - Celular: alto mínimo 44 px, botón siempre pegado y solo ícono, «Todas» se esconde si no cabe.
 *
 * Puro, sin React ni DOM. goadmin-websites guarda una copia IDÉNTICA en
 * `lib/website/v2/aparienciaBuscador.ts` (`npm run verify:copias` allá compara las dos).
 */
import { ajustarHastaContraste, contraste, mezclarHex, normalizarHex } from './contrasteColor';

// ─── Valores admitidos ──────────────────────────────────────────────────────────────────────────

/** Las 7 formas del selector «Buscador» (iguales para computador y celular). */
export const FORMAS_BUSCADOR = ['icon', 'bar', 'mini', 'icon_overlay', 'mega', 'pill_floating', 'hidden'] as const;
export type FormaBuscador = (typeof FORMAS_BUSCADOR)[number];

export const PLANTILLAS_BUSCADOR = ['today', 'minimal', 'pill_button', 'categories', 'floating', 'thick', 'dark', 'tint', 'inset'] as const;
export type PlantillaBuscador = (typeof PLANTILLAS_BUSCADOR)[number];
export const PRESETS_BUSCADOR = [...PLANTILLAS_BUSCADOR, 'custom'] as const;

/** Colores del tema que se pueden elegir sin escribir un hex. */
export const TOKENS_COLOR_BUSCADOR = ['primary', 'accent', 'text', 'border', 'background'] as const;
export type TokenColorBuscador = (typeof TOKENS_COLOR_BUSCADOR)[number];

export const ALTOS_BUSCADOR = ['sm', 'md', 'lg'] as const;
export const ALTO_PX: Readonly<Record<(typeof ALTOS_BUSCADOR)[number], number>> = { sm: 40, md: 44, lg: 48 };
export const ALTO_MIN = 36;
export const ALTO_MAX = 64;
/** Alto mínimo en el celular (tamaño de dedo). */
export const ALTO_MIN_CELULAR = 44;
export const ANCHOS_BUSCADOR = ['auto', 'fill'] as const;
export const ANCHO_MAX_MIN = 160;
export const ANCHO_MAX_MAX = 960;
export const ALINEACIONES_BUSCADOR = ['left', 'center', 'right'] as const;
export const ESTILOS_BORDE_BUSCADOR = ['solid', 'bottom', 'dashed'] as const;
export const ESQUINAS_BUSCADOR = ['square', 'soft', 'rounded', 'pill'] as const;
export type EsquinaBuscador = (typeof ESQUINAS_BUSCADOR)[number];
/** Radio en px de cada esquina; `pill` = media altura (9999). */
export const RADIO_ESQUINA: Readonly<Record<EsquinaBuscador, number>> = { square: 0, soft: 6, rounded: 12, pill: 9999 };
export const RADIO_PX_MAX = 32;
export const SOMBRAS_BUSCADOR = ['none', 'sm', 'md', 'lg', 'inner'] as const;
export type SombraBuscador = (typeof SOMBRAS_BUSCADOR)[number];
export const SOMBRAS_FOCO = ['same', 'up', 'none'] as const;
export const FUENTES_BUSCADOR = ['body', 'heading'] as const;
export const LADOS_ICONO_BUSCADOR = ['left', 'right', 'none'] as const;
export const TAMANOS_ICONO_BUSCADOR = [16, 20, 24] as const;
export const BOTONES_BUSCADOR = ['none', 'icon', 'text', 'icon_text'] as const;
export type BotonBuscador = (typeof BOTONES_BUSCADOR)[number];
export const ESQUINAS_BOTON_BUSCADOR = ['inherit', ...ESQUINAS_BUSCADOR] as const;
export const CATEGORIAS_BUSCADOR = ['auto', 'show', 'hide'] as const;
export const ESTILOS_CATEGORIAS = ['plain', 'boxed'] as const;
export const ESQUINAS_DESPLEGABLE = ['square', 'soft', 'rounded'] as const;
export const SOMBRAS_DESPLEGABLE = ['sm', 'md', 'lg'] as const;
export const LARGO_AYUDA = 60;
export const LARGO_TEXTO_BOTON = 20;
export const LARGO_TEXTO_CATEGORIAS = 20;

/** Textos de hoy de la tienda (la tienda está en español; las plantillas pueden traer otro). */
export const AYUDA_HOY = 'Buscar productos...';
export const TEXTO_BOTON_HOY = 'Buscar';
export const TEXTO_CATEGORIAS_HOY = 'Todas';
/** Color de la ayuda por defecto en TODAS las tiendas (antes #9CA3AF, 2,4:1; aprobado 2026-11-25). */
export const COLOR_AYUDA_HOY = '#6B7280';

/** Lo que se guarda (subclaves en inglés, como el resto de `shell.header.opciones`). */
export interface AparienciaBuscador {
  preset?: (typeof PRESETS_BUSCADOR)[number];
  height?: (typeof ALTOS_BUSCADOR)[number] | number;
  width?: (typeof ANCHOS_BUSCADOR)[number];
  max_width?: number;
  align?: (typeof ALINEACIONES_BUSCADOR)[number];
  border_width?: number;
  border_color?: string;
  border_style?: (typeof ESTILOS_BORDE_BUSCADOR)[number];
  /** Token, hex o `same` (el mismo del borde normal). */
  focus_border_color?: string;
  radius?: EsquinaBuscador;
  radius_px?: number;
  shadow?: SombraBuscador;
  focus_shadow?: (typeof SOMBRAS_FOCO)[number];
  bg?: string;
  text_color?: string;
  placeholder?: string;
  placeholder_color?: string;
  font?: (typeof FUENTES_BUSCADOR)[number];
  icon_side?: (typeof LADOS_ICONO_BUSCADOR)[number];
  icon_color?: string;
  icon_size?: (typeof TAMANOS_ICONO_BUSCADOR)[number];
  button?: BotonBuscador;
  button_text?: string;
  button_bg?: string;
  /** `auto` = blanco o casi negro, el que más contraste dé con el fondo del botón. */
  button_fg?: string;
  button_attached?: boolean;
  button_radius?: (typeof ESQUINAS_BOTON_BUSCADOR)[number];
  categories?: (typeof CATEGORIAS_BUSCADOR)[number];
  categories_style?: (typeof ESTILOS_CATEGORIAS)[number];
  categories_divider?: boolean;
  categories_text?: string;
  focus_ring_color?: string;
  dropdown_radius?: (typeof ESQUINAS_DESPLEGABLE)[number];
  dropdown_shadow?: (typeof SOMBRAS_DESPLEGABLE)[number];
  dropdown_images?: boolean;
  dropdown_prices?: boolean;
}

export type ClaveApariencia = keyof AparienciaBuscador;
/** Subclaves que cambian lo que se ve (todas menos `preset`). */
export const CLAVES_VISUALES: readonly Exclude<ClaveApariencia, 'preset'>[] = [
  'height', 'width', 'max_width', 'align',
  'border_width', 'border_color', 'border_style', 'focus_border_color',
  'radius', 'radius_px', 'shadow', 'focus_shadow',
  'bg', 'text_color', 'placeholder', 'placeholder_color', 'font',
  'icon_side', 'icon_color', 'icon_size',
  'button', 'button_text', 'button_bg', 'button_fg', 'button_attached', 'button_radius',
  'categories', 'categories_style', 'categories_divider', 'categories_text',
  'focus_ring_color',
  'dropdown_radius', 'dropdown_shadow', 'dropdown_images', 'dropdown_prices',
];

// ─── Normalización ──────────────────────────────────────────────────────────────────────────────

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function enLista<T extends string | number>(lista: readonly T[], v: unknown): T | undefined {
  return (lista as readonly unknown[]).includes(v) ? (v as T) : undefined;
}
function entero(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}
function textoCorto(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().replace(/\s+/g, ' ');
  return t && t.length <= max ? t : undefined;
}
function hex(v: unknown): string | undefined {
  return normalizarHex(v) ?? undefined;
}
/** Token del tema o hex (`#RRGGBB`). `extras` admite valores propios (`transparent`, `same`, `auto`). */
function colorOToken(v: unknown, extras: readonly string[] = []): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if ((TOKENS_COLOR_BUSCADOR as readonly string[]).includes(t) || extras.includes(t)) return t;
  return hex(t);
}
function booleano(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Lo guardado → solo las subclaves válidas. `null` si no queda ninguna (ausente, `{}`, basura).
 * Nunca lanza: un documento viejo o editado a mano no rompe la tienda.
 */
export function normalizarAparienciaBuscador(crudo: unknown): AparienciaBuscador | null {
  const o = objeto(crudo);
  if (!o) return null;
  const alto = enLista(ALTOS_BUSCADOR, o.height) ?? entero(o.height, ALTO_MIN, ALTO_MAX);
  const r: AparienciaBuscador = {
    preset: enLista(PRESETS_BUSCADOR, o.preset),
    height: alto,
    width: enLista(ANCHOS_BUSCADOR, o.width),
    max_width: entero(o.max_width, ANCHO_MAX_MIN, ANCHO_MAX_MAX),
    align: enLista(ALINEACIONES_BUSCADOR, o.align),
    border_width: entero(o.border_width, 0, 3),
    border_color: colorOToken(o.border_color),
    border_style: enLista(ESTILOS_BORDE_BUSCADOR, o.border_style),
    focus_border_color: colorOToken(o.focus_border_color, ['same']),
    radius: enLista(ESQUINAS_BUSCADOR, o.radius),
    radius_px: entero(o.radius_px, 0, RADIO_PX_MAX),
    shadow: enLista(SOMBRAS_BUSCADOR, o.shadow),
    focus_shadow: enLista(SOMBRAS_FOCO, o.focus_shadow),
    bg: colorOToken(o.bg, ['transparent']),
    text_color: hex(o.text_color),
    placeholder: textoCorto(o.placeholder, LARGO_AYUDA),
    placeholder_color: hex(o.placeholder_color),
    font: enLista(FUENTES_BUSCADOR, o.font),
    icon_side: enLista(LADOS_ICONO_BUSCADOR, o.icon_side),
    icon_color: colorOToken(o.icon_color),
    icon_size: enLista(TAMANOS_ICONO_BUSCADOR, o.icon_size),
    button: enLista(BOTONES_BUSCADOR, o.button),
    button_text: textoCorto(o.button_text, LARGO_TEXTO_BOTON),
    button_bg: colorOToken(o.button_bg),
    button_fg: o.button_fg === 'auto' ? 'auto' : hex(o.button_fg),
    button_attached: booleano(o.button_attached),
    button_radius: enLista(ESQUINAS_BOTON_BUSCADOR, o.button_radius),
    categories: enLista(CATEGORIAS_BUSCADOR, o.categories),
    categories_style: enLista(ESTILOS_CATEGORIAS, o.categories_style),
    categories_divider: booleano(o.categories_divider),
    categories_text: textoCorto(o.categories_text, LARGO_TEXTO_CATEGORIAS),
    focus_ring_color: colorOToken(o.focus_ring_color),
    dropdown_radius: enLista(ESQUINAS_DESPLEGABLE, o.dropdown_radius),
    dropdown_shadow: enLista(SOMBRAS_DESPLEGABLE, o.dropdown_shadow),
    dropdown_images: booleano(o.dropdown_images),
    dropdown_prices: booleano(o.dropdown_prices),
  };
  const limpio: AparienciaBuscador = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined) (limpio as Record<string, unknown>)[k] = v;
  return Object.keys(limpio).length ? limpio : null;
}

/** Trae al menos una subclave que cambia lo que se ve. Sin ella, la tienda pinta lo de hoy. */
export function aparienciaActiva(a: AparienciaBuscador | null | undefined): a is AparienciaBuscador {
  return !!a && tieneVisuales(a);
}

function tieneVisuales(a: AparienciaBuscador): boolean {
  return CLAVES_VISUALES.some((k) => a[k] !== undefined);
}

export type DispositivoBuscador = 'computador' | 'celular';

/**
 * Apariencia guardada para un dispositivo. Computador: `search_appearance`. Celular: la misma con
 * «igual al de escritorio»; si no, `mobile_search_appearance` y, vacía, la del computador.
 */
export function aparienciaDeDispositivo(ajustes: unknown, dispositivo: DispositivoBuscador): AparienciaBuscador | null {
  const a = objeto(ajustes) ?? {};
  const pc = normalizarAparienciaBuscador(a.search_appearance);
  if (dispositivo === 'computador' || a.mobile_search_same_as_desktop === true) return pc;
  const cel = normalizarAparienciaBuscador(a.mobile_search_appearance);
  return aparienciaActiva(cel) ? cel : pc;
}

/**
 * Ajustes del sitio con `search_appearance` = la del dispositivo. Sin nada que cambiar devuelve
 * el MISMO objeto (la tienda sigue por el camino de hoy). Lo usa la tienda para que el celular
 * lea su apariencia con los mismos lectores que el computador.
 */
export function ajustesConApariencia<T>(ajustes: T, dispositivo: DispositivoBuscador): T {
  const a = objeto(ajustes);
  if (!a || dispositivo === 'computador') return ajustes;
  const propia = aparienciaDeDispositivo(a, dispositivo);
  const actual = normalizarAparienciaBuscador(a.search_appearance);
  if (propia === actual || JSON.stringify(propia) === JSON.stringify(actual)) return ajustes;
  return { ...a, search_appearance: propia } as T;
}

// ─── Valores de hoy por forma y resolución ─────────────────────────────────────────────────────

/** Colores del sitio para los tokens. Sin `accent`, el primario; el resto, los grises de hoy. */
export interface ColoresBuscador {
  primary: string;
  accent?: string | null;
  text?: string | null;
  border?: string | null;
  background?: string | null;
}

/** Todo resuelto a px, hex o CSS: lo que pintan la tienda y la vista previa del editor. */
export interface AparienciaResuelta {
  forma: FormaBuscador;
  dispositivo: DispositivoBuscador;
  alto: number;
  ancho: 'auto' | 'fill';
  anchoMax: number | null;
  alineacion: 'left' | 'center' | 'right' | null;
  bordeAncho: number;
  bordeColor: string;
  bordeHover: string;
  bordeFoco: string;
  bordeEstilo: 'solid' | 'bottom' | 'dashed';
  radio: number;
  sombra: SombraBuscador;
  sombraFoco: SombraBuscador;
  /** Hex o `transparent`. */
  fondo: string;
  texto: string;
  /** Ayuda propia; `null` = la que traiga el lugar (la de hoy o «Buscar en la carta»). */
  ayuda: string | null;
  ayudaColor: string;
  fuente: 'body' | 'heading';
  iconoLado: 'left' | 'right' | 'none';
  iconoColor: string;
  iconoTamano: 16 | 20 | 24;
  boton: BotonBuscador;
  botonTexto: string;
  botonFondo: string;
  botonColor: string;
  botonPegado: boolean;
  botonRadio: number;
  categorias: boolean;
  /** En el celular «Todas» se esconde si la barra no cabe (menos de 360 px). */
  categoriasSiCabe: boolean;
  categoriasEstilo: 'plain' | 'boxed';
  categoriasSeparador: boolean;
  categoriasTexto: string;
  /** Color CSS del anillo de foco (siempre visible). */
  anillo: string;
  desplegableRadio: number;
  desplegableSombra: 'sm' | 'md' | 'lg';
  desplegableImagenes: boolean;
  desplegablePrecios: boolean;
}

/**
 * Lo de hoy de cada forma (lámina D, «Valores por defecto = lo de hoy según la forma»), en
 * subclaves. Ícono e «Ícono que abre encima»: la apariencia aplica al campo que se abre, con los
 * valores de «Barra visible».
 */
export function aparienciaHoy(forma: FormaBuscador): Required<Omit<AparienciaBuscador, 'preset' | 'placeholder' | 'max_width' | 'align' | 'radius_px'>> {
  const base = {
    height: 'md' as NonNullable<AparienciaBuscador['height']>,
    width: 'auto' as const,
    border_width: 1,
    border_color: '#E5E7EB',
    border_style: 'solid' as const,
    focus_border_color: 'primary',
    radius: 'pill' as EsquinaBuscador,
    shadow: 'none' as SombraBuscador,
    focus_shadow: 'same' as const,
    bg: '#F9FAFB',
    text_color: '#111827',
    placeholder_color: COLOR_AYUDA_HOY,
    font: 'body' as const,
    icon_side: 'left' as const,
    icon_color: '#9CA3AF',
    icon_size: 20 as 16 | 20 | 24,
    button: 'none' as BotonBuscador,
    button_text: TEXTO_BOTON_HOY,
    button_bg: 'primary',
    button_fg: 'auto',
    button_attached: true,
    button_radius: 'inherit' as const,
    categories: 'auto' as const,
    categories_style: 'plain' as const,
    categories_divider: true,
    categories_text: TEXTO_CATEGORIAS_HOY,
    focus_ring_color: 'primary',
    dropdown_radius: 'rounded' as const,
    dropdown_shadow: 'lg' as const,
    dropdown_images: true,
    dropdown_prices: true,
  };
  if (forma === 'mini') return { ...base, height: 'sm', radius: 'soft', icon_size: 16 };
  if (forma === 'mega') return { ...base, height: 'lg', radius: 'soft', bg: '#FFFFFF', button: 'icon' };
  if (forma === 'pill_floating') return { ...base, bg: '#FFFFFF', shadow: 'lg' };
  return base;
}

const ORDEN_SOMBRA: readonly SombraBuscador[] = ['none', 'sm', 'md', 'lg'];

/** «Al enfocar: un nivel más». Fuerte sigue fuerte; interior sigue interior. */
export function sombraUnNivelMas(s: SombraBuscador): SombraBuscador {
  if (s === 'inner') return 'inner';
  const i = ORDEN_SOMBRA.indexOf(s);
  return ORDEN_SOMBRA[Math.min(ORDEN_SOMBRA.length - 1, i + 1)];
}

/** Token → hex. Un hex queda igual; `transparent` queda igual. */
export function colorDeTokenBuscador(valor: string, colores: ColoresBuscador): string {
  switch (valor) {
    case 'primary':
      return normalizarHex(colores.primary) ?? '#2563EB';
    case 'accent':
      return normalizarHex(colores.accent) ?? normalizarHex(colores.primary) ?? '#2563EB';
    case 'text':
      return normalizarHex(colores.text) ?? '#111827';
    case 'border':
      return normalizarHex(colores.border) ?? '#E5E7EB';
    case 'background':
      return normalizarHex(colores.background) ?? '#FFFFFF';
    default:
      return valor;
  }
}

/** Blanco o casi negro: el que más contraste da sobre `fondo`. */
export function colorLegibleSobre(fondo: string): string {
  const blanco = contraste('#FFFFFF', fondo) ?? 21;
  const negro = contraste('#111827', fondo) ?? 0;
  return blanco >= negro ? '#FFFFFF' : '#111827';
}

function radioDe(esquina: EsquinaBuscador, px: number | undefined): number {
  if (px !== undefined && esquina !== 'pill') return px;
  return RADIO_ESQUINA[esquina];
}

/**
 * Apariencia guardada + forma + colores → valores concretos. Cada subclave ausente toma lo de hoy
 * de la forma. En el celular: alto mínimo 44 px y botón pegado y solo ícono (decisión 7).
 */
export function resolverApariencia(
  guardada: AparienciaBuscador | null | undefined,
  forma: FormaBuscador,
  colores: ColoresBuscador,
  dispositivo: DispositivoBuscador = 'computador',
): AparienciaResuelta {
  const hoy = aparienciaHoy(forma);
  const g = guardada ?? {};
  const v = <K extends keyof typeof hoy>(k: K): (typeof hoy)[K] => (g[k as ClaveApariencia] ?? hoy[k]) as (typeof hoy)[K];
  const color = (x: string) => colorDeTokenBuscador(x, colores);
  const celular = dispositivo === 'celular';

  const altoCrudo = v('height');
  let alto = typeof altoCrudo === 'number' ? altoCrudo : ALTO_PX[altoCrudo ?? 'md'];
  if (celular) alto = Math.max(alto, ALTO_MIN_CELULAR);

  const esquina = v('radius');
  const radio = radioDe(esquina, g.radius_px);
  const bordeColor = color(v('border_color'));
  const focoCrudo = v('focus_border_color');
  const bordeFoco = focoCrudo === 'same' ? bordeColor : color(focoCrudo);
  const sombra = v('shadow');
  const focoSombra = v('focus_shadow');
  const sombraFoco = focoSombra === 'up' ? sombraUnNivelMas(sombra) : focoSombra === 'none' ? 'none' : sombra;
  const fondoCrudo = v('bg');
  const fondo = fondoCrudo === 'transparent' ? 'transparent' : color(fondoCrudo);

  let boton = v('button');
  let pegado = v('button_attached');
  if (celular && boton !== 'none') {
    boton = 'icon';
    pegado = true;
  }
  const botonFondo = color(v('button_bg'));
  const fg = v('button_fg');
  const botonColor = fg === 'auto' ? colorLegibleSobre(botonFondo) : fg;
  const radioBoton = v('button_radius');
  const botonRadio =
    radioBoton === 'inherit'
      ? pegado && !celular
        ? radio >= 9999 ? 9999 : Math.max(0, radio - 4)
        : radio
      : RADIO_ESQUINA[radioBoton];

  const cats = v('categories');
  const categorias = cats === 'show' || (cats === 'auto' && forma === 'mega');
  const anilloCrudo = g.focus_ring_color;
  const anillo = anilloCrudo ? color(anilloCrudo) : `color-mix(in srgb, ${color('primary')} 40%, transparent)`;
  const desplegable = v('dropdown_radius');

  return {
    forma,
    dispositivo,
    alto,
    ancho: v('width'),
    anchoMax: g.max_width ?? null,
    alineacion: g.align ?? null,
    bordeAncho: v('border_width'),
    bordeColor,
    bordeHover: mezclarHex(bordeColor, '#000000', 0.15),
    bordeFoco,
    bordeEstilo: v('border_style'),
    radio,
    sombra,
    sombraFoco,
    fondo,
    texto: v('text_color'),
    ayuda: g.placeholder ?? null,
    ayudaColor: v('placeholder_color'),
    fuente: v('font'),
    iconoLado: v('icon_side'),
    iconoColor: color(v('icon_color')),
    iconoTamano: v('icon_size'),
    boton,
    botonTexto: v('button_text'),
    botonFondo,
    botonColor,
    botonPegado: pegado,
    botonRadio,
    categorias,
    categoriasSiCabe: celular,
    categoriasEstilo: v('categories_style'),
    categoriasSeparador: v('categories_divider'),
    categoriasTexto: v('categories_text'),
    anillo,
    desplegableRadio: desplegable === 'square' ? 0 : desplegable === 'soft' ? 6 : 12,
    desplegableSombra: v('dropdown_shadow'),
    desplegableImagenes: v('dropdown_images'),
    desplegablePrecios: v('dropdown_prices'),
  };
}

// ─── CSS (la tienda y la vista previa del editor pintan con lo mismo) ────────────────────────────

/** Las 5 sombras fijas (las de Tailwind sm/md/lg/inner). */
export const SOMBRA_CSS: Readonly<Record<SombraBuscador, string>> = {
  none: '0 0 #0000',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.06)',
};
export const SOMBRA_DESPLEGABLE_CSS: Readonly<Record<'sm' | 'md' | 'lg', string>> = {
  sm: SOMBRA_CSS.md,
  md: SOMBRA_CSS.lg,
  lg: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
};

/**
 * Variables CSS de la barra. Los estados los ponen clases que las leen:
 * hover → `--bq-borde-hover`; foco → `--bq-borde-foco` y `--bq-sombra-foco` (incluye el anillo de 2 px).
 */
export function variablesApariencia(r: AparienciaResuelta): Record<string, string> {
  return {
    '--bq-alto': `${r.alto}px`,
    '--bq-fondo': r.fondo,
    '--bq-borde': r.bordeColor,
    '--bq-borde-hover': r.bordeHover,
    '--bq-borde-foco': r.bordeFoco,
    '--bq-sombra': SOMBRA_CSS[r.sombra],
    '--bq-sombra-foco': `${SOMBRA_CSS[r.sombraFoco]}, 0 0 0 2px ${r.anillo}`,
    '--bq-texto': r.texto,
    '--bq-ayuda': r.ayudaColor,
    '--bq-icono': r.iconoColor,
    '--bq-boton-fondo': r.botonFondo,
    '--bq-boton-texto': r.botonColor,
  };
}

/** Caja de la barra: alto, fondo, borde, esquinas, fuente y ancho. Valores CSS listos para `style`. */
export function estiloCajaApariencia(r: AparienciaResuelta, anchoTope?: number | null): Record<string, string | number> {
  const estilo: Record<string, string | number> = {
    height: r.alto,
    backgroundColor: r.fondo,
    borderStyle: r.bordeEstilo === 'dashed' ? 'dashed' : 'solid',
    borderWidth: r.bordeEstilo === 'bottom' ? `0 0 ${r.bordeAncho}px 0` : r.bordeAncho,
    borderRadius: r.bordeEstilo === 'bottom' ? 0 : r.radio,
  };
  if (r.fuente === 'heading') estilo.fontFamily = 'var(--font-heading), inherit';
  if (r.ancho === 'fill') {
    estilo.width = '100%';
    estilo.maxWidth = 'none';
  } else {
    const tope = r.anchoMax ?? anchoTope ?? null;
    if (tope) estilo.maxWidth = tope;
  }
  if (r.alineacion === 'center') {
    estilo.marginLeft = 'auto';
    estilo.marginRight = 'auto';
  } else if (r.alineacion === 'right') {
    estilo.marginLeft = 'auto';
  } else if (r.alineacion === 'left') {
    estilo.marginRight = 'auto';
  }
  return estilo;
}

/** Relleno del campo según la lupa: deja lugar al ícono y nunca pega el texto al borde. */
export function rellenoCampo(r: AparienciaResuelta): { paddingLeft: number; paddingRight: number } {
  const lupa = r.iconoTamano + 12 + 8;
  return {
    paddingLeft: r.iconoLado === 'left' ? lupa : 12,
    paddingRight: r.iconoLado === 'right' ? lupa : 12,
  };
}

// ─── Contraste (decisión 6: aviso con sugerencia, nunca bloqueo) ───────────────────────────────

export interface AvisoContraste {
  campo: 'texto' | 'ayuda' | 'boton';
  razon: number;
  minimo: number;
  /** Color que sí cumple, con el mismo matiz (`ajustarHastaContraste`). */
  sugerido: string | null;
}

/**
 * Pares que se leen mal: texto/fondo, ayuda/fondo y botón (ícono o texto)/fondo del botón. Con
 * fondo transparente se mide contra el fondo del encabezado (`fondoDetras`, blanco si falta).
 */
export function avisosContraste(r: AparienciaResuelta, fondoDetras = '#FFFFFF'): AvisoContraste[] {
  const fondo = r.fondo === 'transparent' ? normalizarHex(fondoDetras) ?? '#FFFFFF' : r.fondo;
  const avisos: AvisoContraste[] = [];
  const revisar = (campo: AvisoContraste['campo'], color: string, sobre: string, minimo: number) => {
    const razon = contraste(color, sobre);
    if (razon !== null && razon < minimo) avisos.push({ campo, razon, minimo, sugerido: ajustarHastaContraste(color, sobre, minimo) });
  };
  revisar('texto', r.texto, fondo, 4.5);
  revisar('ayuda', r.ayudaColor, fondo, 4.5);
  // Un ícono solo es un objeto gráfico (3:1); con texto, 4,5:1.
  if (r.boton !== 'none') revisar('boton', r.botonColor, r.botonFondo, r.boton === 'icon' ? 3 : 4.5);
  return avisos;
}

// ─── Plantillas (decisión 1: atajo que llena ajustes; después todo se edita) ───────────────────

/** Subclaves de cada plantilla (galería B, 3247:98931). «Hoy» no trae ninguna: es lo de hoy. */
export const PLANTILLAS_VALORES: Readonly<Record<PlantillaBuscador, Omit<AparienciaBuscador, 'preset'>>> = {
  today: {},
  minimal: {
    height: 'md', border_width: 1, border_style: 'bottom', border_color: '#D1D5DB', radius: 'square', bg: 'transparent',
    icon_side: 'left', icon_color: '#6B7280', placeholder: '¿Qué estás buscando?', placeholder_color: '#6B7280', button: 'none',
  },
  pill_button: {
    height: 'md', border_width: 1, border_color: '#D1D5DB', radius: 'pill', shadow: 'sm', bg: '#FFFFFF',
    icon_side: 'none', button: 'icon', button_attached: true, button_radius: 'pill', button_bg: 'primary',
  },
  categories: {
    height: 'lg', border_width: 2, border_color: '#F97316', radius: 'soft', bg: '#FFFFFF',
    categories: 'show', categories_style: 'plain', categories_divider: true,
    icon_side: 'none', button: 'icon', button_attached: true, button_radius: 'soft', button_bg: '#F97316',
  },
  floating: {
    height: 'md', border_width: 0, radius: 'rounded', radius_px: 12, shadow: 'lg', bg: '#FFFFFF',
    icon_side: 'left', icon_color: 'primary', button: 'text', button_text: 'Buscar', button_attached: false, button_bg: '#0F172A',
  },
  thick: {
    height: 'lg', border_width: 3, border_color: '#111827', radius: 'square', bg: '#FFFFFF',
    icon_side: 'left', icon_color: '#111827', placeholder_color: '#374151',
    button: 'icon_text', button_attached: true, button_radius: 'square', button_bg: '#111827',
  },
  dark: {
    height: 'md', border_width: 1, border_color: '#334155', radius: 'rounded', radius_px: 10, bg: '#1E293B',
    text_color: '#FFFFFF', placeholder_color: '#94A3B8', icon_side: 'right', icon_color: '#94A3B8', button: 'none',
  },
  tint: {
    height: 'md', border_width: 0, radius: 'rounded', radius_px: 10, bg: '#EFF6FF',
    icon_side: 'left', icon_color: 'primary', placeholder_color: '#475569', button: 'none',
  },
  inset: {
    height: 'md', border_width: 0, radius: 'soft', radius_px: 8, shadow: 'inner', bg: '#F1F5F9',
    icon_side: 'left', icon_color: '#6B7280', placeholder_color: '#475569', button: 'none',
  },
};

/** Aplicar una plantilla: reemplaza toda la apariencia del dispositivo. «Hoy» la deja vacía. */
export function aplicarPlantilla(id: PlantillaBuscador): AparienciaBuscador {
  return { preset: id, ...PLANTILLAS_VALORES[id] };
}

function visuales(a: AparienciaBuscador | null | undefined): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (!a) return r;
  for (const k of CLAVES_VISUALES) if (a[k] !== undefined) r[k] = a[k];
  return r;
}

function iguales(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/**
 * Plantilla de la que viene la apariencia y si se tocó después («Personalizado (desde …)»).
 * Sin nada guardado: «Hoy». Sin plantilla y con ajustes: personalizada sin origen.
 */
export function estadoPlantilla(a: AparienciaBuscador | null | undefined): { base: PlantillaBuscador | null; personalizada: boolean } {
  const n = normalizarAparienciaBuscador(a);
  const propios = visuales(n);
  const preset = n?.preset && n.preset !== 'custom' ? n.preset : null;
  if (!preset) return Object.keys(propios).length ? { base: null, personalizada: true } : { base: 'today', personalizada: false };
  return { base: preset, personalizada: !iguales(propios, visuales(PLANTILLAS_VALORES[preset])) };
}

/**
 * Cambia subclaves de una apariencia (`undefined`/`null` = quitarla y volver a lo de hoy). Conserva
 * la plantilla de origen. Devuelve `null` si no queda nada que guardar.
 */
export function cambiarApariencia(
  actual: AparienciaBuscador | null | undefined,
  cambios: Partial<Record<ClaveApariencia, unknown>>,
): AparienciaBuscador | null {
  const base: Record<string, unknown> = { ...(normalizarAparienciaBuscador(actual) ?? {}) };
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined || v === null) delete base[k];
    else base[k] = v;
  }
  const n = normalizarAparienciaBuscador(base);
  if (!n) return null;
  if (!tieneVisuales(n) && (!n.preset || n.preset === 'today' || n.preset === 'custom')) return null;
  return n;
}
