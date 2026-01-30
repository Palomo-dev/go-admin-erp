import { supabase } from '@/lib/supabase/config';

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

      const { count: total } = await countQuery;

      // Luego obtener los datos paginados
      let query = supabase
        .from('conversations')
        .select(`
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
        `)
        .eq('organization_id', this.organizationId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

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

      const { data, error } = await query;

      if (error) {
        console.error('Error en query de conversaciones paginadas:', error);
        throw error;
      }

      // Obtener último mensaje y tags para cada conversación
      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv) => {
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
              .eq('conversation_id', conv.id)
          ]);
          
          const lastMessage = messagesResult.data?.[0] || null;
          const tags = tagsResult.data?.map((tr: any) => tr.tag).filter(Boolean) || [];

          return {
            ...conv,
            last_message: lastMessage,
            tags
          };
        })
      );

      return {
        data: conversationsWithDetails,
        total: total || 0,
        hasMore: offset + limit < (total || 0)
      };
    } catch (error: any) {
      console.error('Error obteniendo conversaciones paginadas:', error);
      throw new Error(error?.message || 'Error al obtener conversaciones');
    }
  }

  async getConversations(filters?: ConversationFilters): Promise<Conversation[]> {
    try {
      let query = supabase
        .from('conversations')
        .select(`
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
        `)
        .eq('organization_id', this.organizationId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

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

      const { data, error } = await query;

      if (error) {
        console.error('Error en query de conversaciones:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv) => {
          const { data: messagesData } = await supabase
            .from('messages')
            .select('id, content, created_at, direction, role, is_read')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);
          
          const lastMessage = messagesData?.[0] || null;

          const { data: tagRelations } = await supabase
            .from('conversation_tag_relations')
            .select(`
              tag:conversation_tags (
                id,
                name,
                color
              )
            `)
            .eq('conversation_id', conv.id);

          const tags = tagRelations?.map((tr: any) => tr.tag).filter(Boolean) || [];

          return {
            ...conv,
            last_message: lastMessage,
            tags
          };
        })
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
          conv.tags?.some((tag: any) => tag.id === filters.tag_id)
        );
      }

      return conversationsWithDetails;
    } catch (error: any) {
      console.error('Error obteniendo conversaciones:', {
        error,
        message: error?.message,
        name: error?.name,
        stack: error?.stack?.slice(0, 500)
      });
      throw new Error(error?.message || 'Error desconocido al obtener conversaciones');
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

  private async createAuditLog(conversationId: string, action: string, details: any): Promise<void> {
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
