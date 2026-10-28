/**
 * «Ajustes de versiones anteriores» por clave y con dependencias (QA 27-oct).
 *
 * Regla: «Quitar» nunca borra algo que la tienda use por otra opción vigente.
 * - `mobile_header` se lista por partes (panel, disposición, íconos, buscador, barra inferior).
 *   Si quitar una parte haría que el celular deje el encabezado configurable (en la tienda,
 *   `leerPresentacionMovil` → `usarHeaderNuevo`), esa parte queda «en uso» y no se ofrece quitarla:
 *   en Run Sneak (345) quitar `icons` borraba el círculo y la cuenta del celular.
 * - Los íconos en círculo del celular (`mobile_header.icons.style = 'circle'`) se ven y se cambian
 *   en «Círculo acento» (una opción para computador y celular): se listan como migrados.
 * - Las claves de celular que «siguen al computador» (`null` en la tienda) se quitan con `null`,
 *   no con el default, para que sigan a la opción del panel.
 * - Pie: Horario y Redes del celular solo se listan si difieren de los del computador; quitar
 *   los iguala a los del computador.
 */
import { OPCIONES_SHELL } from '@/lib/website/v2/mapeoAjustes';
import { opcionBooleana } from './zonaGlobalLogica';

export interface EntradaAnterior {
  /** Clave de texto (`zonaGlobal.anteriores.clave.<id>`). */
  id: string;
  /** Cambio que quita el ajuste, o `null` si la tienda lo usa por una opción vigente. */
  quitar: Record<string, unknown> | null;
  /** Por qué no se puede quitar. */
  motivo?: 'enUso' | 'circulo' | 'mandaEspaciado' | 'mandaAncho' | 'sinEfecto' | 'mandaCarrusel' | 'tituloEncabezado' | 'pasaABanners';
  /** Interruptores que siguen editables (sin equivalente en el panel nuevo; auditoría 27-oct, 6). */
  editables?: { clave: string; valor: boolean; cambio: (v: boolean) => Record<string, unknown> }[];
}

function conEditables(h: Record<string, unknown>, parte: string): Pick<EntradaAnterior, 'editables'> {
  const e = editablesMovil(h, parte);
  return e.length > 0 ? { editables: e } : {};
}

/** Interruptores de una parte de `mobile_header` (p. ej. `layout.sticky`): se editan sin borrar el resto. */
function editablesMovil(h: Record<string, unknown>, parte: string): NonNullable<EntradaAnterior['editables']> {
  const o = objeto(h[parte]);
  if (!o) return [];
  return Object.entries(o)
    .filter(([, v]) => typeof v === 'boolean')
    .map(([k, v]) => ({
      clave: k,
      valor: v as boolean,
      cambio: (nuevo: boolean) => ({ mobile_header: { ...h, [parte]: { ...o, [k]: nuevo } } }),
    }));
}

const ESTILOS_MENU_NUEVOS = ['drawer_left', 'drawer_right', 'top_dropdown', 'none'];
// `bottom_nav` ya se edita en «Menú inferior tipo app» (panel Encabezado › Celular).
export const PARTES_MOVIL = ['panel', 'layout', 'icons', 'search'] as const;
/** Claves del celular que, en `null`, siguen a su par de computador en la tienda (`opcionUnica.ts`). */
export const SIGUEN_A_COMPUTADOR: Readonly<Record<string, string>> = {
  mobile_search_style: 'search_style',
  mobile_show_topbar: 'show_topbar',
};

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const vacio = (v: unknown) => v === null || v === undefined || v === '';

/** Copia de `usarHeaderNuevo` de la tienda (lib/website/menuMovil.ts), sin validar cada parte. */
export function usaEncabezadoMovilNuevo(mobileHeader: unknown, estiloMenu: unknown): boolean {
  const estilo = typeof estiloMenu === 'string' ? estiloMenu : 'drawer';
  if (ESTILOS_MENU_NUEVOS.includes(estilo)) return true;
  const h = objeto(mobileHeader);
  if (!h) return false;
  if (objeto(h.panel) || objeto(h.layout) || objeto(h.icons) || (typeof h.search === 'string' && h.search)) return true;
  const barra = objeto(h.bottom_nav);
  return Boolean(barra && barra.enabled === true && estilo === 'tabs');
}

function sinPartes(h: Record<string, unknown>, partes: readonly string[]): Record<string, unknown> | null {
  const resto = Object.fromEntries(Object.entries(h).filter(([k]) => !partes.includes(k)));
  return Object.keys(resto).length > 0 ? resto : null;
}

/** ¿Los íconos del celular solo piden el círculo (lo que hace «Círculo acento»)? */
export function iconosSoloCirculo(mobileHeader: unknown): boolean {
  const i = objeto(objeto(mobileHeader)?.icons);
  return !!i && i.style === 'circle';
}

/** Círculo acento: encendido si lo pide el computador o los íconos viejos del celular. */
export function circuloAcentoActivo(a: Record<string, unknown>): boolean {
  return opcionBooleana(a, 'header_icons_circle') || iconosSoloCirculo(a.mobile_header);
}

/**
 * Cambio de «Círculo acento» para los dos dispositivos. Al apagarlo, los íconos del celular pasan
 * a «plain» (no se borran): el celular conserva su encabezado y su cuenta, solo sin círculo.
 */
