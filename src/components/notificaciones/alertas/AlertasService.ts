import { supabase } from '@/lib/supabase/config';
import type {
  SystemAlert,
  AlertFilters,
  AlertStats,
  AlertRule,
  CreateAlertPayload,
} from './types';

const PAGE_SIZE = 20;

export const AlertasService = {
  // ── Stats rápidas ────────────────────────────────────
  async getStats(orgId: number): Promise<AlertStats> {
    const [totalRes, pendingRes, criticalRes, resolvedRes] = await Promise.all([
      supabase.from('system_alerts').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId),
      supabase.from('system_alerts').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('status', 'pending'),
      supabase.from('system_alerts').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('severity', 'critical').in('status', ['pending', 'delivered']),
      supabase.from('system_alerts').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('status', 'resolved'),
    ]);

    return {
      total: totalRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      critical: criticalRes.count ?? 0,
      resolved: resolvedRes.count ?? 0,
    };
  },

  // ── Listar alertas con filtros y paginación ──────────
  async getAlerts(
    orgId: number,
    filters: AlertFilters,
    page: number = 1,
  ): Promise<{ data: SystemAlert[]; total: number }> {
    let query = supabase
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (filters.severity !== 'all') query = query.eq('severity', filters.severity);
    if (filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.source_module !== 'all') query = query.eq('source_module', filters.source_module);
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte('created_at', to.toISOString());
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,message.ilike.%${filters.search}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching alerts:', error);
      return { data: [], total: 0 };
    }

    return { data: (data as SystemAlert[]) || [], total: count ?? 0 };
  },

  // ── Obtener detalle con perfil del resolver ──────────
  async getAlertDetail(alertId: string): Promise<SystemAlert | null> {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('id', alertId)
      .maybeSingle();

    if (error || !data) return null;

    const alert = data as SystemAlert;

    if (alert.resolved_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', alert.resolved_by)
        .maybeSingle();
      alert.resolver_profile = profile;
    }

    return alert;
  },

  // ── Cambiar estado ───────────────────────────────────
  async updateStatus(
    alertId: string,
    status: string,
    userId?: string,
  ): Promise<boolean> {
    const updates: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'resolved' && userId) {
      updates.resolved_by = userId;
      updates.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('system_alerts')
      .update(updates)
      .eq('id', alertId);

    if (error) {
      console.error('Error updating alert status:', error);
      return false;
    }
    return true;
  },

  // ── Agregar nota interna (en metadata) ───────────────
  async addNote(alertId: string, note: string, userId: string): Promise<boolean> {
    const { data: current } = await supabase
      .from('system_alerts')
      .select('metadata')
      .eq('id', alertId)
      .maybeSingle();

    const metadata = current?.metadata || {};
    const notes = Array.isArray(metadata.notes) ? metadata.notes : [];
    notes.push({ text: note, by: userId, at: new Date().toISOString() });

    const { error } = await supabase
      .from('system_alerts')
      .update({ metadata: { ...metadata, notes }, updated_at: new Date().toISOString() })
      .eq('id', alertId);

    if (error) {
      console.error('Error adding note:', error);
      return false;
    }
    return true;
  },

  // ── Crear alerta manual (admin) ──────────────────────
  async createAlert(orgId: number, payload: CreateAlertPayload): Promise<boolean> {
    const targetType = payload.target_type || 'all';
    const userIds = payload.target_user_ids || [];

    const { data: alertData, error } = await supabase.from('system_alerts').insert({
      organization_id: orgId,
      title: payload.title,
      message: payload.message,
      severity: payload.severity,
      source_module: payload.source_module,
      status: 'pending',
      metadata: {
        manual: true,
        target_type: targetType,
        ...(userIds.length > 0 ? { target_user_ids: userIds } : {}),
      },
    }).select('id').single();

    if (error) {
      console.error('Error creating alert:', error);
      return false;
    }

    // Si es para usuarios específicos, crear notificación in-app para cada uno
    if (targetType === 'specific' && userIds.length > 0) {
      const notifRows = userIds.map((uid) => ({
        organization_id: orgId,
        recipient_user_id: uid,
        channel: 'app',
        payload: {
          title: payload.title,
          content: payload.message,
          severity: payload.severity,
          source_module: payload.source_module,
          alert_id: alertData?.id || null,
        },
        status: 'pending',
      }));

      const { error: notifError } = await supabase.from('notifications').insert(notifRows);
      if (notifError) {
        console.error('Error creating notifications for users:', notifError);
      }
    } else if (targetType === 'specific') {
      console.warn('[AlertasService] target_type=specific pero sin target_user_ids en payload:', payload);
    }

    return true;
  },

  // ── Crear regla desde alerta (duplicar como regla) ───
  async createRuleFromAlert(alert: SystemAlert): Promise<boolean> {
    const { error } = await supabase.from('alert_rules').insert({
      organization_id: alert.organization_id,
      name: `Regla desde: ${alert.title}`,
      source_module: alert.source_module,
      sql_condition: '',
      channels: alert.sent_channels || ['app'],
      severity: alert.severity,
      active: false,
    });
    if (error) {
      console.error('Error creating rule from alert:', error);
      return false;
    }
    return true;
  },

  // ── Reenviar por canal ───────────────────────────────
  async resendToChannel(alert: SystemAlert, channel: string): Promise<boolean> {
    const { error } = await supabase.from('notifications').insert({
      organization_id: alert.organization_id,
      channel,
      payload: {
        type: 'system_alert',
        title: alert.title,
        content: alert.message,
        alert_id: alert.id,
        severity: alert.severity,
      },
      status: 'pending',
    });

    if (!error) {
      const channels = new Set(alert.sent_channels || []);
      channels.add(channel);
      await supabase
        .from('system_alerts')
        .update({ sent_channels: Array.from(channels), updated_at: new Date().toISOString() })
        .eq('id', alert.id);
    }

    if (error) {
      console.error('Error resending alert:', error);
      return false;
    }
    return true;
  },

  // ── Módulos disponibles ──────────────────────────────
  async getDistinctModules(orgId: number): Promise<string[]> {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('source_module')
      .eq('organization_id', orgId);

    if (error || !data) return [];
    const mods = new Set<string>();
    data.forEach((r: any) => { if (r.source_module) mods.add(r.source_module); });
    return Array.from(mods).sort();
  },

  // ── Canales de notificación activos ──────────────────
  async getActiveChannels(orgId: number): Promise<{ code: string; provider_name: string }[]> {
    const { data, error } = await supabase
      .from('notification_channels')
      .select('code, provider_name')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (error) return [];
    return data || [];
  },

  PAGE_SIZE,
};
