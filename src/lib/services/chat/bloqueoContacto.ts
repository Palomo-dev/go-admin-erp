/**
 * «Bloquear contacto» del Chat (Figma 93-chat-pendientes-01/02): tipos,
 * reglas puras y la lectura desde el navegador. La escritura va SIEMPRE por
 * `/api/chat/conversaciones/[id]/bloqueo` (`bloqueoContacto.server.ts`).
 *
 * Tabla `chat_contactos_bloqueados` (migración 20261113221114): un bloqueo por
 * cliente y organización, para todos sus canales. Desbloquear no borra la
 * fila: le pone `desbloqueado_en`, así el hilo conserva «X bloqueó…» y
 * «X desbloqueó…». El efecto sobre los mensajes entrantes lo aplica la base
 * (trigger `trg_messages_contacto_bloqueado`): se guardan marcados con
 * `metadata.contacto_bloqueado`, no cuentan como no leídos y la IA no responde.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BloqueoContacto {
  id: string;
  customer_id: string;
  conversation_id: string | null;
  bloqueado_por_member_id: number | null;
  bloqueado_en: string;
  desbloqueado_por_member_id: number | null;
  desbloqueado_en: string | null;
}

export const COLUMNAS_BLOQUEO =
  'id, customer_id, conversation_id, bloqueado_por_member_id, bloqueado_en, desbloqueado_por_member_id, desbloqueado_en';

/** Evento del hilo que sale de un bloqueo. */
export interface EventoBloqueo {
  id: string;
  created_at: string;
  tipo: 'bloqueo' | 'desbloqueo';
  memberId: number | null;
}

/** El bloqueo vigente (sin `desbloqueado_en`), o `null`. */
export function bloqueoVigente(filas: readonly BloqueoContacto[]): BloqueoContacto | null {
  return filas.find((f) => !f.desbloqueado_en) ?? null;
}

/** Un evento por bloqueo y otro por desbloqueo, en orden de tiempo. */
export function eventosDeBloqueos(filas: readonly BloqueoContacto[]): EventoBloqueo[] {
  const out: EventoBloqueo[] = [];
  for (const f of filas) {
    out.push({ id: `bloqueo-${f.id}`, created_at: f.bloqueado_en, tipo: 'bloqueo', memberId: f.bloqueado_por_member_id });
    if (f.desbloqueado_en) {
      out.push({ id: `desbloqueo-${f.id}`, created_at: f.desbloqueado_en, tipo: 'desbloqueo', memberId: f.desbloqueado_por_member_id });
    }
  }
  return out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** ¿El mensaje entró con el contacto bloqueado? (lo marca el trigger de la base). */
export function entroBloqueado(metadata: unknown): boolean {
  return !!metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).contacto_bloqueado === true;
}

/** Historia de bloqueos del cliente (RLS: miembros de la organización). */
export async function leerBloqueosCliente(db: SupabaseClient, organizationId: number, customerId: string): Promise<BloqueoContacto[]> {
  const { data, error } = await db
    .from('chat_contactos_bloqueados')
    .select(COLUMNAS_BLOQUEO)
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .order('bloqueado_en', { ascending: true })
    .limit(200);
  if (error) throw new Error(`No se pudo leer el bloqueo del contacto: ${error.message}`);
  return (data ?? []) as BloqueoContacto[];
}

/**
 * Bloqueos vigentes de una organización, para marcar muchas filas a la vez
 * (Visitantes del widget). La regla de «vigente» es la misma de
 * `bloqueoVigente`: sin `desbloqueado_en`.
 */
export interface BloqueosVigentes {
  clientes: ReadonlySet<string>;
  conversaciones: ReadonlySet<string>;
}

export function bloqueosVigentes(filas: readonly Pick<BloqueoContacto, 'customer_id' | 'conversation_id' | 'desbloqueado_en'>[]): BloqueosVigentes {
  const clientes = new Set<string>();
  const conversaciones = new Set<string>();
  for (const f of filas) {
    if (f.desbloqueado_en) continue;
    clientes.add(f.customer_id);
    if (f.conversation_id) conversaciones.add(f.conversation_id);
  }
  return { clientes, conversaciones };
}

/** Bloqueado si su cliente o su conversación tienen un bloqueo vigente. */
export function estaBloqueado(b: BloqueosVigentes, customerId: string | null | undefined, conversationId: string | null | undefined): boolean {
  return (!!customerId && b.clientes.has(customerId)) || (!!conversationId && b.conversaciones.has(conversationId));
}

/**
 * Los bloqueos vigentes de la organización (RLS: miembros activos; la política
 * es `organization_id IN (SELECT …)`, sin EXISTS anidado). Usa el índice
 * parcial `uq_chat_contactos_bloqueados_vigente`.
 */
export async function leerBloqueosVigentes(db: SupabaseClient, organizationId: number): Promise<BloqueoContacto[]> {
  const { data, error } = await db
    .from('chat_contactos_bloqueados')
    .select(COLUMNAS_BLOQUEO)
    .eq('organization_id', organizationId)
    .is('desbloqueado_en', null)
    .limit(1000);
  if (error) throw new Error(`No se pudieron leer los contactos bloqueados: ${error.message}`);
  return (data ?? []) as BloqueoContacto[];
}