export function cambioCirculoAcento(a: Record<string, unknown>, v: boolean): Record<string, unknown> {
  const cambio: Record<string, unknown> = { header_icons_circle: v };
  const h = objeto(a.mobile_header);
  const i = objeto(h?.icons);
  if (h && i && (i.style === 'circle') !== v && (v || i.style === 'circle')) {
    cambio.mobile_header = { ...h, icons: { ...i, style: v ? 'circle' : 'plain' } };
  }
  return cambio;
}

function entradasMovil(a: Record<string, unknown>): EntradaAnterior[] {
  const h = objeto(a.mobile_header);
  if (!h) return [];
  const usa = usaEncabezadoMovilNuevo(h, a.mobile_menu_style);
  return PARTES_MOVIL.filter((p) => !vacio(h[p])).map((p) => {
    const resto = sinPartes(h, [p]);
    if (usa && !usaEncabezadoMovilNuevo(resto, a.mobile_menu_style)) {
      return { id: `mobile_header__${p}`, quitar: null, motivo: p === 'icons' && iconosSoloCirculo(h) ? 'circulo' : 'enUso', ...conEditables(h, p) };
    }
    return { id: `mobile_header__${p}`, quitar: { mobile_header: resto }, ...conEditables(h, p) };
  });
}

export function entradasAnterioresEncabezado(a: Record<string, unknown>, claves: readonly string[]): EntradaAnterior[] {
  const salida: EntradaAnterior[] = [];
  for (const k of claves) {
    if (k === 'mobile_header') {
      salida.push(...entradasMovil(a));
      continue;
    }
    const v = a[k];
    if (vacio(v)) continue;
    const def = OPCIONES_SHELL[k]?.porDefecto ?? null;
    const par = SIGUEN_A_COMPUTADOR[k];
    if (par) {
      const pc = vacio(a[par]) ? OPCIONES_SHELL[par]?.porDefecto ?? null : a[par];
      if (JSON.stringify(v) === JSON.stringify(pc)) continue;
    } else if (JSON.stringify(v) === JSON.stringify(def)) continue;
    salida.push({ id: k, quitar: { [k]: k in SIGUEN_A_COMPUTADOR ? null : def } });
  }
  return salida;
}

/**
 * «Quitar todos»: junta los cambios de las entradas que se pueden quitar. Las partes del celular se
 * quitan una a una mientras el celular conserve su encabezado (dos partes sueltas pueden no
 * depender entre sí, pero juntas sí).
 */
export function cambioQuitarTodos(a: Record<string, unknown>, entradas: readonly EntradaAnterior[]): Record<string, unknown> {
  const cambio: Record<string, unknown> = {};
  let h = objeto(a.mobile_header);
  const usa = usaEncabezadoMovilNuevo(h, a.mobile_menu_style);
  for (const e of entradas) {
    if (!e.quitar) continue;
    if (e.id.startsWith('mobile_header__') && h) {
      const resto = sinPartes(h, [e.id.slice('mobile_header__'.length)]);
      if (usa && !usaEncabezadoMovilNuevo(resto, a.mobile_menu_style)) continue;
      h = resto;
      cambio.mobile_header = resto;
      continue;
    }
    Object.assign(cambio, e.quitar);
  }
  return cambio;
}

const PIE_CELULAR: Readonly<Record<string, string>> = {
  mobile_footer_show_hours: 'footer_show_hours',
  mobile_footer_show_social: 'footer_show_social',
};

export function entradasAnterioresPie(a: Record<string, unknown>): EntradaAnterior[] {
  return Object.entries(PIE_CELULAR).flatMap(([movil, computador]) => {
    const v = a[movil];
    if (typeof v !== 'boolean') return [];
    const base = opcionBooleana(a, computador);
    return v === base ? [] : [{ id: movil, quitar: { [movil]: base } }];
  });
}

/**
 * Buscador único que conserva lo que se ve (QA 27-oct, orgs 341/338/137: celular «barra»,
 * computador «ícono»). Si el celular tiene un buscador propio distinto, se respeta al cambiar el
 * de computador; se iguala cuando se elige su mismo valor o «Oculto». Para que el celular siga
 * siempre al computador se quita «Buscador propio del celular» en los ajustes anteriores.
 */
export function buscadorPropioCelular(a: Record<string, unknown>): string | null {
  const h = objeto(a.mobile_header);
  if (typeof h?.search === 'string' && h.search) return h.search === 'fullscreen' ? 'icon' : h.search;
  const m = a.mobile_search_style;
  if (typeof m !== 'string' || !m) return null;
  const pc = typeof a.search_style === 'string' && a.search_style ? a.search_style : (OPCIONES_SHELL.search_style?.porDefecto as string | null) ?? 'icon';
  return m === pc ? null : m;
}

export function cambioBuscador(a: Record<string, unknown>, v: string): Record<string, unknown> {
  const propio = buscadorPropioCelular(a);
  if (propio && v !== 'hidden' && v !== propio) return { search_style: v };
  const cambio: Record<string, unknown> = { search_style: v, mobile_search_style: null };
  const h = objeto(a.mobile_header);
  if (h && 'search' in h) {
    const resto = sinPartes(h, ['search']);
    // Sin el buscador viejo el celular dejaría su encabezado: se le pone el mismo buscador.
    const deja = usaEncabezadoMovilNuevo(h, a.mobile_menu_style) && !usaEncabezadoMovilNuevo(resto, a.mobile_menu_style);
    cambio.mobile_header = deja && v !== 'hidden' ? { ...h, search: v } : resto;
  }
  return cambio;
}
