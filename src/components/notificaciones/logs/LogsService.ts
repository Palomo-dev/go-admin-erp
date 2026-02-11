import { supabase } from '@/lib/supabase/config';
import type { DeliveryLog, LogFilters, LogStats } from './types';
import { PAGE_SIZE } from './types';

export const LogsService = {
  // ── Stats rápidas ─────────────────────────────────────
  async getStats(orgId: number): Promise<LogStats> {
    // delivery_logs no tiene organization_id, filtrar via notification join
    const { data, error } = await supabase
      .from('delivery_logs')
      .select('id, status, notification_id, notifications!inner(organization_id)')
      .eq('notifications.organization_id', orgId);

    if (error || !data) return { total: 0, success: 0, failed: 0, pending: 0 };

    return {
      total: data.length,
      success: data.filter((d: any) => d.status === 'success').length,
      failed: data.filter((d: any) => d.status === 'fail' || d.status === 'bounced').length,
      pending: data.filter((d: any) => d.status === 'pending').length,
    };
  },

  // ── Listar logs con filtros y paginación ──────────────
  async getLogs(
    orgId: number,
    filters: LogFilters,
    page: number = 1,
  ): Promise<{ data: DeliveryLog[]; total: number }> {
    let query = supabase
      .from('delivery_logs')
      .select(
        `id, notification_id, attempt_no, provider_response, delivered_at, status, created_at,
         notifications!inner(channel, status, payload, recipient_email, recipient_phone, template_id, created_at, organization_id)`,
        { count: 'exact' },
      )
      .eq('notifications.organization_id', orgId)
      .order('created_at', { ascending: false });

    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte('created_at', to.toISOString());
    }

    if (filters.search) {
      query = query.or(`notification_id.eq.${filters.search},id.eq.${filters.search}`);
    }

    const from = (page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching delivery logs:', error);
      return { data: [], total: 0 };
    }

    // Mapear resultado del join
    const logs: DeliveryLog[] = (data || []).map((row: any) => ({
      id: row.id,
      notification_id: row.notification_id,
      attempt_no: row.attempt_no,
      provider_response: row.provider_response,
      delivered_at: row.delivered_at,
      status: row.status,
      created_at: row.created_at,
      notification: row.notifications
        ? {
            channel: row.notifications.channel,
            status: row.notifications.status,
            payload: row.notifications.payload,
            recipient_email: row.notifications.recipient_email,
            recipient_phone: row.notifications.recipient_phone,
            template_id: row.notifications.template_id,
            created_at: row.notifications.created_at,
          }
        : null,
    }));

    // Filtros post-query que no se pueden hacer en SQL
    let filtered = logs;
    if (filters.channel !== 'all') {
      filtered = filtered.filter((l) => l.notification?.channel === filters.channel);
    }
    if (filters.provider !== 'all') {
      filtered = filtered.filter((l) => {
        const prov = l.provider_response?.provider || '';
        return prov.toLowerCase().includes(filters.provider.toLowerCase());
      });
    }

    return { data: filtered, total: count ?? 0 };
  },

  // ── Detalle de un log ─────────────────────────────────
  async getLogDetail(logId: string): Promise<DeliveryLog | null> {
    const { data, error } = await supabase
      .from('delivery_logs')
      .select(
        `id, notification_id, attempt_no, provider_response, delivered_at, status, created_at,
         notifications(channel, status, payload, recipient_email, recipient_phone, template_id, created_at)`,
      )
      .eq('id', logId)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as any;
    return {
      id: row.id,
      notification_id: row.notification_id,
      attempt_no: row.attempt_no,
      provider_response: row.provider_response,
      delivered_at: row.delivered_at,
      status: row.status,
      created_at: row.created_at,
      notification: row.notifications
        ? {
            channel: row.notifications.channel,
            status: row.notifications.status,
            payload: row.notifications.payload,
            recipient_email: row.notifications.recipient_email,
            recipient_phone: row.notifications.recipient_phone,
            template_id: row.notifications.template_id,
            created_at: row.notifications.created_at,
          }
        : null,
    };
  },

  // ── Reintentar envío ──────────────────────────────────
  async retryDelivery(log: DeliveryLog): Promise<boolean> {
    if (!log.notification) return false;

    // Crear nuevo intento en delivery_logs
    const { error } = await supabase.from('delivery_logs').insert({
      notification_id: log.notification_id,
      attempt_no: log.attempt_no + 1,
      status: 'pending',
      provider_response: { retry_of: log.id, retried_at: new Date().toISOString() },
    });

    if (error) {
      console.error('Error retrying delivery:', error);
      return false;
    }
    return true;
  },

  // ── Providers distintos ───────────────────────────────
  async getDistinctProviders(orgId: number): Promise<string[]> {
    const { data, error } = await supabase
      .from('delivery_logs')
      .select('provider_response, notifications!inner(organization_id)')
      .eq('notifications.organization_id', orgId);

    if (error || !data) return [];
    const providers = new Set<string>();
    data.forEach((r: any) => {
      const prov = r.provider_response?.provider;
      if (prov) providers.add(prov);
    });
    return Array.from(providers).sort();
  },

  // ── Canales distintos ─────────────────────────────────
  async getDistinctChannels(orgId: number): Promise<string[]> {
    const { data, error } = await supabase
      .from('notification_channels')
      .select('code')
      .eq('organization_id', orgId);

    if (error || !data) return [];
    return data.map((r: any) => r.code).sort();
  },

  // ── Exportar a CSV ────────────────────────────────────
  exportToCSV(logs: DeliveryLog[]): string {
    const header = 'ID,Notification ID,Attempt,Status,Provider,Channel,Delivered At,Created At\n';
    const rows = logs.map((l) => {
      const provider = l.provider_response?.provider || '-';
      const channel = l.notification?.channel || '-';
      return `${l.id},${l.notification_id},${l.attempt_no},${l.status},${provider},${channel},${l.delivered_at},${l.created_at}`;
    });
    return header + rows.join('\n');
  },

  PAGE_SIZE,
};
