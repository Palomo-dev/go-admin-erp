/**
 * Communication Credits Service — Gestión de créditos de comunicación
 * GO Admin ERP
 *
 * Similar a aiCreditsService pero para SMS, WhatsApp y Voz.
 */

import { supabase } from '@/lib/supabase/config';
import type { CommCreditsStatus, CommUsageLog } from './integrations/twilio/twilioTypes';

class CommCreditsService {
  /**
   * Obtiene el estado de créditos de comunicación de una organización.
   */
  async getCreditsStatus(orgId: number): Promise<CommCreditsStatus | null> {
    const { data, error } = await supabase
      .from('comm_settings')
      .select(
        'sms_remaining, whatsapp_remaining, voice_minutes_remaining, voice_agent_enabled, is_active, credits_reset_at'
      )
      .eq('organization_id', orgId)
      .single();

    if (error || !data) return null;

    return data as CommCreditsStatus;
  }

  /**
   * Obtiene el historial de uso de comunicaciones.
   */
  async getUsageHistory(
    orgId: number,
    options?: {
      channel?: string;
      module?: string;
      limit?: number;
      offset?: number;
      from?: string;
      to?: string;
    }
  ): Promise<{ data: CommUsageLog[]; count: number }> {
    let query = supabase
      .from('comm_usage_logs')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (options?.channel) {
      query = query.eq('channel', options.channel);
    }
    if (options?.module) {
      query = query.eq('module', options.module);
    }
    if (options?.from) {
      query = query.gte('created_at', options.from);
    }
    if (options?.to) {
      query = query.lte('created_at', options.to);
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[CommCredits] Error obteniendo historial:', error);
      return { data: [], count: 0 };
    }

    return { data: (data || []) as CommUsageLog[], count: count || 0 };
  }

  /**
   * Obtiene un resumen de uso por canal para el mes actual.
   */
  async getMonthlyUsageSummary(
    orgId: number
  ): Promise<{ sms: number; whatsapp: number; voice: number }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('comm_usage_logs')
      .select('channel, credits_used')
      .eq('organization_id', orgId)
      .eq('direction', 'outbound')
      .gte('created_at', startOfMonth.toISOString());

    if (error || !data) {
      return { sms: 0, whatsapp: 0, voice: 0 };
    }

    return data.reduce(
      (acc, log) => {
        const ch = log.channel as 'sms' | 'whatsapp' | 'voice';
        acc[ch] = (acc[ch] || 0) + (log.credits_used || 0);
        return acc;
      },
      { sms: 0, whatsapp: 0, voice: 0 }
    );
  }

  /**
   * Verifica si la organización tiene créditos disponibles para un canal.
   */
  async hasCredits(orgId: number, channel: string): Promise<boolean> {
    const status = await this.getCreditsStatus(orgId);
    if (!status || !status.is_active) return false;

    switch (channel) {
      case 'sms':
        return status.sms_remaining === null || status.sms_remaining > 0;
      case 'whatsapp':
        return status.whatsapp_remaining === null || status.whatsapp_remaining > 0;
      case 'voice':
        return status.voice_minutes_remaining === null || status.voice_minutes_remaining > 0;
      default:
        return false;
    }
  }

  /**
   * Verifica si la organización tiene Voice Agent habilitado.
   */
  async hasVoiceAgent(orgId: number): Promise<boolean> {
    const status = await this.getCreditsStatus(orgId);
    return status?.voice_agent_enabled === true && status?.is_active === true;
  }
}

export const commCreditsService = new CommCreditsService();
export default CommCreditsService;
