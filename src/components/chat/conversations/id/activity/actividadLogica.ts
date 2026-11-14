/**
 * Pestaña «Actividad» de la conversación (Figma 91-chat-11): qué dice cada
 * fila, con qué icono y tono, y qué filtros hay. Puro, sin React: los textos
 * llegan por `t` (next-intl, namespace `chatHilo.actividad`) para que la fila,
 * la búsqueda y el CSV digan lo mismo en los cuatro idiomas.
 *
 * Columnas verificadas con el MCP (2026-11-13): `conversation_status_history`
 * (from_status, to_status, changed_by_member_id, reason),
 * `conversation_assignments` (assigned_member_id, assigned_by_member_id,
 * reason), `ai_jobs` (job_type, status, confidence_score, fragments_used[],
 * prompt_tokens, completion_tokens, error_message) y `chat_audit_logs`
 * (actor_type, actor_id uuid, action).
 */
import type { ActivityItem, ActivityType } from '@/lib/services/conversationActivityService';

export const FILTROS_ACTIVIDAD = ['todas', 'estados', 'asignaciones', 'etiquetas', 'ia', 'auditoria'] as const;
export type FiltroActividad = (typeof FILTROS_ACTIVIDAD)[number];

export function esFiltroActividad(v: string): v is FiltroActividad {
  return (FILTROS_ACTIVIDAD as readonly string[]).includes(v);
}

export function coincideFiltroActividad(tipo: ActivityType, filtro: FiltroActividad): boolean {
  switch (filtro) {
    case 'todas':
      return true;
    case 'estados':
      return tipo === 'status_change';
    case 'asignaciones':
      return tipo === 'assignment';
    case 'etiquetas':
      return tipo === 'tag_added' || tipo === 'tag_removed';
    case 'ia':
      return tipo === 'ai_job';
    case 'auditoria':
      return tipo === 'audit';
  }
}

export type IconoActividad = 'estado' | 'asignacion' | 'etiqueta' | 'ia' | 'auditoria' | 'bloqueo' | 'desbloqueo';
export type TonoActividad = 'exito' | 'informacion' | 'advertencia' | 'marca' | 'neutro' | 'peligro';

/** Traductor con la forma de next-intl (`t(clave, valores)`). */
export type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

export interface ContextoActividad {
  t: Traductor;
  /** Nombre de `organization_members.id`; `null` si no se conoce. */
  nombreMiembro: (id: number) => string | null;
  /** Nombre por `auth.users.id` (actor de la auditoría); `null` si no se conoce. */
  nombreUsuario: (id: string) => string | null;
  /** «Abierta», «Pendiente»… */
  estado: (codigo: string) => string;
  /** «Respuesta automática»… */
  tipoTrabajo: (codigo: string) => string;
  /** «Completado»… */
  estadoTrabajo: (codigo: string) => string;
  /** «Asignó una conversación»… */
  accion: (codigo: string) => string;
  /** 0.86 → «0,86» en el idioma de la persona. */
  decimal: (n: number) => string;
  entero: (n: number) => string;
}

export interface FilaActividad {
  id: string;
  tipo: ActivityType;
  icono: IconoActividad;
  tono: TonoActividad;
  titulo: string;
  /** Segunda línea («Antes: Pendiente · Motivo: …»); `null` si no hay nada que decir. */
  detalle: string | null;
  /** Quién lo hizo, para el CSV. */
  actor: string;
  instante: string;
}

const ES_NUMERO = /^\d+$/;

/** Nombre de quien hizo la acción; `null` = el sistema (no se nombra). */
function nombreActor(a: ActivityItem, ctx: ContextoActividad): string | null {
  const actor = a.actor;
  if (!actor || actor.type === 'system') return null;
  if (actor.type === 'ai') return ctx.t('actorIa');
  if (actor.name) return actor.name;
  const id = actor.id;
  if (typeof id === 'number') return ctx.nombreMiembro(id) ?? ctx.t('alguien');
  if (typeof id === 'string' && id) {
    return (ES_NUMERO.test(id) ? ctx.nombreMiembro(Number(id)) : ctx.nombreUsuario(id)) ?? ctx.t('alguien');
  }
  return ctx.t('alguien');
}

