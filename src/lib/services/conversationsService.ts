import { supabase } from '@/lib/supabase/config';

// ─── Lista de conversaciones: último mensaje y etiquetas en la misma consulta ───────────────
//
// Antes, por CADA conversación de la lista se pedían aparte su último mensaje y sus etiquetas
// (1 + 2 por conversación), y la bandeja recarga la lista con cada mensaje que entra: ~10.000
// consultas al día desde 3 navegadores (medido el 2026-11-24). Las dos relaciones tienen una
// sola llave foránea hacia `conversations` (verificado por MCP), así que PostgREST las embebe.

const SELECT_LISTA = `
  *,
  customer:customers (
    id,
    full_name,
    first_name,
    last_name,
    email,
    phone,
    doc_number,
    is_online,
    last_seen_at
  ),
  channel:channels (
    id,
    type,
    name,
    status,
    ai_mode
  ),
  assigned_member:organization_members (
    id,
    user_id
  )
`;

/** Alias de los embebidos; se quitan de la fila al armar `last_message` y `tags`. */
const ALIAS_ULTIMO_MENSAJE = 'ultimo_mensaje';
const ALIAS_ETIQUETAS = 'relaciones_etiqueta';

const SELECT_LISTA_CON_DETALLES = `${SELECT_LISTA},
  ${ALIAS_ULTIMO_MENSAJE}:messages ( id, content, created_at, direction, role, is_read ),
  ${ALIAS_ETIQUETAS}:conversation_tag_relations ( tag:conversation_tags ( id, name, color ) )
`;

interface ConsultaConEmbebidos<Q> {
  order(columna: string, opciones: { ascending: boolean; referencedTable: string }): Q;
  limit(cantidad: number, opciones: { referencedTable: string }): Q;
}

/** Solo el mensaje más reciente de cada conversación (límite por fila padre, no global). */
function ultimoMensajePorConversacion<Q extends ConsultaConEmbebidos<Q>>(query: Q): Q {
  return query
    .order('created_at', { ascending: false, referencedTable: ALIAS_ULTIMO_MENSAJE })
    .limit(1, { referencedTable: ALIAS_ULTIMO_MENSAJE });
}

type FilaLista = Record<string, unknown> & { id: string };
type RespuestaLista = { data: unknown; error: { message: string; details?: string; hint?: string; code?: string } | null };

/** Fila con embebidos → la forma de siempre: `last_message` (o null) y `tags`. */
export function filaConDetalles(fila: FilaLista): Conversation {
  const { [ALIAS_ULTIMO_MENSAJE]: mensajes, [ALIAS_ETIQUETAS]: relaciones, ...resto } = fila;
  const ultimo = Array.isArray(mensajes) ? mensajes[0] ?? null : mensajes ?? null;
  const tags = (Array.isArray(relaciones) ? relaciones : [])
    .map((r) => (r as { tag?: unknown }).tag)
    .filter(Boolean);
  return { ...resto, last_message: ultimo, tags } as unknown as Conversation;
}

/** La forma anterior: último mensaje y etiquetas, dos consultas por conversación. */
async function detallesUnaPorUna(filas: FilaLista[]): Promise<Conversation[]> {
  return Promise.all(
    filas.map(async (conv) => {
      const [messagesResult, tagsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('id, content, created_at, direction, role, is_read')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('conversation_tag_relations')
          .select(`tag:conversation_tags (id, name, color)`)
          .eq('conversation_id', conv.id),
      ]);
      const lastMessage = messagesResult.data?.[0] || null;
      const tags = (tagsResult.data as { tag: unknown }[] | null)?.map((tr) => tr.tag).filter(Boolean) || [];
      return { ...conv, last_message: lastMessage, tags } as unknown as Conversation;
    }),
  );
}

/**
 * Corre la lista con los detalles embebidos; si esa consulta falla (p. ej. PostgREST rechaza el
 * embebido), cae a la forma anterior para que la bandeja nunca se quede sin lista.
 */
