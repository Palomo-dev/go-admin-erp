/**
 * Filtros de «Visitantes del sitio web» (Figma 91-chat-40), sin React.
 */
import type { WidgetSession } from '@/lib/services/widgetSessionsService';

export type FiltroEstadoVisitante = 'todos' | 'enLinea' | 'inactivo';
export type FiltroCliente = 'todos' | 'identificados' | 'anonimos';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarVisitantes<T extends Pick<WidgetSession, 'is_active' | 'customer_id' | 'customer' | 'channel'>>(
  sesiones: readonly T[],
  f: { busqueda: string; estado: FiltroEstadoVisitante; cliente: FiltroCliente },
): T[] {
  const q = sinTildes(f.busqueda.trim());
  return sesiones.filter((s) => {
    if (f.estado === 'enLinea' && !s.is_active) return false;
    if (f.estado === 'inactivo' && s.is_active) return false;
    if (f.cliente === 'identificados' && !s.customer_id) return false;
    if (f.cliente === 'anonimos' && s.customer_id) return false;
    if (!q) return true;
    return sinTildes(`${s.customer?.full_name ?? ''} ${s.customer?.email ?? ''} ${s.channel?.name ?? ''}`).includes(q);
  });
}
