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

/**
 * Celda «Progreso» (Figma 1395:17): texto a la izquierda, porcentaje a la
 * derecha y barra debajo. El texto cambia con el estado:
 *  - en marcha → «1.484 de 3.905»;
 *  - programada → «Sale <fecha>»;
 *  - de mensajes ya enviada → «2.110 enviados»;
 *  - borrador → «Sin programar».
 */
export type ProgresoFila =
  | { modo: 'conteo'; hechos: number; total: number; pct: number }
  | { modo: 'programada'; fecha: string | null; pct: number }
  | { modo: 'enviados'; enviados: number; pct: number }
  | { modo: 'sinProgramar'; pct: number };

export function progresoFila(c: Pick<CampanaUnificada, 'source' | 'status' | 'scheduledAt' | 'progress'>): ProgresoFila {
  const { done, total, pct } = c.progress;
  if (c.status === 'scheduled') return { modo: 'programada', fecha: c.scheduledAt, pct };
  if (c.status === 'draft' || c.status === 'materializing') return { modo: 'sinProgramar', pct: 0 };
  if (c.source === 'message' && c.status === 'sent') return { modo: 'enviados', enviados: done, pct };
  return { modo: 'conteo', hechos: done, total, pct };
}

/**
 * Celda «Resultado» (Figma 1395:17), dos líneas:
 *  - voz: «22 % contacto efectivo» (llamadas completadas sobre las hechas) y,
 *    si hay llamadas en curso, cuántas;
 *  - mensajes aún sin salir: «640 destinatarios · con consentimiento» (la
 *    audiencia calculada ya excluye a quien no dio consentimiento);
 *  - mensajes ya enviados: % de lectura (apertura en correo) y % de respuesta.
 *  - sin audiencia o sin llamadas hechas: «—».
 */
export type ResultadoFila =
  | { modo: 'vacio' }
  | { modo: 'voz'; pctEfectivo: number; enCurso: number }
  | { modo: 'destinatarios'; n: number }
  | { modo: 'interaccion'; canal: 'email' | 'whatsapp'; pctLectura: number; pctRespuesta: number };

const pctDe = (parte: number, base: number) => (base > 0 ? Math.min(100, Math.round((parte / base) * 100)) : 0);

export function resultadoFila(c: Pick<CampanaUnificada, 'source' | 'status' | 'channel' | 'progress' | 'result'>): ResultadoFila {
  const { done, total } = c.progress;
  if (total === 0) return { modo: 'vacio' };
  const r = c.result;
  if (c.source === 'voice') {
    if (done === 0) return { modo: 'vacio' };
    return { modo: 'voz', pctEfectivo: pctDe(r.completed ?? 0, done), enCurso: r.active ?? 0 };
  }
  if (c.status === 'draft' || c.status === 'materializing' || c.status === 'scheduled') return { modo: 'destinatarios', n: total };
  const base = (r.sent ?? 0) > 0 ? (r.sent ?? 0) : done;
  if (base === 0) return { modo: 'vacio' };
  return {
    modo: 'interaccion',
    canal: c.channel === 'email' ? 'email' : 'whatsapp',
    pctLectura: pctDe(r.read ?? 0, base),
    pctRespuesta: pctDe(r.replied ?? 0, base),
  };
}
