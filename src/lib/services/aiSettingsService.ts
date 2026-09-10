import { supabase } from '@/lib/supabase/config';

export interface AISettings {
  id: string;
  organization_id: number;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  system_rules: string | null;
  tone: string;
  language: string;
  fallback_message: string;
  auto_response_enabled: boolean;
  auto_response_delay_seconds: number;
  confidence_threshold: number;
  max_fragments_context: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  organization_id: number;
  type: string;
  name: string;
  status: string;
  ai_mode: 'ai_only' | 'hybrid' | 'manual';
  business_hours: Record<string, any>;
  auto_close_inactive_hours: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateAISettingsData {
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_rules?: string;
  tone?: string;
  language?: string;
  fallback_message?: string;
  auto_response_enabled?: boolean;
  auto_response_delay_seconds?: number;
  confidence_threshold?: number;
  max_fragments_context?: number;
  is_active?: boolean;
}

/**
 * Catalogo de modelos de IA.
 *
 * Antes esto era una constante cableada con gpt-4-turbo, o1, claude-3-* y
 * gemini-pro: modelos obsoletos, desalineados con providerRegistry.ts y sin
 * relacion con las tarifas reales de `provider_pricing`. Ahora se sirve desde
 * /api/chat/ai/modelos, que une el catalogo con la tarifa vigente y ademas dice
 * si la organizacion tiene credenciales para cada proveedor.
 */
export type GamaModelo = 'economico' | 'equilibrado' | 'premium' | 'legacy';

export interface ModeloIA {
  provider: string;
  value: string;
  label: string;
  gama: GamaModelo;
  recomendado: boolean;
  contextoTokens: number | null;
  soportaVision: boolean | null;
  nota: string | null;
  costoEntradaUsdMillon: number | null;
  costoSalidaUsdMillon: number | null;
  /** false = sin tarifa en provider_pricing: su costo no se puede calcular. */
  tarifaCargada: boolean;
}

export interface ProveedorIA {
  value: string;
  label: string;
  /** false = la organizacion no tiene credenciales; no se debe poder elegir. */
  usable: boolean;
  motivo: string | null;
}

export interface CatalogoModelos {
  proveedores: ProveedorIA[];
  modelos: ModeloIA[];
}

export async function fetchCatalogoModelos(): Promise<CatalogoModelos> {
  const res = await fetch('/api/chat/ai/modelos');
  if (!res.ok) {
    throw new Error('No se pudo cargar el catálogo de modelos');
  }
  return res.json();
}

/** Costo estimado en USD de una respuesta, con el consumo real promedio. */
export function estimarCostoRespuesta(
  modelo: ModeloIA,
  tokensEntrada: number,
  tokensSalida: number
): number | null {
  if (!modelo.tarifaCargada) return null;
  const entrada = (tokensEntrada / 1_000_000) * (modelo.costoEntradaUsdMillon ?? 0);
  const salida = (tokensSalida / 1_000_000) * (modelo.costoSalidaUsdMillon ?? 0);
  return entrada + salida;
}

export interface OrganizationAIConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemRules: string | null;
  tone: string;
  language: string;
  fallbackMessage: string;
  confidenceThreshold: number;
  maxFragmentsContext: number;
  isActive: boolean;
}

export const TONE_OPTIONS = [
  { value: 'professional', label: 'Profesional' },
  { value: 'friendly', label: 'Amigable' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'empathetic', label: 'Empático' }
];

export const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
  { value: 'fr', label: 'Francés' }
];

export const AI_MODE_OPTIONS = [
  { value: 'ai_only', label: 'Solo IA', description: 'La IA responde automáticamente sin intervención humana' },
  { value: 'hybrid', label: 'Híbrido', description: 'La IA responde y puede escalar a un agente humano' },
  { value: 'manual', label: 'Manual', description: 'Solo agentes humanos responden, IA desactivada' }
];

export default class AISettingsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext() {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  async getSettings(): Promise<AISettings | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error obteniendo configuración IA:', error);
      return null;
    }

    return data;
  }

  async createSettings(settings: UpdateAISettingsData): Promise<AISettings> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('ai_settings')
      .insert({
        organization_id: this.organizationId,
        ...settings
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando configuración IA:', error);
      throw new Error('No se pudo crear la configuración');
    }

    return data;
  }

  async updateSettings(settings: UpdateAISettingsData, memberId: number): Promise<AISettings> {
    await this.setOrgContext();

    const existingSettings = await this.getSettings();

    if (!existingSettings) {
      const newSettings = await this.createSettings(settings);
      await this.logAudit('create_ai_settings', { settings }, memberId);
      return newSettings;
    }

    const { data, error } = await supabase
      .from('ai_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando configuración IA:', error);
      throw new Error('No se pudo actualizar la configuración');
    }

    await this.logAudit('update_ai_settings', { 
      previous: existingSettings,
      updated: settings 
    }, memberId);

    return data;
  }

  async toggleAI(memberId: number): Promise<boolean> {
    await this.setOrgContext();

    const settings = await this.getSettings();
    const newState = !(settings?.is_active ?? true);

    if (!settings) {
      await this.createSettings({ is_active: newState });
    } else {
      await supabase
        .from('ai_settings')
        .update({ 
          is_active: newState,
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', this.organizationId);
    }

    await this.logAudit('toggle_ai', { is_active: newState }, memberId);

    return newState;
  }

  async getChannels(): Promise<Channel[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo canales:', error);
      return [];
    }

    return data || [];
  }

  async updateChannelAIMode(
    channelId: string, 
    aiMode: 'ai_only' | 'hybrid' | 'manual',
    memberId: number
  ): Promise<Channel> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .update({ 
        ai_mode: aiMode,
        updated_at: new Date().toISOString()
      })
      .eq('id', channelId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando modo IA del canal:', error);
      throw new Error('No se pudo actualizar el canal');
    }

    await this.logAudit('update_channel_ai_mode', { 
      channel_id: channelId, 
      ai_mode: aiMode 
    }, memberId);

    return data;
  }

  async updateAllChannelsAIMode(
    aiMode: 'ai_only' | 'hybrid' | 'manual',
    memberId: number
  ): Promise<void> {
    await this.setOrgContext();

    const { error } = await supabase
      .from('channels')
      .update({ 
        ai_mode: aiMode,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error actualizando modo IA de todos los canales:', error);
      throw new Error('No se pudo actualizar los canales');
    }

    await this.logAudit('update_all_channels_ai_mode', { ai_mode: aiMode }, memberId);
  }

  async getConfigForOpenAI(): Promise<OrganizationAIConfig | null> {
    const settings = await this.getSettings();
    
    if (!settings) {
      return null;
    }

    return {
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.max_tokens,
      systemRules: settings.system_rules,
      tone: settings.tone,
      language: settings.language,
      fallbackMessage: settings.fallback_message,
      confidenceThreshold: settings.confidence_threshold,
      maxFragmentsContext: settings.max_fragments_context,
      isActive: settings.is_active
    };
  }

  private async logAudit(action: string, details: Record<string, any>, memberId: number): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action,
        entity_type: 'ai_settings',
        entity_id: null,
        changes: details,
        metadata: {},
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }
}