async function conDetallesDeLista(
  conDetalles: () => PromiseLike<RespuestaLista>,
  sinDetalles: () => PromiseLike<RespuestaLista>,
  nombre: string,
): Promise<Conversation[]> {
  const embebida = await conDetalles();
  if (!embebida.error) return ((embebida.data as FilaLista[] | null) ?? []).map(filaConDetalles);
  console.warn(`[conversaciones] ${nombre}: la consulta con detalles falló; se usa la forma anterior`, embebida.error.message);

  const { data, error } = await sinDetalles();
  if (error) {
    console.error(`Error en query de ${nombre}:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
  return detallesUnaPorUna((data as FilaLista[] | null) ?? []);
}

export interface Conversation {
  id: string;
  organization_id: number;
  channel_id: string;
  customer_id: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_member_id: number | null;
  last_message_at: string;
  last_agent_message_at: string | null;
  message_count: number;
  unread_count: number;
  created_at: string;
  updated_at: string;
  
  customer?: {
    id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    doc_number: string;
    is_online?: boolean;
    last_seen_at?: string;
  };
  channel?: {
    id: string;
    type: string;
    name: string;
    status: string;
    ai_mode: string;
  };
  assigned_member?: {
    id: number;
    user_id: string;
  };
  last_message?: {
    id: string;
    content: string;
    created_at: string;
    direction: string;
    role: string;
    is_read?: boolean;
  };
  tags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export interface ConversationStats {
  total: number;
  open: number;
  pending: number;
  closed: number;
  unassigned: number;
  out_of_sla: number;
}

export interface ConversationFilters {
  status?: string;
  priority?: string;
  channel?: string;
  assigned_member_id?: number;
  tag_id?: string;
  unresponded?: boolean;
  my_conversations?: boolean;
  search?: string;
  /** Solo conversaciones sin asignar (vista rápida «Sin asignar»). */
  unassigned?: boolean;
}

/** Conteos de las vistas rápidas de la Bandeja (Figma 91-chat-01). */
export interface ConteoVistas {
  abiertas: number;
  mias: number;
  sinAsignar: number;
  pendientes: number;
  cerradas: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedConversations {
  data: Conversation[];
  total: number;
  hasMore: boolean;
}

class ConversationsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getConversationsPaginated(
    filters?: ConversationFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedConversations> {
    const limit = pagination?.limit || 20;
    const offset = pagination?.offset || 0;

    try {
      // Si hay filtro de tag, obtener los conversation_ids primero
      let tagConversationIds: string[] | null = null;
      if (filters?.tag_id) {
        const { data: tagData } = await supabase
          .from('conversation_tag_relations')
          .select('conversation_id')
          .eq('tag_id', filters.tag_id);
        tagConversationIds = tagData?.map((tr: { conversation_id: string }) => tr.conversation_id) || [];
        if (tagConversationIds.length === 0) {
          return { data: [], total: 0, hasMore: false };
        }
      }

      // Primero obtener el total
      let countQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId);

      if (filters?.status) {
        countQuery = countQuery.eq('status', filters.status);
      }
      if (filters?.priority) {
        countQuery = countQuery.eq('priority', filters.priority);
      }
      if (filters?.channel) {
        countQuery = countQuery.eq('channel_id', filters.channel);
      }
      if (filters?.assigned_member_id) {
        countQuery = countQuery.eq('assigned_member_id', filters.assigned_member_id);
      }
      if (filters?.unresponded) {
        countQuery = countQuery.is('last_agent_message_at', null);
      }
      if (filters?.unassigned) {
        countQuery = countQuery.is('assigned_member_id', null);
      }
      if (filters?.tag_id && tagConversationIds) {
        countQuery = countQuery.in('id', tagConversationIds);
      }

      const { count: total } = await countQuery;

      // Luego obtener los datos paginados. Con el último mensaje y las etiquetas en la MISMA
      // consulta; si esa forma falla, se cae a la de antes (lista y luego detalle una por una).
      const armar = (campos: string, conDetalles: boolean) => {
        let query = supabase
          .from('conversations')
          .select(campos)
          .eq('organization_id', this.organizationId)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);
        if (conDetalles) query = ultimoMensajePorConversacion(query);

        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.priority) {
          query = query.eq('priority', filters.priority);
        }
        if (filters?.channel) {
          query = query.eq('channel_id', filters.channel);
        }
        if (filters?.assigned_member_id) {
          query = query.eq('assigned_member_id', filters.assigned_member_id);
        }
        if (filters?.unresponded) {
          query = query.is('last_agent_message_at', null);
        }
        if (filters?.unassigned) {
          query = query.is('assigned_member_id', null);
        }
        if (filters?.tag_id && tagConversationIds) {
          query = query.in('id', tagConversationIds);
        }
        return query;
      };

      const conversationsWithDetails = await conDetallesDeLista(
        () => armar(SELECT_LISTA_CON_DETALLES, true),
        () => armar(SELECT_LISTA, false),
        'conversaciones paginadas',
      );

      return {
        data: conversationsWithDetails,
        total: total || 0,
        hasMore: offset + limit < (total || 0)
      };
    } catch (error: unknown) {
      console.error('Error obteniendo conversaciones paginadas:', error);
      throw new Error((error as { message?: string } | null)?.message || 'Error al obtener conversaciones');
    }
  }

  async getConversations(filters?: ConversationFilters): Promise<Conversation[]> {
    try {
      const armar = (campos: string, conDetalles: boolean) => {
        let query = supabase
          .from('conversations')
          .select(campos)
          .eq('organization_id', this.organizationId)
          .order('last_message_at', { ascending: false, nullsFirst: false });
        if (conDetalles) query = ultimoMensajePorConversacion(query);

        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.priority) {
          query = query.eq('priority', filters.priority);
        }
        if (filters?.channel) {
          query = query.eq('channel_id', filters.channel);
        }
        if (filters?.assigned_member_id) {
          query = query.eq('assigned_member_id', filters.assigned_member_id);
        }
        if (filters?.unresponded) {
          query = query.is('last_agent_message_at', null);
        }
        return query;
      };

      const conversationsWithDetails = await conDetallesDeLista(
        () => armar(SELECT_LISTA_CON_DETALLES, true),
        () => armar(SELECT_LISTA, false),
        'conversaciones',
      );

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        return conversationsWithDetails.filter(conv => 
          conv.customer?.full_name?.toLowerCase().includes(searchLower) ||
          conv.customer?.email?.toLowerCase().includes(searchLower) ||
          conv.customer?.phone?.includes(searchLower) ||
          conv.customer?.doc_number?.includes(searchLower) ||
          conv.id.toLowerCase().includes(searchLower)
        );
      }

      if (filters?.tag_id) {
        return conversationsWithDetails.filter(conv =>
          conv.tags?.some((tag: { id: string }) => tag.id === filters.tag_id)
        );
      }

      return conversationsWithDetails;
    } catch (error: unknown) {
      const e = error as { message?: string; name?: string; stack?: string } | null;
      console.error('Error obteniendo conversaciones:', {
        error,
        message: e?.message,
        name: e?.name,
        stack: e?.stack?.slice(0, 500)
      });
      throw new Error(e?.message || 'Error desconocido al obtener conversaciones');
    }
  }

  async getStats(): Promise<ConversationStats> {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('status, assigned_member_id, last_agent_message_at, created_at')
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      const stats: ConversationStats = {
        total: data?.length || 0,
        open: data?.filter(c => c.status === 'open').length || 0,
        pending: data?.filter(c => c.status === 'pending').length || 0,
        closed: data?.filter(c => c.status === 'closed').length || 0,
        unassigned: data?.filter(c => !c.assigned_member_id).length || 0,
        out_of_sla: 0
      };

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /** Conteos de las vistas rápidas, con `count` en la base (sin traer filas). */
  async contarVistas(memberId: number | null): Promise<ConteoVistas> {
    const base = () => supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', this.organizationId);
    const [abiertas, mias, sinAsignar, pendientes, cerradas] = await Promise.all([
      base().eq('status', 'open'),
      memberId ? base().eq('status', 'open').eq('assigned_member_id', memberId) : Promise.resolve({ count: 0 }),
      base().eq('status', 'open').is('assigned_member_id', null),
      base().eq('status', 'pending'),
      base().eq('status', 'closed'),
    ]);
    return {
      abiertas: abiertas.count ?? 0,
      mias: mias.count ?? 0,
      sinAsignar: sinAsignar.count ?? 0,
      pendientes: pendientes.count ?? 0,
      cerradas: cerradas.count ?? 0,
    };
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      await this.createAuditLog(id, 'update', updates);
    } catch (error) {
      console.error('Error actualizando conversación:', error);
      throw error;
    }
  }

  async addTag(conversationId: string, tagId: string, createdBy?: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversation_tag_relations')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          tag_id: tagId,
          created_by: createdBy
        });

      if (error) throw error;

      await this.createAuditLog(conversationId, 'tag_added', { tag_id: tagId });
    } catch (error) {
      console.error('Error agregando tag:', error);
      throw error;
    }
  }

  async removeTag(conversationId: string, tagId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversation_tag_relations')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('tag_id', tagId);

      if (error) throw error;

      await this.createAuditLog(conversationId, 'tag_removed', { tag_id: tagId });
    } catch (error) {
      console.error('Error removiendo tag:', error);
      throw error;
    }
  }

  async getTags(): Promise<Array<{ id: string; name: string; color: string }>> {
    try {
      const { data, error } = await supabase
        .from('conversation_tags')
        .select('id, name, color')
        .eq('organization_id', this.organizationId)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo tags:', error);
      throw error;
    }
  }

  async getChannels(): Promise<Array<{ id: string; name: string; type: string }>> {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, type')
        .eq('organization_id', this.organizationId)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo canales:', error);
      throw error;
    }
  }

  private async createAuditLog(conversationId: string, action: string, details: unknown): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase
        .from('chat_audit_logs')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          action,
          details,
          created_by: user?.id
        });
    } catch (error) {
      console.error('Error creando audit log:', error);
    }
  }
}

export default ConversationsService;