function conMotivo(detalles: string[], motivo: unknown, ctx: ContextoActividad) {
  if (typeof motivo === 'string' && motivo.trim()) detalles.push(ctx.t('motivo', { motivo: motivo.trim() }));
}

function tonoEstado(codigo: string): TonoActividad {
  if (codigo === 'open') return 'exito';
  if (codigo === 'pending') return 'advertencia';
  return 'neutro';
}

/** Lo que se muestra de una actividad, ya en el idioma de la persona. */
export function describirActividad(a: ActivityItem, ctx: ContextoActividad): FilaActividad {
  const { t } = ctx;
  const actor = nombreActor(a, ctx);
  const d = (a.data ?? {}) as Record<string, unknown>;
  const detalles: string[] = [];
  let titulo: string;
  let icono: IconoActividad;
  let tono: TonoActividad;

  switch (a.type) {
    case 'status_change': {
      const estado = ctx.estado(String(d.to_status ?? ''));
      titulo = actor ? t('estado.conActor', { actor, estado }) : t('estado.sinActor', { estado });
      if (d.from_status) detalles.push(t('estado.antes', { estado: ctx.estado(String(d.from_status)) }));
      conMotivo(detalles, d.reason, ctx);
      icono = 'estado';
      tono = tonoEstado(String(d.to_status ?? ''));
      break;
    }
    case 'assignment': {
      const asignado = typeof d.assigned_member_id === 'number' ? d.assigned_member_id : null;
      if (asignado != null) {
        const persona = ctx.nombreMiembro(asignado) ?? t('alguien');
        titulo = actor ? t('asignacion.conActor', { actor, persona }) : t('asignacion.sinActor', { persona });
      } else {
        titulo = actor ? t('asignacion.quitadaConActor', { actor }) : t('asignacion.quitadaSinActor');
      }
      conMotivo(detalles, d.reason, ctx);
      icono = 'asignacion';
      tono = 'informacion';
      break;
    }
    case 'tag_added':
    case 'tag_removed': {
      const tag = d.tag as { name?: string } | undefined;
      const etiqueta = tag?.name || t('etiqueta.sinNombre');
      const clave = a.type === 'tag_added' ? 'agregada' : 'quitada';
      titulo = actor ? t(`etiqueta.${clave}ConActor`, { actor, etiqueta }) : t(`etiqueta.${clave}SinActor`, { etiqueta });
      icono = 'etiqueta';
      tono = 'neutro';
      break;
    }
    case 'ai_job': {
      const tipo = String(d.job_type ?? '');
      const estado = String(d.status ?? '');
      titulo =
        tipo === 'auto_response' && estado === 'completed'
          ? t('ia.auto')
          : t('ia.trabajo', { tipo: ctx.tipoTrabajo(tipo), estado: ctx.estadoTrabajo(estado) });
      if (typeof d.confidence_score === 'number') detalles.push(t('ia.confianza', { valor: ctx.decimal(d.confidence_score) }));
      if (Array.isArray(d.fragments_used) && d.fragments_used.length > 0) detalles.push(t('ia.fragmentos', { n: d.fragments_used.length }));
      const tokens = (Number(d.prompt_tokens) || 0) + (Number(d.completion_tokens) || 0);
      if (tokens > 0) detalles.push(t('ia.tokens', { n: ctx.entero(tokens) }));
      if (typeof d.error_message === 'string' && d.error_message) detalles.push(t('ia.error', { mensaje: d.error_message }));
      icono = 'ia';
      tono = estado === 'failed' ? 'peligro' : 'marca';
      break;
    }
    default: {
      const accion = String(d.action ?? '');
      titulo = ctx.accion(accion);
      if (actor) detalles.push(t('auditoria.por', { actor }));
      // Bloquear/desbloquear el contacto (`block_contact` / `unblock_contact`, Bandeja).
      icono = accion === 'block_contact' ? 'bloqueo' : accion === 'unblock_contact' ? 'desbloqueo' : 'auditoria';
      tono = accion === 'block_contact' ? 'peligro' : 'neutro';
    }
  }

  return {
    id: a.id,
    tipo: a.type,
    icono,
    tono,
    titulo,
    detalle: detalles.length ? detalles.join(' · ') : null,
    actor: actor ?? t('actorSistema'),
    instante: a.timestamp,
  };
}
