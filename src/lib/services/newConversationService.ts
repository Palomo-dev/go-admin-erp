import { supabase } from '@/lib/supabase/config';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';

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
  /**
   * @deprecated El mensaje inicial ya no se inserta aquí: va por
   * `enviarMensajeConversacion` (WhatsApp por la API) tras crear la conversación.
   */
  initial_message?: string;
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

    // Búsqueda única de clientes (RPC): sin tildes, todas las palabras, dígitos.
    const { filas } = await buscarClientes(supabase, { organizationId: this.organizationId, texto: search, limite: 10 });
    return filas.map((c) => ({
      id: c.id,
      organization_id: c.organization_id,
      full_name: c.full_name,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      identification_number: c.identification_number,
      doc_number: c.doc_number,
      avatar_url: c.avatar_url,
    })) as Customer[];
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

  /**
   * Crea la conversación SIN mensaje y SIN asignar. El mensaje inicial va
   * después por el camino único de envío (`enviarMensajeConversacion`) y la
   * asignación por `PUT /api/chat/conversaciones/[id]/asignacion` (valida
   * acceso al Chat, avisa a la persona y el trigger guarda el historial).
   * Antes se insertaba el mensaje directo —también en WhatsApp, por fuera de la
   * API— con `message_count: 1` que el trigger volvía a sumar.
   */
  async createConversation(data: NewConversationData, _userId: string, memberId: number): Promise<string> {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        organization_id: this.organizationId,
        channel_id: data.channel_id,
        customer_id: data.customer_id,
        status: 'open',
        priority: data.priority || 'normal',
        assigned_member_id: null,
        unread_count: 0,
        metadata: data.subject ? { subject: data.subject } : {}
      })
      .select('id')
      .single();

    if (convError) {
      console.error('Error creando conversación:', convError);
      throw convError;
    }

    const conversationId = conversation.id as string;

    if (data.tag_ids && data.tag_ids.length > 0) {
      const { error: tagError } = await supabase.from('conversation_tag_relations').insert(
        data.tag_ids.map((tagId) => ({ organization_id: this.organizationId, conversation_id: conversationId, tag_id: tagId, created_by: memberId }))
      );
      if (tagError) console.error('Error agregando etiquetas:', tagError);
    }

    // El trigger de historial solo corre en UPDATE: el estado inicial se registra aquí.
    const { error: statusError } = await supabase.from('conversation_status_history').insert({
      organization_id: this.organizationId,
      conversation_id: conversationId,
      from_status: null,
      to_status: 'open',
      changed_by_member_id: memberId,
      reason: 'Conversación creada manualmente'
    });
    if (statusError) console.error('Error registrando historial:', statusError);

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
