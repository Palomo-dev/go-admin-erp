/**
 * Lógica pura de los controles nuevos del encabezado (Figma «Editor · Encabezado píldora, menú
 * inferior y botones», 2026-11-07): el grupo «Píldora» de Diseño (P1) y la vista «Botón principal»
 * (P2). Sin React ni servicios.
 *
 * Regla del contrato (`mapeoAjustes.ts`, todas `porDefecto: null`): sin la clave, el sitio pinta lo
 * de hoy. Por eso cada control muestra el valor efectivo cuando la clave falta y, si se elige
 * justo ese valor, escribe `null` (borra la clave) para no guardar de más. Un valor que no cumple
 * la regla del contrato tampoco se escribe: sale `null`.
 */
import {
  ESTILOS_BOTON_ENCABEZADO,
  ESTILOS_PILDORA,
  FORMAS_BOTON_ENCABEZADO,
  LADOS_ICONO_BOTON,
  LETRAS_PILDORA,
  OPCIONES_SHELL,
  PILDORA_AL_BAJAR,
  POSICIONES_PILDORA,
  TAMANOS_BOTON_ENCABEZADO,
  normalizarOpcionShell,
} from '@/lib/website/v2/mapeoAjustes';

type Ajustes = Record<string, unknown>;

/** Entero dentro del rango de la regla `entero` de la clave; `null` si no es un número. */
export function enteroEnRango(clave: string, v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const regla = OPCIONES_SHELL[clave]?.regla;
  const n = Math.round(v);
  if (!regla || regla.tipo !== 'entero') return n;
  return Math.min(regla.max, Math.max(regla.min, n));
}

// ─── Píldora del menú (P1) ─────────────────────────────────────────────────────────────────────

/** Lo que el sitio pinta sin la clave (contrato, tabla de la píldora). */
export const PILDORA_SIN_CLAVE = {
  header_pill_style: 'vidrio',
  header_pill_glass_opacity: 10,
  header_pill_blur: 24,
  header_pill_border: true,
  header_pill_on_scroll: 'fondo_tema',
  header_pill_text_case: 'versalitas',
  header_pill_position: 'arriba',
} as const;

export interface ValoresPildora {
  header_pill_style: (typeof ESTILOS_PILDORA)[number];
  header_pill_glass_opacity: number;
  header_pill_blur: number;
  header_pill_border: boolean;
  header_pill_on_scroll: (typeof PILDORA_AL_BAJAR)[number];
  header_pill_text_case: (typeof LETRAS_PILDORA)[number];
  header_pill_position: (typeof POSICIONES_PILDORA)[number];
}
export type ClavePildora = keyof ValoresPildora;

export { ESTILOS_PILDORA, LETRAS_PILDORA, PILDORA_AL_BAJAR, POSICIONES_PILDORA };

/** Valor efectivo: el guardado si cumple el contrato; si no, el de hoy. */
export function valorPildora<K extends ClavePildora>(a: Ajustes, clave: K): ValoresPildora[K] {
  const v = normalizarOpcionShell(clave, a[clave]);
  return (v ?? PILDORA_SIN_CLAVE[clave]) as ValoresPildora[K];
}

/** Parche de una clave de la píldora. El valor de hoy (o uno inválido) borra la clave. */
export function cambioPildora<K extends ClavePildora>(clave: K, v: ValoresPildora[K] | null): Ajustes {
  const candidato = typeof v === 'number' ? enteroEnRango(clave, v) : v;
  const valido = candidato === null ? null : normalizarOpcionShell(clave, candidato);
  return { [clave]: valido === null || valido === PILDORA_SIN_CLAVE[clave] ? null : valido };
}

/**
 * Separación del encabezado píldora con el borde (`header_float_offset`). Sin la clave, «la de
 * hoy»: el sitio no la fija en un número (≈ 20 px en la web de referencia del café), así que aquí
 * no hay un valor que «borre» la clave al elegirlo; se vuelve a la de hoy con `null` explícito.
 */
export const SEPARACION_DE_HOY = 20;
export function separacionPildora(a: Ajustes): number | null {
  const v = normalizarOpcionShell('header_float_offset', a.header_float_offset);
  return typeof v === 'number' ? v : null;
}
export function cambioSeparacion(v: number | null): Ajustes {
  return { header_float_offset: enteroEnRango('header_float_offset', v) };
}

