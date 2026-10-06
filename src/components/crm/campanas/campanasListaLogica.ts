/**
 * Lógica pura del listado unificado de campañas (Figma CRM 1395:17 y
 * estados 1404:829863 / 830283 / 830739). Sin React.
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import type { CampanaUnificada } from '@/lib/services/crm/campaignsUnificadasLogica';
import { estadoCampana } from '@/components/crm/agentes/campanas/detalle/campanaVozDetalleLogica';

/** Estado efectivo de una campaña de mensajes (`effectiveCampaignStatus`) → clave y tono. */
const MENSAJES: Record<string, { clave: string; tono: TonoBadge }> = {
  draft: { clave: 'borrador', tono: 'neutro' },
  materializing: { clave: 'calculando', tono: 'informacion' },
  scheduled: { clave: 'programada', tono: 'informacion' },
  sending: { clave: 'enviando', tono: 'exito' },
  paused: { clave: 'pausada', tono: 'advertencia' },
  sent: { clave: 'enviada', tono: 'neutro' },
  canceled: { clave: 'cancelada', tono: 'peligro' },
};

/**
 * Clave de `crm.campanasLista.estados` y tono. Las de voz usan `estadoCampana`,
 * la misma función del detalle, para que lista y detalle digan lo mismo.
 */
export function estadoFilaCampana(c: Pick<CampanaUnificada, 'source' | 'status' | 'emergencyStop'>): { clave: string; tono: TonoBadge } {
  if (c.source === 'voice') return estadoCampana({ status: c.status, emergency_stop: c.emergencyStop });
  return MENSAJES[c.status] ?? MENSAJES.draft;
}

/** A dónde lleva la fila: el detalle de voz o el de mensajes. */
export function rutaCampana(c: Pick<CampanaUnificada, 'id' | 'source'>): string {
  const id = encodeURIComponent(c.id);
  return c.source === 'voice' ? `/app/crm/campanas/voz/${id}` : `/app/crm/campanas/${id}`;
}

export type AccionCampana = 'pausar' | 'reanudar' | 'cancelar' | 'duplicar' | 'eliminar';

/**
 * Acciones del menú de una campaña de MENSAJES (las de voz se gestionan en su
 * detalle, con la parada de emergencia y el diagnóstico). Mismas reglas que
 * las rutas `/api/crm/campaigns/[id]/*`: pausar, reanudar y cancelar exigen
 * admin (`puedeGestionar`).
 */
export function accionesCampanaMensajes(status: string, puedeGestionar: boolean): AccionCampana[] {
  const acciones: AccionCampana[] = [];
  if (puedeGestionar && (status === 'sending' || status === 'scheduled')) acciones.push('pausar');
  if (puedeGestionar && status === 'paused') acciones.push('reanudar');
  if (puedeGestionar && ['sending', 'scheduled', 'paused'].includes(status)) acciones.push('cancelar');
  // Duplicar y eliminar no exigen admin en `/api/crm/campaigns` (igual que antes).
  acciones.push('duplicar');
  if (status !== 'sending') acciones.push('eliminar');
  return acciones;
}

export function parametrosCampanas(f: { channel: string; q: string; page: number }): string {
  const p = new URLSearchParams({ channel: f.channel, page: String(f.page) });
  if (f.q.trim()) p.set('q', f.q.trim());
  return p.toString();
}
