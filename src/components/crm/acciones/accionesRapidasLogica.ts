/**
 * Acciones rápidas del CRM (ola 3A, Figma 773:472568 y 773:472975), sin React:
 * qué ruta del servidor recibe cada acción y con qué cuerpo. Los diálogos del
 * kit (`ActivityDialog`) arman los datos; aquí se traducen al contrato de:
 *
 * - llamada registrada → `POST /api/crm/activities` (+ tarea de seguimiento
 *   `POST /api/crm/tasks`, asignada al usuario actual);
 * - reunión → `POST /api/crm/meetings` (`calendar_events.opportunity_id`, M3);
 * - nota → `POST /api/crm/notes` (D6: tabla `notes`);
 * - tarea → `POST /api/crm/tasks` (responsable por defecto = usuario actual).
 *
 * Correo y WhatsApp usan sus compositores (`/api/email/send` y la ruta de
 * WhatsApp, que cobra créditos): no se duplican aquí (regla dura 7).
 */
import { plainDateToInstant } from '@/lib/utils/dateDisplay';
import type { DestinoActividad, datosLlamada, datosNota, datosReunion } from '@/components/crm/kit/activityDialogLogica';
import type { VarianteBarraAcciones } from '@/components/crm/kit/quickActionLogica';

/** Hora de vencimiento por defecto de una tarea con solo fecha (Figma: «Vence mañana 10:00»). */
export const HORA_TAREA_POR_DEFECTO = '10:00';

export function cuerpoLlamada(d: ReturnType<typeof datosLlamada>) {
  const a = d.actividad;
  return {
    activity_type: a.activity_type,
    related_type: a.related_type,
    related_id: a.related_id,
    notes: a.notes,
    channel: a.channel,
    outcome: a.outcome,
    duration_seconds: a.duration_seconds,
    ...(a.occurred_at ? { occurred_at: a.occurred_at } : {}),
    metadata: a.metadata,
  };
}

/** Tarea de seguimiento de la llamada, o null si no se pidió. */
export function cuerpoSeguimiento(d: ReturnType<typeof datosLlamada>, destino: DestinoActividad, zona: string, titulo: string) {
  if (!d.seguimiento) return null;
  return {
    related_to_type: destino.oportunidadId ? ('opportunity' as const) : ('customer' as const),
    related_to_id: destino.oportunidadId ?? destino.clienteId,
    title: titulo,
    description: d.actividad.notes,
    due_date: plainDateToInstant(d.seguimiento.due_date, zona, HORA_TAREA_POR_DEFECTO),
  };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `calendar_events` vía `meetingInputSchema`: los participantes que no son correo no se invitan. */
export function cuerpoReunion(d: ReturnType<typeof datosReunion>) {
  const participantes = Array.isArray(d.metadata?.participants) ? d.metadata.participants : [];
  return {
    title: d.title,
    start_at: d.start_at,
    end_at: d.end_at,
    timezone: d.timezone,
    location: d.location,
    customer_id: d.customer_id,
    opportunity_id: d.opportunity_id,
    attendees: participantes.filter((p) => CORREO.test(p.trim())).slice(0, 20),
  };
}

export function cuerpoNota(d: ReturnType<typeof datosNota>) {
  return { related_type: d.related_type, related_id: d.related_id, body: d.body, is_pinned: d.is_pinned };
}

// ─── Tarea rápida ───────────────────────────────────────────────────────────

export const PRIORIDADES_TAREA = ['low', 'med', 'high', 'critical'] as const;
export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number];

export interface ValoresTarea {
  titulo: string;
  descripcion: string;
  /** `date` (YYYY-MM-DD) o ''. */
  fecha: string;
  /** «HH:mm» en la hora de la organización. */
  hora: string;
  prioridad: PrioridadTarea;
}

export function valoresInicialesTarea(manana: string): ValoresTarea {
  return { titulo: '', descripcion: '', fecha: manana, hora: HORA_TAREA_POR_DEFECTO, prioridad: 'med' };
}

export function validarTarea(v: ValoresTarea, hoy: string): Partial<Record<keyof ValoresTarea, 'obligatorio' | 'fechaPasada' | 'muyLargo'>> {
  const e: Partial<Record<keyof ValoresTarea, 'obligatorio' | 'fechaPasada' | 'muyLargo'>> = {};
  if (!v.titulo.trim()) e.titulo = 'obligatorio';
  else if (v.titulo.trim().length > 300) e.titulo = 'muyLargo';
  if (v.fecha && v.fecha < hoy) e.fecha = 'fechaPasada';
  if (v.fecha && !/^\d{2}:\d{2}$/.test(v.hora)) e.hora = 'obligatorio';
  return e;
}

/** Cuerpo de `POST /api/crm/tasks`; sin `assigned_to` el servidor asigna al usuario de la sesión. */
export function cuerpoTarea(v: ValoresTarea, destino: Pick<DestinoActividad, 'clienteId' | 'oportunidadId'>, zona: string) {
  return {
    related_to_type: destino.oportunidadId ? ('opportunity' as const) : ('customer' as const),
    related_to_id: destino.oportunidadId ?? destino.clienteId,
    title: v.titulo.trim(),
    description: v.descripcion.trim() || null,
    due_date: v.fecha ? plainDateToInstant(v.fecha, zona, v.hora || HORA_TAREA_POR_DEFECTO) : null,
    priority: v.prioridad,
  };
}

// ─── Barra heredada → barra del kit ────────────────────────────────────────

/** Las variantes de la barra vieja (`card`, `drawer`, `detail`) en el kit. */
export function varianteDesdeLegado(v: 'card' | 'drawer' | 'detail' | 'cliente'): VarianteBarraAcciones {
  return v === 'card' ? 'tarjeta' : v === 'detail' ? 'detalle' : v === 'cliente' ? 'cliente' : 'drawer';
}

/** Modos de llamada (Figma 773:472975, «Llamar»): navegador, mi celular, agente IA o solo registrar. */
export type ModoLlamada = 'browser' | 'mobile' | 'ai' | 'registrar';
export type MotivoModo = 'sinTelefono' | 'softphone' | 'agente';

export function motivoModo(modo: ModoLlamada, ctx: { telefono: string | null; softphoneListo: boolean }): MotivoModo | null {
  if (modo === 'registrar') return null;
  if (modo === 'ai') return 'agente';
  if (!ctx.telefono) return 'sinTelefono';
  if (modo === 'browser' && !ctx.softphoneListo) return 'softphone';
  return null;
}

/** Orden: el predeterminado de la plataforma primero (F15-B), «registrar» siempre al final. */
export function ordenModos(predeterminado: 'browser' | 'mobile' | null | undefined): ModoLlamada[] {
  return predeterminado === 'mobile' ? ['mobile', 'browser', 'ai', 'registrar'] : ['browser', 'mobile', 'ai', 'registrar'];
}
