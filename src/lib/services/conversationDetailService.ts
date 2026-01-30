import { supabase } from '@/lib/supabase/config';

export interface Message {
  id: string;
  organization_id: number;
  conversation_id: string;
  channel_id: string;
  direction: 'inbound' | 'outbound';
  role: 'customer' | 'agent' | 'ai' | 'system';
  sender_customer_id: string | null;
  sender_member_id: number | null;
  content_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location';
  content: string;
  payload: Record<string, any>;
  external_message_id: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  attachments?: MessageAttachment[];
  events?: MessageEvent[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface MessageEvent {
  id: string;
  message_id: string;
  event_type: 'sent' | 'delivered' | 'read' | 'failed';
  provider_payload: Record<string, any>;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ConversationNote {
  id: string;
  organization_id: number;
  conversation_id: string;
  member_id: number;
  note: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  member?: {
    id: number;
    user_id: string;
  };
}

export interface QuickReply {
  id: string;
  organization_id: number;
  title: string;
  content: string;
  shortcut: string | null;
  tags: string[];
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  conversation_id: string;
  summary: string;
  key_points: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  generated_by: 'ai' | 'manual';
  created_at: string;
}

export interface AIJob {
  id: string;
  conversation_id: string;
  job_type: 'response' | 'summary' | 'classification';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response_text: string | null;
  confidence_score: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ConversationDetail {
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
  tags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

class ConversationDetailService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getConversation(conversationId: string): Promise<ConversationDetail | null> {
    try {
      const { data, error } = await supabase
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
            doc_number
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
        .eq('id', conversationId)
        .eq('organization_id', this.organizationId)
        .single();

      if (error) {
        console.error('Error en query de conversación:', error.message, error.details, error.hint);
        throw error;
      }

      if (data) {
        const { data: tagRelations } = await supabase
          .from('conversation_tag_relations')
          .select(`
            tag:conversation_tags (
              id,
              name,
              color
            )
          `)
          .eq('conversation_id', conversationId);

        const tags = tagRelations?.map((tr: any) => tr.tag).filter(Boolean) || [];
        return { ...data, tags };
      }

      return null;
    } catch (error: any) {
      console.error('Error obteniendo conversación:', error?.message || error);
      throw error;
    }
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          attachments:message_attachments(*),
          events:message_events(*)
        `)
        .eq('conversation_id', conversationId)
        .eq('organization_id', this.organizationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error en query de mensajes:', error.message, error.details, error.hint);
        throw error;
      }

      return (messages || []).map(msg => ({
        ...msg,
        attachments: msg.attachments || [],
        events: msg.events || []
      }));
    } catch (error: any) {
      console.error('Error obteniendo mensajes:', error?.message || error);
      throw error;
    }
  }

  async sendMessage(conversationId: string, content: string, contentType: string = 'text'): Promise<Message> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: conversation } = await supabase
        .from('conversations')
        .select('channel_id')
        .eq('id', conversationId)
        .single();

      const { data, error } = await supabase
        .from('messages')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          channel_id: conversation?.channel_id,
          direction: 'outbound',
          role: 'agent',
          sender_member_id: user?.id,
          content_type: contentType,
          content
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_agent_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      await this.createAuditLog(conversationId, 'message_sent', { message_id: data.id });

      return data;
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      throw error;
    }
  }

  async getNotes(conversationId: string): Promise<ConversationNote[]> {
    try {
      const { data, error } = await supabase
        .from('conversation_notes')
        .select(`
          *,
          member:organization_members!member_id (
            id,
            user_id
          )
        `)
        .eq('conversation_id', conversationId)
        .eq('organization_id', this.organizationId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo notas:', error);
      throw error;
    }
  }

  async addNote(conversationId: string, note: string): Promise<ConversationNote> {
    try {
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', this.organizationId)
        .single();

      const { data, error } = await supabase
        .from('conversation_notes')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          member_id: member?.id,
          note
        })
        .select()
        .single();

      if (error) throw error;

      await this.createAuditLog(conversationId, 'note_added', { note_id: data.id });
      return data;
    } catch (error) {
      console.error('Error agregando nota:', error);
      throw error;
    }
  }

  async toggleNotePin(noteId: string, isPinned: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversation_notes')
        .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
        .eq('id', noteId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando nota:', error);
      throw error;
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversation_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando nota:', error);
      throw error;
    }
  }

  async getQuickReplies(): Promise<QuickReply[]> {
    try {
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo respuestas rápidas:', error);
      throw error;
    }
  }

  async useQuickReply(quickReplyId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('increment_quick_reply_usage', {
        reply_id: quickReplyId
      });

      if (error) {
        await supabase
          .from('quick_replies')
          .update({ usage_count: supabase.rpc('usage_count') })
          .eq('id', quickReplyId);
      }
    } catch (error) {
      console.error('Error actualizando uso de respuesta rápida:', error);
    }
  }

  async getSummary(conversationId: string): Promise<ConversationSummary | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('organization_id', this.organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      return null;
    }
  }

  async updateConversationStatus(conversationId: string, status: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      await supabase
        .from('conversation_status_history')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          status,
          changed_at: new Date().toISOString()
        });

      await this.createAuditLog(conversationId, 'status_changed', { new_status: status });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      throw error;
    }
  }

  async updateConversationPriority(conversationId: string, priority: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ priority, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      await this.createAuditLog(conversationId, 'priority_changed', { new_priority: priority });
    } catch (error) {
      console.error('Error actualizando prioridad:', error);
      throw error;
    }
  }

  async assignConversation(conversationId: string, memberId: number | null): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: currentMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('user_id', user?.id)
        .single();

      const { error } = await supabase
        .from('conversations')
        .update({
          assigned_member_id: memberId,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      await supabase
        .from('conversation_assignments')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          assigned_member_id: memberId,
          assigned_by_member_id: currentMember?.id
        });

      await this.createAuditLog(conversationId, 'assigned', { assigned_to: memberId });
    } catch (error) {
      console.error('Error asignando conversación:', error);
      throw error;
    }
  }

  async addTag(conversationId: string, tagId: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('user_id', user?.id)
        .single();

      const { error } = await supabase
        .from('conversation_tag_relations')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          tag_id: tagId,
          created_by: member?.id
        });

      if (error) throw error;

      await this.createAuditLog(conversationId, 'tag_added', { tag_id: tagId });
    } catch (error) {
      console.error('Error agregando etiqueta:', error);
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
      console.error('Error removiendo etiqueta:', error);
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
      console.error('Error obteniendo etiquetas:', error);
      throw error;
    }
  }

  async getOrganizationMembers(): Promise<Array<{ id: number; user_id: string }>> {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('id, user_id')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo miembros:', error);
      throw error;
    }
  }

  async requestAIResponse(conversationId: string): Promise<AIJob> {
    try {
      const { data, error } = await supabase
        .from('ai_jobs')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          job_type: 'response',
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      await this.createAuditLog(conversationId, 'ai_response_requested', { job_id: data.id });
      return data;
    } catch (error) {
      console.error('Error solicitando respuesta IA:', error);
      throw error;
    }
  }

  async getActiveAIJob(conversationId: string): Promise<AIJob | null> {
    try {
      const { data, error } = await supabase
        .from('ai_jobs')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo trabajo IA activo:', error);
      return null;
    }
  }

  async markMessagesAsRead(conversationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .is('read_at', null);

      if (error) throw error;

      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);
    } catch (error) {
      console.error('Error marcando mensajes como leídos:', error);
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

export default ConversationDetailService;
