import { supabase } from '@/lib/supabase/config';

export interface Customer {
  id: string;
  organization_id: number;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  identification_number: string | null;
  doc_number: string | null;
  avatar_url: string | null;
}

export interface Channel {
  id: string;
  organization_id: number;
  type: string;
  name: string;
  status: string;
  ai_mode: string;
}

export interface ConversationTag {
  id: string;
  organization_id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface OrganizationMember {
  id: number;
  user_id: string;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
  };
}

export interface NewConversationData {
  channel_id: string;
  customer_id: string;
  subject?: string;
  initial_message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tag_ids?: string[];
  assigned_member_id?: number;
}

export interface QuickCustomerData {
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

class NewConversationService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getActiveChannels(): Promise<Channel[]> {
    const { data, error } = await supabase
      .from('channels')
      .select('id, organization_id, type, name, status, ai_mode')
      .eq('organization_id', this.organizationId)
      .eq('status', 'active')
      .order('name');

    if (error) {
      console.error('Error obteniendo canales:', error);
      throw error;
    }

    return data || [];
  }

  async searchCustomers(search: string): Promise<Customer[]> {
    if (!search || search.length < 2) return [];

    const searchLower = `%${search.toLowerCase()}%`;

    const { data, error } = await supabase
      .from('customers')
      .select('id, organization_id, full_name, first_name, last_name, email, phone, identification_number, doc_number, avatar_url')
      .eq('organization_id', this.organizationId)
      .or(`full_name.ilike.${searchLower},email.ilike.${searchLower},phone.ilike.${searchLower},identification_number.ilike.${searchLower},doc_number.ilike.${searchLower}`)
      .limit(10);

    if (error) {
      console.error('Error buscando clientes:', error);
      throw error;
    }

    return data || [];
  }

  async getConversationTags(): Promise<ConversationTag[]> {
    const { data, error } = await supabase
      .from('conversation_tags')
      .select('id, organization_id, name, color, description')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (error) {
      console.error('Error obteniendo etiquetas:', error);
      throw error;
    }

    return data || [];
  }

  async getOrganizationMembers(): Promise<OrganizationMember[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        profile:profiles!user_id (
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    if (error) {
      console.error('Error obteniendo miembros:', error);
      throw error;
    }

    return (data || []).map(m => ({
      id: m.id,
      user_id: m.user_id,
      profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
    }));
  }

  async createQuickCustomer(data: QuickCustomerData): Promise<Customer> {
    const fullName = data.last_name 
      ? `${data.first_name} ${data.last_name}`.trim()
      : data.first_name;

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: this.organizationId,
        first_name: data.first_name,
        last_name: data.last_name || null,
        email: data.email || null,
        phone: data.phone || null,
        roles: ['cliente', 'huesped'],
        fiscal_responsibilities: ['R-99-PN'],
        fiscal_municipality_id: 'aa4b6637-0060-41bb-9459-bc95f9789e08',
        tags: [],
        metadata: {},
        preferences: {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando cliente rápido:', error);
      throw error;
    }

    return customer;
  }

  async createConversation(
    data: NewConversationData,
    userId: string,
    memberId: number
  ): Promise<string> {
    const now = new Date().toISOString();

    // 1. Crear la conversación
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        organization_id: this.organizationId,
        channel_id: data.channel_id,
        customer_id: data.customer_id,
        status: 'open',
        priority: data.priority || 'normal',
        assigned_member_id: data.assigned_member_id || memberId,
        last_message_at: now,
        last_agent_message_at: now,
        message_count: 1,
        unread_count: 0,
        metadata: data.subject ? { subject: data.subject } : {}
      })
      .select('id')
      .single();

    if (convError) {
      console.error('Error creando conversación:', convError);
      throw convError;
    }

    const conversationId = conversation.id;

    // 2. Crear el mensaje inicial (outbound desde agente)
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        organization_id: this.organizationId,
        conversation_id: conversationId,
        channel_id: data.channel_id,
        direction: 'outbound',
        role: 'agent',
        sender_member_id: memberId,
        content_type: 'text',
        content: data.initial_message,
        payload: {},
        is_read: true,
        metadata: {}
      });

    if (msgError) {
      console.error('Error creando mensaje:', msgError);
      throw msgError;
    }

    // 3. Agregar etiquetas si se proporcionaron
    if (data.tag_ids && data.tag_ids.length > 0) {
      const tagRelations = data.tag_ids.map(tagId => ({
        organization_id: this.organizationId,
        conversation_id: conversationId,
        tag_id: tagId
      }));

      const { error: tagError } = await supabase
        .from('conversation_tag_relations')
        .insert(tagRelations);

      if (tagError) {
        console.error('Error agregando etiquetas:', tagError);
      }
    }

    // 4. Crear asignación si se asignó a alguien diferente
    if (data.assigned_member_id) {
      const { error: assignError } = await supabase
        .from('conversation_assignments')
        .insert({
          organization_id: this.organizationId,
          conversation_id: conversationId,
          assigned_member_id: data.assigned_member_id,
          assigned_by_member_id: memberId,
          reason: 'Asignación al crear conversación'
        });

      if (assignError) {
        console.error('Error creando asignación:', assignError);
      }
    }

    // 5. Registrar historial de estado inicial
    const { error: statusError } = await supabase
      .from('conversation_status_history')
      .insert({
        organization_id: this.organizationId,
        conversation_id: conversationId,
        from_status: null,
        to_status: 'open',
        changed_by_member_id: memberId,
        reason: 'Conversación creada manualmente'
      });

    if (statusError) {
      console.error('Error registrando historial:', statusError);
    }

    // 6. Registrar en audit log
    const { error: auditError } = await supabase
      .from('chat_audit_logs')
      .insert({
        organization_id: this.organizationId,
        entity_type: 'conversation',
        entity_id: conversationId,
        action: 'create',
        actor_member_id: memberId,
        details: {
          channel_id: data.channel_id,
          customer_id: data.customer_id,
          priority: data.priority || 'normal',
          assigned_member_id: data.assigned_member_id,
          tag_count: data.tag_ids?.length || 0
        }
      });

    if (auditError) {
      console.error('Error en audit log:', auditError);
    }

    return conversationId;
  }

  async getCurrentMemberId(userId: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.error('Error obteniendo member id:', error);
      return null;
    }

    return data.id;
  }
}

export default NewConversationService;
