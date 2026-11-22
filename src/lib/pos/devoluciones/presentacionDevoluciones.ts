/**
 * Presentación del listado, el buscador y el detalle de devoluciones del POS.
 * Módulo hoja (sin React ni Supabase): lo usan las pantallas y sus pruebas.
 */
import type { EstadoDevolucion, MetodoReintegro } from './filtrosDevoluciones';

/**
 * Número visible de una devolución. `returns` no tiene consecutivo propio: el
 * número es el id con el prefijo del Figma («DEV-000008»). El buscador del
 * listado entiende ese mismo formato (`pos_devoluciones_filtradas`).
 */
export function numeroDevolucion(id: number | string): string {
  return `DEV-${String(id).padStart(6, '0')}`;
}

/**
 * Estado de `StatusBadge` para `returns.status` (Figma `BadgeEstadoDevolucion`
 * 680:406543): Procesada (éxito) · Pendiente (advertencia) · Anulada (peligro,
 * contorno). Se usan las claves de la tabla única de tonos (`estadoTono.ts`),
 * como `BADGE_ESTADO_VENTA`; el texto lo pone la pantalla.
 */
export const BADGE_ESTADO_DEVOLUCION: Readonly<Record<EstadoDevolucion, string>> = {
  processed: 'completada',
  pending: 'pendiente',
  cancelled: 'anulada',
};

export function estadoDevolucion(valor: string | null | undefined): EstadoDevolucion {
  return valor === 'pending' || valor === 'cancelled' ? valor : 'processed';
}

export function normalizarMetodoReintegro(valor: string | null | undefined): MetodoReintegro {
  return valor === 'cash' || valor === 'store_credit' ? valor : 'sin_definir';
}

/**
 * Texto plano del motivo libre (`returns.reason`). La pantalla vieja lo
 * guardaba como HTML del editor enriquecido (D12/D15 de la spec): aquí se ve
 * sin etiquetas.
 */
export function textoPlano(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** «% sobre las ventas» con un decimal; sin ventas en el periodo, null. */
export function porcentajeSobreVentas(devuelto: number, ventas: number): number | null {
  if (!(ventas > 0) || !Number.isFinite(devuelto)) return null;
  return Math.round((devuelto / ventas) * 1000) / 10;
}

/** Estado de una venta frente a lo ya devuelto (buscador de «Nueva devolución»). */
export type EstadoVentaParaDevolver = 'pagada' | 'devuelta_parcial' | 'devuelta';

export function estadoVentaParaDevolver(unidades: number, devueltas: number): EstadoVentaParaDevolver {
  if (unidades > 0 && devueltas >= unidades - 1e-9) return 'devuelta';
  if (devueltas > 0) return 'devuelta_parcial';
  return 'pagada';
}

/** Devolución parcial: menos unidades que las vendidas en la venta. */
export function esParcial(unidades: number, unidadesVendidas: number): boolean {
  return unidades > 0 && unidades < unidadesVendidas - 1e-9;
}
