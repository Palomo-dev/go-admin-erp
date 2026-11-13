/**
 * Reglas puras de la Bandeja del Chat (Figma 91-chat-01/05/06/07/14): vistas
 * rápidas, búsqueda local y datos de cada fila. Sin React.
 */
import type { ConversationFilters } from '@/lib/services/conversationsService';
import { agenteAsignado, nombreCorto, type AgenteChat } from '@/lib/services/chat/agentesChat';
import { toPlainDate } from '@/lib/utils/dateDisplay';

export const VISTAS = ['abiertas', 'mias', 'sinAsignar', 'pendientes', 'cerradas'] as const;
export type VistaBandeja = (typeof VISTAS)[number];

export function esVista(v: string | null | undefined): v is VistaBandeja {
  return !!v && (VISTAS as readonly string[]).includes(v);
}

/** Filtros extra del botón «Filtros» (además de la vista). */
export interface FiltrosExtra {
  prioridad?: string | null;
  canal?: string | null;
  etiqueta?: string | null;
}

/**
 * Filtros del servicio para una vista. «Mías» sin miembro conocido no puede
 * resolverse: devuelve `null` (no consultar, lista vacía).
 */
export function filtrosDeVista(vista: VistaBandeja, memberId: number | null, extra: FiltrosExtra = {}): ConversationFilters | null {
  const f: ConversationFilters = {};
  switch (vista) {
    case 'abiertas':
      f.status = 'open';
      break;
    case 'mias':
      if (!memberId) return null;
      f.status = 'open';
      f.assigned_member_id = memberId;
      break;
    case 'sinAsignar':
      f.status = 'open';
      f.unassigned = true;
      break;
    case 'pendientes':
      f.status = 'pending';
      break;
    case 'cerradas':
      f.status = 'closed';
      break;
  }
  if (extra.prioridad) f.priority = extra.prioridad;
  if (extra.canal) f.channel = extra.canal;
  if (extra.etiqueta) f.tag_id = extra.etiqueta;
  return f;
}

/** Cuántos filtros extra hay puestos (número del botón «Filtros»). */
export function cuentaFiltrosExtra(extra: FiltrosExtra): number {
  return [extra.prioridad, extra.canal, extra.etiqueta].filter(Boolean).length;
}

function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface ConversacionBuscable {
  customer?: { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
  last_message?: { content?: string | null } | null;
}

/** Búsqueda local: nombre, correo, teléfono (sin espacios ni signos) o último mensaje. */
export function coincideBusqueda(c: ConversacionBuscable, termino: string): boolean {
  const q = normalizar(termino).trim();
  if (!q) return true;
  const cu = c.customer;
  const texto = normalizar([cu?.full_name, cu?.first_name, cu?.last_name, cu?.email, c.last_message?.content].filter(Boolean).join(' '));
  if (texto.includes(q)) return true;
  const digitos = q.replace(/\D/g, '');
  return digitos.length >= 3 && (cu?.phone ?? '').replace(/\D/g, '').includes(digitos);
}

/** Línea de atención de la fila: agente corto, IA automática o sin asignar (`null`). */
export function atencionDeFila(
  c: { assigned_member_id?: number | null; channel?: { ai_mode?: string | null } | null; last_message?: { role?: string | null } | null },
  agentes: readonly AgenteChat[],
): string | null | 'ia' {
  const a = agenteAsignado(agentes, c.assigned_member_id);
  if (a) return nombreCorto(a.nombre);
  if (c.assigned_member_id == null && c.channel?.ai_mode === 'auto') return 'ia';
  return null;
}

/**
 * Cuándo se muestra en la fila (Figma: «10:42», «Ayer», «lun», fecha):
 * hora si es hoy, «ayer», día de la semana en los últimos 6 días y fecha corta después.
 */
export function cuandoDeFila(
  instante: string | null | undefined,
  tz: string | undefined,
  ahora: Date,
): { tipo: 'hora' | 'ayer' | 'semana' | 'fecha'; instante: string } | null {
  if (!instante) return null;
  const fecha = new Date(instante);
  if (isNaN(fecha.getTime())) return null;
  const dia = toPlainDate(fecha, tz);
  const hoy = toPlainDate(ahora, tz);
  if (dia === hoy) return { tipo: 'hora', instante };
  const dias = Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000);
  if (dias === 1) return { tipo: 'ayer', instante };
  if (dias > 1 && dias < 7) return { tipo: 'semana', instante };
  return { tipo: 'fecha', instante };
}
