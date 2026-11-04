/**
 * Buscador del encabezado para computador y celular, en conjunto o por separado (4-nov).
 *
 * Interruptor «Buscador del celular igual al de escritorio» (`mobile_search_same_as_desktop`):
 * - Encendido (en conjunto): un solo selector (`search_style`); el celular usa el mismo buscador.
 * - Apagado (por separado): «Computador» (`search_style`) y «Celular» (`mobile_search_style`), cada
 *   uno con las 7 opciones.
 *
 * Misma regla que la tienda (goadmin-websites, `lib/website/opcionUnica.ts`, `buscadorMovilElegido`
 * y `formaBuscadorMovil`; `HeaderMovilConfigurable` para `mobile_header.search`). La vista previa es
 * la tienda en un iframe: lo que se ve ahí es lo que sale publicado.
 */
import { cambioBuscador, usaEncabezadoMovilNuevo } from './anterioresLogica';
import { BUSCADORES } from './encabezadoCapacidades';

export type BuscadorOpcion = (typeof BUSCADORES)[number];

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function valido(v: unknown): BuscadorOpcion | null {
  return (BUSCADORES as readonly unknown[]).includes(v) ? (v as BuscadorOpcion) : null;
}

/** Cómo se pinta en el celular: barra visible, compacta, grande y píldora van bajo el logo. */
export function formaBuscadorCelular(v: BuscadorOpcion): 'icon' | 'bar' | 'hidden' {
  if (v === 'hidden') return 'hidden';
  if (v === 'bar' || v === 'mini' || v === 'mega' || v === 'pill_floating') return 'bar';
  return 'icon';
}

export function buscadorEnConjunto(a: Record<string, unknown>): boolean {
  return a.mobile_search_same_as_desktop === true;
}

export function buscadorComputador(a: Record<string, unknown>): BuscadorOpcion {
  return valido(a.search_style) ?? 'icon';
}

/**
 * Opción que el celular muestra hoy. En conjunto: la de computador. Por separado: el buscador del
 * encabezado configurable (`mobile_header.search`, manda en la tienda si está guardado); si no,
 * `mobile_search_style` (`null` = la de computador; ausente = ícono, lo de siempre).
 */
export function buscadorCelular(a: Record<string, unknown>): BuscadorOpcion {
  if (buscadorEnConjunto(a)) return buscadorComputador(a);
  const propio = valido(a.mobile_search_style) ?? (a.mobile_search_style === null ? buscadorComputador(a) : null);
  // `mobile_header.search` decide la forma (barra o ícono); el estilo lo pone la opción propia.
  const h = objeto(a.mobile_header)?.search;
  if (h === 'bar') return propio && formaBuscadorCelular(propio) === 'bar' ? propio : 'bar';
  if (h === 'icon' || h === 'fullscreen') return propio && formaBuscadorCelular(propio) === 'icon' ? propio : 'icon';
  return propio ?? 'icon';
}

/** Encender o apagar el interruptor. Al apagarlo, el celular arranca igual al computador. */
export function cambioBuscadorEnConjunto(a: Record<string, unknown>, si: boolean): Record<string, unknown> {
  if (si) return { mobile_search_same_as_desktop: true };
  const cambio: Record<string, unknown> = { mobile_search_same_as_desktop: false, mobile_search_style: null };
  const h = objeto(a.mobile_header);
  // El `mobile_header.search` viejo mandaría por encima: se iguala a la forma de computador.
  if (h && 'search' in h && !(h.search === 'fullscreen' && formaBuscadorCelular(buscadorComputador(a)) === 'icon')) {
    cambio.mobile_header = conBuscadorViejo(h, buscadorComputador(a), a.mobile_menu_style);
  }
  return cambio;
}

/**
 * «Buscador» (en conjunto) o «Computador» (por separado). Por separado no toca lo que se ve en el
 * celular: si el celular seguía al computador (`null`), queda fijo en lo que mostraba.
 */
export function cambioBuscadorComputador(a: Record<string, unknown>, v: string): Record<string, unknown> {
  if (buscadorEnConjunto(a)) return cambioBuscador(a, v);
  if (a.mobile_search_style === null) return { search_style: v, mobile_search_style: buscadorCelular(a) };
  return { search_style: v };
}

/** «Celular» (por separado): guarda la opción y quita el buscador viejo del encabezado configurable. */
export function cambioBuscadorCelular(a: Record<string, unknown>, v: BuscadorOpcion): Record<string, unknown> {
  const cambio: Record<string, unknown> = { mobile_search_style: v };
  const h = objeto(a.mobile_header);
  // «Pantalla completa» es cómo abre el ícono: se conserva si el celular sigue con ícono.
  if (h && 'search' in h && !(h.search === 'fullscreen' && formaBuscadorCelular(v) === 'icon')) {
    cambio.mobile_header = conBuscadorViejo(h, v, a.mobile_menu_style);
  }
  return cambio;
}

/**
 * `mobile_header` sin su `search` viejo. Si quitarlo hiciera que el celular deje el encabezado
 * configurable, se le pone la forma de la opción (ícono o barra), igual que `cambioBuscador`.
 */
function conBuscadorViejo(h: Record<string, unknown>, v: BuscadorOpcion, estiloMenu: unknown): Record<string, unknown> | null {
  const resto = Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'search'));
  const forma = formaBuscadorCelular(v);
  const deja = usaEncabezadoMovilNuevo(h, estiloMenu) && !usaEncabezadoMovilNuevo(resto, estiloMenu);
  if (deja && forma !== 'hidden') return { ...resto, search: forma };
  return Object.keys(resto).length ? resto : null;
}
