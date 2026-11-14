/**
 * Reglas de «Visitantes del sitio web» (Figma 91-chat-40 y
 * 94-chat-recuperado-ia-07/08), sin React: `__tests__/visitantesLogica.test.ts`.
 */
import type { WidgetSession } from '@/lib/services/widgetSessionsService';

export type FiltroEstadoVisitante = 'todos' | 'enLinea' | 'inactivo' | 'bloqueado';
export type FiltroCliente = 'todos' | 'identificados' | 'anonimos';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type SesionMin = Pick<WidgetSession, 'is_active' | 'customer_id' | 'customer' | 'channel'> &
  Partial<Pick<WidgetSession, 'channel_id' | 'current_page' | 'location_data' | 'referrer' | 'blocked'>>;

/** Estado que se muestra: «Bloqueado» manda sobre «En línea» e «Inactivo». */
export function estadoVisitante(s: Pick<SesionMin, 'is_active' | 'blocked'>): 'bloqueado' | 'enLinea' | 'inactivo' {
  return s.blocked ? 'bloqueado' : s.is_active ? 'enLinea' : 'inactivo';
}

/** «https://tienda.co/calzado/urban-run?x=1» → «/calzado/urban-run». Sin URL válida, el texto tal cual. */
export function rutaDePagina(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

/** «https://www.google.com/» → «Google»; «l.instagram.com» → «Instagram». */
export function origenCorto(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return null;
  }
  const partes = host.replace(/^www\./, '').split('.');
  // El nombre del sitio: la parte antes del dominio (l.instagram.com → instagram; google.com.co → google).
  const conocidos = ['google', 'instagram', 'facebook', 'tiktok', 'bing', 'youtube', 'whatsapp', 'twitter', 'x', 'linkedin', 'pinterest'];
  const nombre = partes.find((p) => conocidos.includes(p)) ?? partes[0];
  return nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : null;
}

/** Ciudad del visitante: la de la ubicación de la visita o la de la ficha del cliente. */
export function ciudadVisitante(s: SesionMin): string | null {
  return s.location_data?.city || s.customer?.city || null;
}

/**
 * Línea bajo el nombre: «Cliente · Medellín», «Pereira · Google» o, sin nada
 * que mostrar, `null` (la pantalla dice «Desconocido»).
 */
export function partesSubtitulo(s: SesionMin): { esCliente: boolean; ciudad: string | null; origen: string | null } {
  return { esCliente: !!s.customer_id, ciudad: ciudadVisitante(s), origen: s.customer_id ? null : origenCorto(s.referrer) };
}

/** `canal`: id del canal, o `null`/ausente para todos. Busca en página, ciudad y nombre. */
export function filtrarVisitantes<T extends SesionMin>(
  sesiones: readonly T[],
  f: { busqueda: string; estado: FiltroEstadoVisitante; cliente: FiltroCliente; canal?: string | null },
): T[] {
  const q = sinTildes(f.busqueda.trim());
  return sesiones.filter((s) => {
    if (f.estado !== 'todos' && estadoVisitante(s) !== f.estado) return false;
    if (f.cliente === 'identificados' && !s.customer_id) return false;
    if (f.cliente === 'anonimos' && s.customer_id) return false;
    if (f.canal && (s.channel_id ?? s.channel?.id) !== f.canal) return false;
    if (!q) return true;
    return sinTildes(`${s.customer?.full_name ?? ''} ${s.customer?.email ?? ''} ${s.current_page ?? ''} ${ciudadVisitante(s) ?? ''}`).includes(q);
  });
}
