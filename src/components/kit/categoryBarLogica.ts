/**
 * `CategoryBar` sin React: las opciones en orden («Todas», «Favoritas» si
 * procede y las categorías en el orden que llegan), la clave de cada una, el
 * movimiento con flechas y cuándo mostrar los chevrones de desplazamiento.
 *
 * El orden de las categorías lo decide la pantalla (`CategoryFilterBar` ordena
 * por `pos_category_order_by`): aquí no se reordena nada.
 */

export type IdCategoria = string | number;

/** Valor elegido: una categoría, todas (`null`) o el filtro de favoritas. */
export type ValorCategoria = IdCategoria | null | 'favoritas';

export interface CategoriaBarra {
  id: IdCategoria;
  nombre: string;
  /** Color configurado en la categoría (dato de la organización; cualquier formato CSS). */
  color?: string | null;
  /** URL de la imagen (modo `imagenes`). */
  imagen?: string | null;
  /** Número de productos. */
  conteo?: number | null;
  favorita?: boolean;
  /** Unidades vendidas en 90 días (`sales_count_90d`): «Top» si es > 0. */
  top?: number | null;
}

export type OpcionBarra =
  | { tipo: 'todas'; clave: 'todas'; valor: null }
  | { tipo: 'favoritas'; clave: 'favoritas'; valor: 'favoritas' }
  | { tipo: 'categoria'; clave: string; valor: IdCategoria; categoria: CategoriaBarra };

/** Clave estable de un valor (los ids numéricos y de texto se comparan igual). */
export function claveValor(valor: ValorCategoria | undefined): string {
  if (valor === null || valor === undefined) return 'todas';
  if (valor === 'favoritas') return 'favoritas';
  return `c:${String(valor)}`;
}

/** «Todas» primero, «Favoritas» si se pide, y las categorías en el orden recibido. */
export function opcionesBarra(categorias: readonly CategoriaBarra[], { mostrarFavoritas }: { mostrarFavoritas?: boolean } = {}): OpcionBarra[] {
  const out: OpcionBarra[] = [{ tipo: 'todas', clave: 'todas', valor: null }];
  if (mostrarFavoritas) out.push({ tipo: 'favoritas', clave: 'favoritas', valor: 'favoritas' });
  for (const c of categorias) out.push({ tipo: 'categoria', clave: claveValor(c.id), valor: c.id, categoria: c });
  return out;
}

/** Índice de la opción elegida; si el valor no existe (categoría borrada), «Todas». */
export function indiceElegido(opciones: readonly OpcionBarra[], valor: ValorCategoria | undefined): number {
  const clave = claveValor(valor);
  const i = opciones.findIndex((o) => o.clave === clave);
  return i >= 0 ? i : 0;
}

/**
 * Siguiente índice con el teclado (patrón `radiogroup`): ← → con vuelta,
 * Inicio y Fin. `null` si la tecla no mueve.
 */
export function moverIndice(actual: number, tecla: string, total: number): number | null {
  if (total <= 0) return null;
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (actual + 1) % total;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (actual - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

/** Qué chevrones se ven: hay contenido recortado a la izquierda o a la derecha (tolerancia de 1 px). */
export function chevronesVisibles(scrollLeft: number, anchoVisible: number, anchoTotal: number): { anterior: boolean; siguiente: boolean } {
  return {
    anterior: scrollLeft > 1,
    siguiente: scrollLeft + anchoVisible < anchoTotal - 1,
  };
}

/** Cuánto se desplaza un clic en el chevron: el 80 % de lo visible, para que se vea algo de lo anterior. */
export function pasoDesplazamiento(anchoVisible: number): number {
  return Math.max(120, Math.round(anchoVisible * 0.8));
}

export function esTopCategoria(c: Pick<CategoriaBarra, 'top'>): boolean {
  return Number(c.top ?? 0) > 0;
}
