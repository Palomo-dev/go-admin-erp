import { supabase } from '@/lib/supabase/config';
import crypto from 'crypto';

export interface ConversationTag {
  id: string;
  organization_id: number;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
  created_by: number | null;
  usage_count?: number;
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
  updated_at: string;
  created_by: number | null;
}

export interface ChannelApiKey {
  id: string;
  organization_id: number;
  channel_id: string | null;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: number | null;
  revoked_at: string | null;
  revoked_by: number | null;
  channel?: {
    id: string;
    name: string;
    type: string;
  };
}

export interface Channel {
  id: string;
  name: string;
  type: string;
}

export const TAG_COLORS = [
  { value: '#3b82f6', label: 'Azul', class: 'bg-blue-500' },
  { value: '#22c55e', label: 'Verde', class: 'bg-green-500' },
  { value: '#eab308', label: 'Amarillo', class: 'bg-yellow-500' },
  { value: '#f97316', label: 'Naranja', class: 'bg-orange-500' },
  { value: '#ef4444', label: 'Rojo', class: 'bg-red-500' },
  { value: '#a855f7', label: 'Púrpura', class: 'bg-purple-500' },
  { value: '#ec4899', label: 'Rosa', class: 'bg-pink-500' },
  { value: '#6366f1', label: 'Índigo', class: 'bg-indigo-500' },
  { value: '#14b8a6', label: 'Teal', class: 'bg-teal-500' },
  { value: '#64748b', label: 'Gris', class: 'bg-slate-500' },
];

export const API_SCOPES = [
  { value: 'messages:read', label: 'Leer mensajes', description: 'Permite leer mensajes de conversaciones' },
  { value: 'messages:write', label: 'Enviar mensajes', description: 'Permite enviar mensajes a conversaciones' },
  { value: 'conversations:read', label: 'Leer conversaciones', description: 'Permite ver lista de conversaciones' },
  { value: 'conversations:write', label: 'Gestionar conversaciones', description: 'Permite crear y modificar conversaciones' },
  { value: 'contacts:read', label: 'Leer contactos', description: 'Permite ver información de contactos' },
  { value: 'contacts:write', label: 'Gestionar contactos', description: 'Permite crear y modificar contactos' },
  { value: 'webhooks:manage', label: 'Webhooks', description: 'Permite configurar webhooks' },
];

export const QUICK_REPLY_VARIABLES = [
  { value: '{{customer_name}}', label: 'Nombre del cliente', description: 'Nombre del cliente de la conversación' },
  { value: '{{agent_name}}', label: 'Nombre del agente', description: 'Nombre del agente asignado' },
  { value: '{{organization_name}}', label: 'Nombre de la organización', description: 'Nombre de tu empresa' },
  { value: '{{current_date}}', label: 'Fecha actual', description: 'Fecha de hoy' },
  { value: '{{current_time}}', label: 'Hora actual', description: 'Hora actual' },
];

