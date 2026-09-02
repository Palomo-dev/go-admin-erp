import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Timeline unificado de actividades (Fase 9 - Ficha 360°).
 *
 * Combina eventos de múltiples tablas en un timeline ordenado por fecha:
 *   - activities (activity_type, notes, occurred_at, related_type, related_id)
 *   - tasks (title, description, due_date, related_to_type, related_to_id)
 *   - notes (body, created_at, related_type, related_id)
 *   - calls (status, started_at, customer_id, opportunity_id)
 *   - email_messages (subject, sent_at, related_type, related_id)
 *   - messages / WhatsApp (content, created_at, sender_customer_id)
 *
 * Paginación con cursor (timestamp + id).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TimelineEntityType = 'customer' | 'opportunity';

export type TimelineEntryType =
  | 'activity'
  | 'task'
  | 'note'
  | 'call'
  | 'email'
  | 'whatsapp';

export interface TimelineEntry {
  id: string;
  type: TimelineEntryType;
  timestamp: string;
  title: string;
  description: string | null;
  user_id: string | null;
  metadata: Record<string, unknown>;
}

export interface TimelineFilters {
  type?: TimelineEntryType;
  date_from?: string;
  date_to?: string;
  user_id?: string;
  limit?: number;
  cursor?: string; // formato: ISO_timestamp|uuid
}

export interface TimelineResult {
  entries: TimelineEntry[];
  next_cursor: string | null;
}

// ─── Utilidades internas ─────────────────────────────────────────────────────

/**
 * Decodifica el cursor en { timestamp, id }.
 */
function decodeCursor(cursor: string): { timestamp: string; id: string } | null {
  const parts = cursor.split('|');
  if (parts.length !== 2) return null;
  return { timestamp: parts[0], id: parts[1] };
}

/**
 * Codifica un cursor desde timestamp + id.
 */