// ─── Botón principal (P2) ──────────────────────────────────────────────────────────────────────

/** Las 4 formas en el orden del diseño (Píldora · Redondeado · Cuadrado · Círculo). */
export const FORMAS_BOTON = ['pill', 'rounded', 'square', 'circle'] as const satisfies readonly (typeof FORMAS_BOTON_ENCABEZADO)[number][];
export type FormaBoton = (typeof FORMAS_BOTON)[number];

/** Radio del botón de hoy (`cta_border_radius`, 8 si no está guardado). */
export function radioDeHoy(a: Ajustes): number {
  const r = a.cta_border_radius;
  return typeof r === 'number' && Number.isFinite(r) ? r : 8;
}

/** Forma elegida o `null` = la de hoy (radio `cta_border_radius`, que se respeta tal cual). */
export function formaBoton(a: Ajustes): FormaBoton | null {
  const v = normalizarOpcionShell('header_cta_shape', a.header_cta_shape);
  return typeof v === 'string' ? (v as FormaBoton) : null;
}
export function cambioFormaBoton(v: FormaBoton | null): Ajustes {
  return { header_cta_shape: v === null ? null : normalizarOpcionShell('header_cta_shape', v) };
}

/** Alto de cada tamaño (contrato: 36 / 44 / 50 px). */
export const ALTO_TAMANO = { sm: 36, md: 44, lg: 50 } as const;
export type TamanoBoton = (typeof TAMANOS_BOTON_ENCABEZADO)[number];
export function tamanoBoton(a: Ajustes): TamanoBoton | null {
  const v = normalizarOpcionShell('header_cta_size', a.header_cta_size);
  return typeof v === 'string' ? (v as TamanoBoton) : null;
}
/** `null` = el relleno de hoy. Si el alto guardado es justo el del tamaño nuevo, sobra: se borra. */
export function cambioTamanoBoton(a: Ajustes, v: TamanoBoton | null): Ajustes {
  const valido = v === null ? null : (normalizarOpcionShell('header_cta_size', v) as TamanoBoton | null);
  const cambios: Ajustes = { header_cta_size: valido };
  if (valido && altoBoton(a) === ALTO_TAMANO[valido]) cambios.header_cta_height = null;
  return cambios;
}

/** Ancho fijo con el que arranca «Fijo» (el del diseño). */
export const ANCHO_FIJO_INICIAL = 120;
export function anchoBoton(a: Ajustes): number | null {
  const v = normalizarOpcionShell('header_cta_width', a.header_cta_width);
  return typeof v === 'number' ? v : null;
}
export function cambioModoAncho(a: Ajustes, modo: 'auto' | 'fijo'): Ajustes {
  return { header_cta_width: modo === 'auto' ? null : anchoBoton(a) ?? ANCHO_FIJO_INICIAL };
}
export function cambioAncho(v: number | null): Ajustes {
  return { header_cta_width: enteroEnRango('header_cta_width', v) };
}

export function altoBoton(a: Ajustes): number | null {
  const v = normalizarOpcionShell('header_cta_height', a.header_cta_height);
  return typeof v === 'number' ? v : null;
}
/** Dónde va el deslizador sin alto propio: el del tamaño, o 40 (el botón de hoy). */
export function altoMostrado(a: Ajustes): number {
  const t = tamanoBoton(a);
  return altoBoton(a) ?? (t ? ALTO_TAMANO[t] : 40);
}
/** El alto manda sobre el tamaño; elegir justo el del tamaño elegido borra la clave. */
export function cambioAlto(a: Ajustes, v: number | null): Ajustes {
  const n = enteroEnRango('header_cta_height', v);
  const t = tamanoBoton(a);
  return { header_cta_height: n !== null && t && n === ALTO_TAMANO[t] ? null : n };
}

/** Relleno horizontal (`cta_padding_x`, existente; 16 por defecto). Deslizador 0–40. */
export const RELLENO_X = { min: 0, max: 40, porDefecto: 16 } as const;
export function rellenoX(a: Ajustes): number {
  const v = a.cta_padding_x;
  return typeof v === 'number' && Number.isFinite(v) ? v : RELLENO_X.porDefecto;
}
export function cambioRellenoX(v: number): Ajustes {
  if (!Number.isFinite(v)) return { cta_padding_x: RELLENO_X.porDefecto };
  return { cta_padding_x: Math.min(RELLENO_X.max, Math.max(RELLENO_X.min, Math.round(v))) };
}