class InboxConfigService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext(): Promise<void> {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  private async logAudit(action: string, entityType: string, entityId: string | null, changes: Record<string, any>): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        changes,
        metadata: {},
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }

  async getTags(): Promise<ConversationTag[]> {
    await this.setOrgContext();

    const { data: tags, error } = await supabase
      .from('conversation_tags')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (error) {
      console.error('Error obteniendo etiquetas:', error);
      return [];
    }

    const { data: relations } = await supabase
      .from('conversation_tag_relations')
      .select('tag_id')
      .eq('organization_id', this.organizationId);

    const usageMap = new Map<string, number>();
    (relations || []).forEach(r => {
      usageMap.set(r.tag_id, (usageMap.get(r.tag_id) || 0) + 1);
    });

    return (tags || []).map(tag => ({
      ...tag,
      usage_count: usageMap.get(tag.id) || 0
    }));
  }

  async createTag(data: { name: string; color: string; description?: string }): Promise<ConversationTag> {
    await this.setOrgContext();

    const { data: tag, error } = await supabase
      .from('conversation_tags')
      .insert({
        organization_id: this.organizationId,
        name: data.name,
        color: data.color,
        description: data.description || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando etiqueta:', error);
      throw new Error('No se pudo crear la etiqueta');
    }

    await this.logAudit('create_tag', 'conversation_tag', tag.id, data);
    return { ...tag, usage_count: 0 };
  }

  async updateTag(id: string, data: { name?: string; color?: string; description?: string }): Promise<ConversationTag> {
    await this.setOrgContext();

    const { data: tag, error } = await supabase
      .from('conversation_tags')
      .update(data)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando etiqueta:', error);
      throw new Error('No se pudo actualizar la etiqueta');
    }

    await this.logAudit('update_tag', 'conversation_tag', id, data);
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    await this.setOrgContext();

    await supabase
      .from('conversation_tag_relations')
      .delete()
      .eq('tag_id', id)
      .eq('organization_id', this.organizationId);

    const { error } = await supabase
      .from('conversation_tags')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error eliminando etiqueta:', error);
      throw new Error('No se pudo eliminar la etiqueta');
    }

    await this.logAudit('delete_tag', 'conversation_tag', id, {});
  }

  async getQuickReplies(): Promise<QuickReply[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('title');

    if (error) {
      console.error('Error obteniendo respuestas rápidas:', error);
      return [];
    }

    return data || [];
  }

  async createQuickReply(data: { title: string; content: string; shortcut?: string; tags?: string[] }): Promise<QuickReply> {
    await this.setOrgContext();

    const { data: reply, error } = await supabase
      .from('quick_replies')
      .insert({
        organization_id: this.organizationId,
        title: data.title,
        content: data.content,
        shortcut: data.shortcut || null,
        tags: data.tags || [],
        is_active: true,
        usage_count: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando respuesta rápida:', error);
      throw new Error('No se pudo crear la respuesta rápida');
    }

    await this.logAudit('create_quick_reply', 'quick_reply', reply.id, data);
    return reply;
  }

  async updateQuickReply(id: string, data: { title?: string; content?: string; shortcut?: string; tags?: string[]; is_active?: boolean }): Promise<QuickReply> {
    await this.setOrgContext();

    const { data: reply, error } = await supabase
      .from('quick_replies')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando respuesta rápida:', error);
      throw new Error('No se pudo actualizar la respuesta rápida');
    }

    await this.logAudit('update_quick_reply', 'quick_reply', id, data);
    return reply;
  }

  async deleteQuickReply(id: string): Promise<void> {
    await this.setOrgContext();

    const { error } = await supabase
      .from('quick_replies')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error eliminando respuesta rápida:', error);
      throw new Error('No se pudo eliminar la respuesta rápida');
    }

    await this.logAudit('delete_quick_reply', 'quick_reply', id, {});
  }

  async getApiKeys(): Promise<ChannelApiKey[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channel_api_keys')
      .select(`
        *,
        channel:channels(id, name, type)
      `)
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo API keys:', error);
      return [];
    }

    return data || [];
  }

  async getChannels(): Promise<Channel[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (error) {
      console.error('Error obteniendo canales:', error);
      return [];
    }

    return data || [];
  }

  async createApiKey(data: { name: string; channel_id?: string; scopes: string[]; expires_at?: string }): Promise<{ key: ChannelApiKey; rawKey: string }> {
    await this.setOrgContext();

    const rawKey = `goak_${this.generateRandomKey(32)}`;
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);

    const { data: key, error } = await supabase
      .from('channel_api_keys')
      .insert({
        organization_id: this.organizationId,
        name: data.name,
        channel_id: data.channel_id || null,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: data.scopes,
        expires_at: data.expires_at || null,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando API key:', error);
      throw new Error('No se pudo crear la API key');
    }

    await this.logAudit('create_api_key', 'channel_api_key', key.id, { name: data.name, scopes: data.scopes });
    return { key, rawKey };
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.setOrgContext();

    const { error } = await supabase
      .from('channel_api_keys')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error revocando API key:', error);
      throw new Error('No se pudo revocar la API key');
    }

    await this.logAudit('revoke_api_key', 'channel_api_key', id, {});
  }

  async rotateApiKey(id: string): Promise<{ key: ChannelApiKey; rawKey: string }> {
    await this.setOrgContext();

    const { data: existingKey } = await supabase
      .from('channel_api_keys')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (!existingKey) {
      throw new Error('API key no encontrada');
    }

    await this.revokeApiKey(id);

    return this.createApiKey({
      name: existingKey.name,
      channel_id: existingKey.channel_id,
      scopes: existingKey.scopes,
      expires_at: existingKey.expires_at
    });
  }

  private generateRandomKey(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private hashKey(key: string): string {
    if (typeof window !== 'undefined') {
      return btoa(key);
    }
    return Buffer.from(key).toString('base64');
  }
}

export default InboxConfigService;