function encodeCursor(timestamp: string, id: string): string {
  return `${timestamp}|${id}`;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Obtiene el timeline unificado de una entidad (customer u opportunity).
 *
 * Combina actividades, tareas, notas, llamadas, emails y mensajes de WhatsApp
 * asociados a la entidad, ordenados por fecha descendente con paginación cursor.
 */
export async function getTimeline(
  orgId: number,
  entityType: TimelineEntityType,
  entityId: string,
  supabase: SupabaseClient,
  filters?: TimelineFilters
): Promise<TimelineResult> {
  const limit = Math.min(filters?.limit ?? 50, 200);
  const cursor = filters?.cursor ? decodeCursor(filters.cursor) : null;

  const allEntries: TimelineEntry[] = [];

  // Filtrar por tipo si se especifica, si no, traer todos
  const typesToFetch: TimelineEntryType[] = filters?.type
    ? [filters.type]
    : ['activity', 'task', 'note', 'call', 'email', 'whatsapp'];

  // ─── Activities ──────────────────────────────────────────────────────────
  if (typesToFetch.includes('activity')) {
    let q = supabase
      .from('activities')
      .select('id, activity_type, notes, user_id, occurred_at, metadata')
      .eq('organization_id', orgId)
      .eq('related_type', entityType)
      .eq('related_id', entityId)
      .order('occurred_at', { ascending: false })
      .limit(limit + 1);

    if (filters?.date_from) q = q.gte('occurred_at', filters.date_from);
    if (filters?.date_to) q = q.lte('occurred_at', filters.date_to);
    if (filters?.user_id) q = q.eq('user_id', filters.user_id);
    if (cursor) {
      q = q.or(`occurred_at.lt.${cursor.timestamp},and(occurred_at.eq.${cursor.timestamp},id.lt.${cursor.id})`);
    }

    const { data } = await q;
    if (data) {
      for (const row of data) {
        const r = row as {
          id: string;
          activity_type: string;
          notes: string | null;
          user_id: string | null;
          occurred_at: string | null;
          metadata: Record<string, unknown> | null;
        };
        allEntries.push({
          id: r.id,
          type: 'activity',
          timestamp: r.occurred_at || r.metadata?.['occurred_at'] as string || new Date().toISOString(),
          title: r.activity_type,
          description: r.notes,
          user_id: r.user_id,
          metadata: r.metadata || {},
        });
      }
    }
  }

  // ─── Tasks ───────────────────────────────────────────────────────────────
  if (typesToFetch.includes('task')) {
    let q = supabase
      .from('tasks')
      .select('id, title, description, assigned_to, due_date, status, created_at, related_to_type, related_to_id')
      .eq('organization_id', orgId)
      .eq('related_to_type', entityType)
      .eq('related_to_id', entityId)
      .order('due_date', { ascending: false, nullsFirst: false })
      .limit(limit + 1);

    if (filters?.date_from) q = q.gte('due_date', filters.date_from);
    if (filters?.date_to) q = q.lte('due_date', filters.date_to);
    if (filters?.user_id) q = q.eq('assigned_to', filters.user_id);

    const { data } = await q;
    if (data) {
      for (const row of data) {
        const r = row as {
          id: string;
          title: string;
          description: string | null;
          assigned_to: string | null;
          due_date: string | null;
          status: string | null;
          created_at: string;
        };
        allEntries.push({
          id: r.id,
          type: 'task',
          timestamp: r.due_date || r.created_at,
          title: r.title,
          description: r.description,
          user_id: r.assigned_to,
          metadata: { status: r.status, due_date: r.due_date },
        });
      }
    }
  }

  // ─── Notes ───────────────────────────────────────────────────────────────
  if (typesToFetch.includes('note')) {
    let q = supabase
      .from('notes')
      .select('id, body, user_id, related_type, related_id, created_at, is_pinned')
      .eq('organization_id', orgId)
      .eq('related_type', entityType)
      .eq('related_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (filters?.date_from) q = q.gte('created_at', filters.date_from);
    if (filters?.date_to) q = q.lte('created_at', filters.date_to);
    if (filters?.user_id) q = q.eq('user_id', filters.user_id);

    const { data } = await q;
    if (data) {
      for (const row of data) {
        const r = row as {
          id: string;
          body: string;
          user_id: string;
          created_at: string;
          is_pinned: boolean | null;
        };
        allEntries.push({
          id: r.id,
          type: 'note',
          timestamp: r.created_at,
          title: 'Nota',
          description: r.body,
          user_id: r.user_id,
          metadata: { is_pinned: r.is_pinned },
        });
      }
    }
  }

  // ─── Calls ───────────────────────────────────────────────────────────────
  if (typesToFetch.includes('call')) {
    const callFilter = entityType === 'customer' ? 'customer_id' : 'opportunity_id';
    let q = supabase
      .from('calls')
      .select('id, status, direction, from_number, to_number, started_at, duration_seconds, user_id, metadata')
      .eq('organization_id', orgId)
      .eq(callFilter, entityId)
      .order('started_at', { ascending: false })
      .limit(limit + 1);

    if (filters?.date_from) q = q.gte('started_at', filters.date_from);
    if (filters?.date_to) q = q.lte('started_at', filters.date_to);
    if (filters?.user_id) q = q.eq('user_id', filters.user_id);

    const { data } = await q;
    if (data) {
      for (const row of data) {
        const r = row as {
          id: string;
          status: string;
          direction: string;
          from_number: string;
          to_number: string;
          started_at: string;
          duration_seconds: number | null;
          user_id: string | null;
          metadata: Record<string, unknown>;
        };
        allEntries.push({
          id: r.id,
          type: 'call',
          timestamp: r.started_at,
          title: `Llamada ${r.direction} - ${r.status}`,
          description: `${r.from_number} → ${r.to_number} (${r.duration_seconds ?? 0}s)`,
          user_id: r.user_id,
          metadata: { ...r.metadata, direction: r.direction, status: r.status },
        });
      }
    }
  }

  // ─── Emails ──────────────────────────────────────────────────────────────
  if (typesToFetch.includes('email')) {
    let q = supabase
      .from('email_messages')
      .select('id, subject, to_email, from_email, sent_at, status, related_type, related_id')
      .eq('organization_id', orgId)
      .eq('related_type', entityType)
      .eq('related_id', entityId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(limit + 1);

    if (filters?.date_from) q = q.gte('sent_at', filters.date_from);
    if (filters?.date_to) q = q.lte('sent_at', filters.date_to);

    const { data } = await q;
    if (data) {
      for (const row of data) {
        const r = row as {
          id: string;
          subject: string;
          to_email: string;
          from_email: string;
          sent_at: string | null;
          status: string;
        };
        allEntries.push({
          id: r.id,
          type: 'email',
          timestamp: r.sent_at || new Date().toISOString(),
          title: r.subject,
          description: `${r.from_email} → ${r.to_email}`,
          user_id: null,
          metadata: { status: r.status, from: r.from_email, to: r.to_email },
        });
      }
    }
  }

  // ─── WhatsApp / Messages ─────────────────────────────────────────────────
  if (typesToFetch.includes('whatsapp')) {
    // La tabla `messages` usa sender_customer_id para vincular al cliente.
    // No tiene relación directa con opportunity.
    if (entityType === 'customer') {
      let q = supabase
        .from('messages')
        .select('id, content, direction, role, content_type, created_at, sender_customer_id, metadata')
        .eq('organization_id', orgId)
        .eq('sender_customer_id', entityId)
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      if (filters?.date_from) q = q.gte('created_at', filters.date_from);
      if (filters?.date_to) q = q.lte('created_at', filters.date_to);

      const { data } = await q;
      if (data) {
        for (const row of data) {
          const r = row as {
            id: string;
            content: string;
            direction: string;
            role: string;
            content_type: string;
            created_at: string;
            metadata: Record<string, unknown> | null;
          };
          allEntries.push({
            id: r.id,
            type: 'whatsapp',
            timestamp: r.created_at,
            title: `WhatsApp ${r.direction} (${r.role})`,
            description: r.content,
            user_id: null,
            metadata: { ...r.metadata, direction: r.direction, role: r.role, content_type: r.content_type },
          });
        }
      }
    }
  }

  // ─── Ordenar y paginar ───────────────────────────────────────────────────
  allEntries.sort((a, b) => {
    const tsCompare = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    if (tsCompare !== 0) return tsCompare;
    return b.id.localeCompare(a.id);
  });

  const hasMore = allEntries.length > limit;
  const entries = hasMore ? allEntries.slice(0, limit) : allEntries;

  let nextCursor: string | null = null;
  if (hasMore && entries.length > 0) {
    const last = entries[entries.length - 1];
    nextCursor = encodeCursor(last.timestamp, last.id);
  }

  return { entries, next_cursor: nextCursor };
}
