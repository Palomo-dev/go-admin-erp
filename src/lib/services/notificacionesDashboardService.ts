import { supabase } from '@/lib/supabase/config';

// ── Interfaces ──────────────────────────────────────────

export interface NotificacionesKPIs {
  pendientes: number;
  enviadasHoy: number;
  fallidas: number;
  entregadas: number;
  leidas: number;
}

export interface SystemAlert {
  id: string;
  organization_id: number;
  rule_id: string | null;
  title: string;
  message: string;
  severity: string;
  source_module: string;
  source_id: string | null;
  metadata: Record<string, any>;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  sent_channels: string[];
  created_at: string;
  updated_at: string;
}

export interface AlertRule {
  id: string;
  organization_id: number;
  name: string;
  source_module: string;
  sql_condition: string;
  channels: string[];
  severity: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  fire_count?: number;
}

export interface NotificationChannel {
  id: string;
  organization_id: number;
  code: string;
  provider_name: string;
  config_json: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  organization_id: number;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: string;
  template_id: string | null;
  payload: Record<string, any>;
  status: string;
  error_msg: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplate {
  id: string;
  organization_id: number;
  channel: string;
  name: string;
  subject: string | null;
  body_html: string | null;
  body_text: string;
  variables: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

// ── Servicio ────────────────────────────────────────────

export class NotificacionesDashboardService {

  // ── KPIs ──────────────────────────────────────────────
  static async getKPIs(organizationId: number): Promise<NotificacionesKPIs> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [pendientes, enviadasHoy, fallidas, entregadas, leidas] = await Promise.all([
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'pending'),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'sent')
        .gte('sent_at', todayISO),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'failed'),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'sent'),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .not('read_at', 'is', null),
    ]);

    return {
      pendientes: pendientes.count ?? 0,
      enviadasHoy: enviadasHoy.count ?? 0,
      fallidas: fallidas.count ?? 0,
      entregadas: entregadas.count ?? 0,
      leidas: leidas.count ?? 0,
    };
  }

  // ── Alertas críticas recientes ────────────────────────
  static async getRecentAlerts(organizationId: number, limit = 10): Promise<SystemAlert[]> {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('organization_id', organizationId)
      .in('severity', ['critical', 'error'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error cargando alertas:', error);
      return [];
    }
    return (data as SystemAlert[]) || [];
  }

  // ── Top reglas que más disparan ───────────────────────
  static async getTopRules(organizationId: number, limit = 5): Promise<AlertRule[]> {
    // Obtener reglas
    const { data: rules, error: rulesErr } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (rulesErr || !rules) {
      console.error('Error cargando reglas:', rulesErr);
      return [];
    }

    // Contar alertas por rule_id
    const { data: alertCounts, error: countErr } = await supabase
      .from('system_alerts')
      .select('rule_id')
      .eq('organization_id', organizationId)
      .not('rule_id', 'is', null);

    if (countErr) {
      console.error('Error contando alertas por regla:', countErr);
      return rules.slice(0, limit).map(r => ({ ...r, fire_count: 0 }));
    }

    const countMap: Record<string, number> = {};
    (alertCounts || []).forEach((a: { rule_id: string }) => {
      countMap[a.rule_id] = (countMap[a.rule_id] || 0) + 1;
    });

    const rulesWithCount = rules.map(r => ({
      ...r,
      fire_count: countMap[r.id] || 0,
    }));

    rulesWithCount.sort((a, b) => (b.fire_count ?? 0) - (a.fire_count ?? 0));
    return rulesWithCount.slice(0, limit);
  }

  // ── Estado de canales (solo notification_channels core) ──
  static async getChannels(organizationId: number): Promise<NotificationChannel[]> {
    const { data, error } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('organization_id', organizationId)
      .order('code', { ascending: true });

    if (error) {
      console.error('Error cargando notification_channels:', error);
      return [];
    }

    return (data as NotificationChannel[]) || [];
  }

  // ── Últimas 20 notificaciones ─────────────────────────
  static async getLatestNotifications(organizationId: number, limit = 20): Promise<NotificationRow[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error cargando notificaciones:', error);
      return [];
    }
    return (data as NotificationRow[]) || [];
  }

  // ── Reconocer alerta ──────────────────────────────────
  static async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('system_alerts')
      .update({
        status: 'acknowledged',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error reconociendo alerta:', error);
      return false;
    }
    return true;
  }

  // ── Reintentar envío fallido ──────────────────────────
  static async retryFailedNotification(notificationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'pending',
        error_msg: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) {
      console.error('Error reintentando notificación:', error);
      return false;
    }
    return true;
  }

  // ── Toggle canal activo/inactivo (solo notification_channels core) ──
  static async toggleChannel(channelId: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('notification_channels')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', channelId);

    if (error) {
      console.error('Error actualizando notification_channel:', error);
      return false;
    }
    return true;
  }

  // ── Toggle regla activa/inactiva ──────────────────────
  static async toggleRule(ruleId: string, active: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('alert_rules')
      .update({
        active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ruleId);

    if (error) {
      console.error('Error actualizando regla:', error);
      return false;
    }
    return true;
  }

  // ── Obtener plantillas ────────────────────────────────
  static async getTemplates(organizationId: number): Promise<NotificationTemplate[]> {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error cargando plantillas:', error);
      return [];
    }
    return (data as NotificationTemplate[]) || [];
  }
}
