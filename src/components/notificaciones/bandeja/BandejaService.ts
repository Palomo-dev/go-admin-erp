import { supabase } from '@/lib/supabase/config';
import type {
  BandejaNotification,
  BandejaFilters,
  BandejaStats,
  OrgMember,
  Branch,
  NotificationTemplate,
  UserNotificationPreference,
  CreateNotificationPayload,
} from './types';

const PAGE_SIZE = 20;

export const BandejaService = {
  // ── Estadísticas rápidas ─────────────────────────────
  // unread usa el RPC get_unread_notifications_count (per-user)
  async getStats(orgId: number, userId: string): Promise<BandejaStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRes, unreadRes, failedRes, todayRes] = await Promise.all([
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`),
      // Unread per-user via RPC
      supabase.rpc('get_unread_notifications_count', {
        p_organization_id: orgId,
        p_scope: 'all',
        p_exclude_task_types: false,
      }),
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`)
        .eq('status', 'failed'),
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`)
        .gte('created_at', today.toISOString()),
    ]);

    return {
      total: totalRes.count ?? 0,
      unread: (unreadRes.data as unknown as number) ?? 0,
      failed: failedRes.count ?? 0,
      today: todayRes.count ?? 0,
    };
  },

  // ── Listar notificaciones con filtros y paginación ───
  // Después de cargar, mergea is_read_by_me desde notification_reads (per-user)
  async getNotifications(
    orgId: number,
    userId: string,
    filters: BandejaFilters,
    page: number = 1,
  ): Promise<{ data: BandejaNotification[]; total: number }> {
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`)
      .order('created_at', { ascending: false });

    // Filtros (readStatus se aplica client-side después del merge, ver abajo)
    if (filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.channel !== 'all') query = query.eq('channel', filters.channel);

    if (filters.type !== 'all') {
      query = query.contains('payload', { type: filters.type });
    }

    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte('created_at', to.toISOString());
    }

    if (filters.search) {
      query = query.or(
        `payload->>title.ilike.%${filters.search}%,payload->>content.ilike.%${filters.search}%`
      );
    }

    // Paginación
    const from = (page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return { data: [], total: 0 };
    }

    const notifs = (data as BandejaNotification[]) || [];

    // Merge is_read_by_me desde notification_reads (per-user)
    if (notifs.length > 0) {
      const notifIds = notifs.map(n => n.id);
      const { data: readData } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', userId)
        .in('notification_id', notifIds);

      const readIds = new Set((readData || []).map(r => r.notification_id));
      notifs.forEach(n => {
        n.is_read_by_me = readIds.has(n.id) ?? false;
      });

      // Aplicar filtro readStatus client-side (no se puede hacer en SQL con anti-join)
      let filtered = notifs;
      if (filters.readStatus === 'unread') {
        filtered = notifs.filter(n => !n.is_read_by_me);
      } else if (filters.readStatus === 'read') {
        filtered = notifs.filter(n => n.is_read_by_me);
      }

      return { data: filtered, total: count ?? 0 };
    }

    return { data: notifs, total: count ?? 0 };
  },

  // ── Marcar como leída (per-user: INSERT en notification_reads) ──
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notification_reads')
      .insert({ notification_id: notificationId, user_id: userId });
    if (error && error.code !== '23505') return false;
    return true;
  },

  // ── Marcar como no leída (per-user: DELETE en notification_reads) ──
  async markAsUnread(notificationId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notification_reads')
      .delete()
      .eq('notification_id', notificationId)
      .eq('user_id', userId);
    return !error;
  },

  // ── Marcar todas como leídas (RPC server-side: atomico, sin limite de 1000) ──
  async markAllAsRead(orgId: number): Promise<boolean> {
    const { error } = await supabase.rpc('mark_all_notifications_as_read', {
      p_organization_id: orgId,
      p_scope: 'all',
    });
    return !error;
  },

  // ── Obtener delivery logs de una notificación ────────
  async getDeliveryLogs(notificationId: string) {
    const { data, error } = await supabase
      .from('delivery_logs')
      .select('*')
      .eq('notification_id', notificationId)
      .order('attempt_no', { ascending: true });

    if (error) {
      console.error('Error fetching delivery logs:', error);
      return [];
    }
    return data || [];
  },

  // ── Obtener miembros de la org (para crear notif manual) ──
  async getOrgMembers(orgId: number): Promise<OrgMember[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, role_id, is_super_admin, is_active, profiles(first_name, last_name, email, avatar_url), roles(name)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('user_id');

    if (error) {
      console.error('Error fetching org members:', error);
      return [];
    }
    return (data as unknown as OrgMember[]) || [];
  },

  // ── Obtener sucursales ───────────────────────────────
  async getBranches(orgId: number): Promise<Branch[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name');

    if (error) return [];
    return data || [];
  },

  // ── Obtener templates ────────────────────────────────
  async getTemplates(orgId: number): Promise<NotificationTemplate[]> {
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) return [];
    return (data as NotificationTemplate[]) || [];
  },

  // ── Preferencias del usuario ─────────────────────────
  async getUserPreferences(userId: string): Promise<UserNotificationPreference[]> {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId);

    if (error) return [];
    return (data as UserNotificationPreference[]) || [];
  },

  // ── Crear notificación manual (admin) ────────────────
  async createNotification(
    orgId: number,
    payload: CreateNotificationPayload,
  ): Promise<boolean> {
    const { error } = await supabase.from('notifications').insert({
      organization_id: orgId,
      recipient_user_id: payload.recipientUserId,
      channel: payload.channel,
      payload: {
        type: payload.type,
        title: payload.title,
        content: payload.content,
      },
      status: 'pending',
    });
    return !error;
  },

  // ── Reenviar notificación ────────────────────────────
  async resendNotification(notificationId: string, orgId: number): Promise<boolean> {
    // Obtener la notificación original
    const { data: original, error: fetchErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (fetchErr || !original) return false;

    // Crear una copia
    const { error } = await supabase.from('notifications').insert({
      organization_id: original.organization_id,
      recipient_user_id: original.recipient_user_id,
      recipient_email: original.recipient_email,
      recipient_phone: original.recipient_phone,
      channel: original.channel,
      template_id: original.template_id,
      payload: original.payload,
      status: 'pending',
    });
    return !error;
  },

  // ── Tipos de notificación disponibles ────────────────
  async getDistinctTypes(orgId: number): Promise<string[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('payload')
      .eq('organization_id', orgId)
      .limit(500);

    if (error || !data) return [];

    const types = new Set<string>();
    data.forEach((n: any) => {
      if (n.payload?.type) types.add(n.payload.type);
    });
    return Array.from(types).sort();
  },

  PAGE_SIZE,
};
