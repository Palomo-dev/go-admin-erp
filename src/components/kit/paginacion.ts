/**
 * Cálculos de la paginación única del kit (PATRONES-TRANSVERSALES.md §2).
 * Sin React: los usan `Pagination`, `PaginationCompact` y `useListadoServidor`.
 */

export interface Sustantivo {
  singular: string;
  plural: string;
  /**
   * Concordancia de «seleccionadas», «Seleccionar las 32» (es, fr, pt). Por
   * defecto masculino. Va en los mensajes de la pantalla, porque cambia con el
   * idioma («factura» y «facture» son femeninos; en inglés no aplica).
   */
  genero?: 'masculino' | 'femenino';
}

export const SUSTANTIVO_POR_DEFECTO: Sustantivo = { singular: 'registro', plural: 'registros' };

export const TAMANOS_PAGINA: readonly number[] = [10, 20, 50, 100];

export interface RangoPagina {
  /** Página efectiva (acotada a 1…totalPaginas). */
  pagina: number;
  totalPaginas: number;
  /** Primer registro visible (1-based); 0 si no hay registros. */
  desde: number;
  /** Último registro visible (1-based); 0 si no hay registros. */
  hasta: number;
  total: number;
}

function entero(n: number, minimo: number): number {
  return Number.isFinite(n) ? Math.max(minimo, Math.floor(n)) : minimo;
}

export function calcularRango(pagina: number, tamano: number, total: number): RangoPagina {
  const t = entero(total, 0);
  const tam = entero(tamano, 1);
  const totalPaginas = Math.max(1, Math.ceil(t / tam));
  const p = Math.min(entero(pagina, 1), totalPaginas);
  if (t === 0) return { pagina: 1, totalPaginas: 1, desde: 0, hasta: 0, total: 0 };
  const desde = (p - 1) * tam + 1;
  return { pagina: p, totalPaginas, desde, hasta: Math.min(p * tam, t), total: t };
}

export type ElementoPaginas = number | 'elipsis-izq' | 'elipsis-der';

/**
 * Números a mostrar: la primera, la última y la actual con sus vecinas; un
 * hueco de una sola página se rellena con el número (no tiene sentido «…» por
 * una página). Página 1 de 175 → 1 2 3 … 175 (como en Figma).
 */
export function paginasVisibles(pagina: number, totalPaginas: number): ElementoPaginas[] {
  const total = entero(totalPaginas, 1);
  const p = Math.min(entero(pagina, 1), total);
  const set = new Set<number>([1, total, p - 1, p, p + 1]);
  if (p <= 2) [1, 2, 3].forEach((n) => set.add(n));
  if (p >= total - 1) [total - 2, total - 1, total].forEach((n) => set.add(n));
  const numeros = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);

  const salida: ElementoPaginas[] = [];
  numeros.forEach((n, i) => {
    const anterior = numeros[i - 1];
    if (anterior !== undefined && n - anterior === 2) salida.push(anterior + 1);
    else if (anterior !== undefined && n - anterior > 2) salida.push(n > p ? 'elipsis-der' : 'elipsis-izq');
    salida.push(n);
  });
  return salida;
}

const formato = new Intl.NumberFormat('es-CO');

export function formatearEntero(n: number): string {
  return formato.format(n);
}

export function sustantivoPara(n: number, s: Sustantivo): string {
  return n === 1 ? s.singular : s.plural;
}

/** «Mostrando 1 a 6 de 42 sesiones» (Layout=full). */
export function resumenPaginacion(r: RangoPagina, s: Sustantivo = SUSTANTIVO_POR_DEFECTO): string {
  if (r.total === 0) return `0 ${s.plural}`;
  return `Mostrando ${formatearEntero(r.desde)} a ${formatearEntero(r.hasta)} de ${formatearEntero(r.total)} ${sustantivoPara(r.total, s)}`;
}

/** «1–10 de 273» (Layout=compact). */
export function resumenCompacto(r: RangoPagina): string {
  if (r.total === 0) return '0 de 0';
  return `${formatearEntero(r.desde)}–${formatearEntero(r.hasta)} de ${formatearEntero(r.total)}`;
}

/** Interpreta lo escrito en «Ir a»: una página válida o null. */
export function paginaDesdeTexto(texto: string, totalPaginas: number): number | null {
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  if (n < 1 || n > totalPaginas) return null;
  return n;
}