export const ESTILOS_BOTON = ESTILOS_BOTON_ENCABEZADO;
export type EstiloBoton = (typeof ESTILOS_BOTON_ENCABEZADO)[number];
/** Sin la clave: sólido con `cta_bg_color` (lo de hoy). */
export function estiloBoton(a: Ajustes): EstiloBoton {
  const v = normalizarOpcionShell('header_cta_style', a.header_cta_style);
  return typeof v === 'string' ? (v as EstiloBoton) : 'solido';
}
export function cambioEstiloBoton(v: EstiloBoton): Ajustes {
  const valido = normalizarOpcionShell('header_cta_style', v);
  return { header_cta_style: valido === 'solido' ? null : valido };
}

/**
 * Íconos del botón principal: nombres de lucide en kebab-case (como `header_icons`), tomados de los
 * que el editor ya usa en el menú inferior y en las acciones del encabezado.
 */
export const ICONOS_BOTON = [
  'calendar-days',
  'calendar-check',
  'phone',
  'message-circle',
  'map-pin',
  'shopping-bag',
  'shopping-cart',
  'package',
  'truck',
  'tag',
  'percent',
  'star',
  'heart',
  'sparkles',
  'user',
  'search',
] as const;
/** Ícono guardado (cualquier nombre válido para el contrato) o `null` = sin ícono. */
export function iconoBoton(a: Ajustes): string | null {
  const v = normalizarOpcionShell('header_cta_icon', a.header_cta_icon);
  return typeof v === 'string' ? v : null;
}
export function cambioIconoBoton(v: string | null): Ajustes {
  return { header_cta_icon: v === null ? null : normalizarOpcionShell('header_cta_icon', v) };
}

export type LadoIcono = (typeof LADOS_ICONO_BOTON)[number];
export const LADOS_ICONO = LADOS_ICONO_BOTON;
/** Sin la clave: izquierda; encima en el círculo. */
export function ladoIconoDeHoy(a: Ajustes): LadoIcono {
  return formaBoton(a) === 'circle' ? 'encima' : 'izquierda';
}
export function ladoIcono(a: Ajustes): LadoIcono {
  const v = normalizarOpcionShell('header_cta_icon_side', a.header_cta_icon_side);
  return typeof v === 'string' ? (v as LadoIcono) : ladoIconoDeHoy(a);
}
export function cambioLadoIcono(a: Ajustes, v: LadoIcono): Ajustes {
  const valido = normalizarOpcionShell('header_cta_icon_side', v);
  return { header_cta_icon_side: valido === ladoIconoDeHoy(a) ? null : valido };
}
/** El lado solo importa si hay ícono: el elegido, o el calendario del círculo que lleva a reservas. */
export function ladoAplica(a: Ajustes): boolean {
  return iconoBoton(a) !== null || formaBoton(a) === 'circle';
}

/** Mayúsculas: `sitio` = sin la clave (lo de hoy, `buttons_uppercase_active`). */
export type Mayusculas = 'sitio' | 'si' | 'no';
export function mayusculasBoton(a: Ajustes): Mayusculas {
  const v = a.header_cta_uppercase;
  return v === true ? 'si' : v === false ? 'no' : 'sitio';
}
export function cambioMayusculas(v: Mayusculas): Ajustes {
  return { header_cta_uppercase: v === 'si' ? true : v === 'no' ? false : null };
}

/** Sombra (`cta_shadow`, existente: none | sm | md | lg; `none` por defecto). */
export const SOMBRAS_BOTON = ['none', 'sm', 'md', 'lg'] as const;
export type SombraBoton = (typeof SOMBRAS_BOTON)[number];
export function sombraBoton(a: Ajustes): SombraBoton {
  const v = a.cta_shadow;
  return typeof v === 'string' && (SOMBRAS_BOTON as readonly string[]).includes(v) ? (v as SombraBoton) : 'none';
}
export function cambioSombra(v: SombraBoton): Ajustes {
  return { cta_shadow: (SOMBRAS_BOTON as readonly string[]).includes(v) ? v : 'none' };
}
