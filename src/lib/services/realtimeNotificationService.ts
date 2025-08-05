/**
 * Servicio de Notificaciones con Supabase Real-time
 */

import { supabase } from '@/lib/supabase/config';
import Logger from '@/lib/utils/logger';
import { RealtimeChannel } from '@supabase/supabase-js';

// Types for notifications
interface Notification {
  id: string;
  organization_id: number;
  recipient_user_id?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  channel: string;
  template_id?: string | null;
  payload: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
  error_msg?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationFilters {
  status?: string;
  channel?: string;
  search?: string;
  recipient_user_id?: string;
  page?: number;
  limit?: number;
  unread_only?: boolean;
}

interface NotificationStats {
  total: number;
  unread: number;
  by_channel: Record<string, number>;
  by_status: Record<string, number>;
}

// Logger configurado para este servicio

// Real-time channels
let notificationsChannel: RealtimeChannel | null = null;
let userNotificationsChannel: RealtimeChannel | null = null;

/**
 * Real-time subscription para notificaciones
 */
export const subscribeToNotifications = (
  organizationId: number, 
  callback: (payload: { eventType: string; new: Notification | null; old: Notification | null }) => void,
  userId?: string
) => {
  Logger.info('NOTIFICATIONS', '🔔 Suscribiendo a notificaciones:', { organizationId, userId });
  
  // Cleanup existing channels
  if (notificationsChannel) {
    notificationsChannel.unsubscribe();
  }
  
  if (userNotificationsChannel) {
    userNotificationsChannel.unsubscribe();
  }
  
  // Subscribe to organization-wide notifications
  notificationsChannel = supabase
    .channel(`notifications-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        Logger.info('NOTIFICATIONS', '🔄 Cambio de notificación recibido:', payload);
        callback({
          eventType: payload.eventType,
          new: payload.new as Notification | null,
          old: payload.old as Notification | null
        });
      }
    )
    .subscribe();
    
  // If userId provided, also subscribe to user-specific notifications
  if (userId) {
    userNotificationsChannel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          Logger.info('NOTIFICATIONS', '👤 Notificación de usuario recibida:', payload);
          callback({
            eventType: payload.eventType,
            new: payload.new as Notification | null,
            old: payload.old as Notification | null
          });
        }
      )
      .subscribe();
  }
    
  return { notificationsChannel, userNotificationsChannel };
};

export const unsubscribeFromNotifications = () => {
  if (notificationsChannel) {
    notificationsChannel.unsubscribe();
    notificationsChannel = null;
  }
  
  if (userNotificationsChannel) {
    userNotificationsChannel.unsubscribe();
    userNotificationsChannel = null;
  }
  
  Logger.info('NOTIFICATIONS', '🔕 Desuscrito de notificaciones');
};

/**
 * CRUD Operations
 */
export const getNotifications = async (filters: NotificationFilters = {}, organizationId: number): Promise<{
  data: Notification[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}> => {
  Logger.info('NOTIFICATIONS', '📧 Obteniendo notificaciones:', { organizationId, filters });

  try {
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters.channel) {
      query = query.eq('channel', filters.channel);
    }
    
    if (filters.recipient_user_id) {
      query = query.eq('recipient_user_id', filters.recipient_user_id);
    }
    
    if (filters.unread_only) {
      query = query.is('read_at', null);
    }
    
    if (filters.search) {
      query = query.or(`payload->>'title'.ilike.%${filters.search}%,payload->>'message'.ilike.%${filters.search}%`);
    }
    
    // Order by creation date (newest first)
    query = query.order('created_at', { ascending: false });
    
    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    
    const { data, error, count } = await query
      .range(startIndex, startIndex + limit - 1);
      
    if (error) {
      Logger.error('NOTIFICATIONS', '❌ Error obteniendo notificaciones:', error);
      throw error;
    }
    
    Logger.info('NOTIFICATIONS', `📊 Encontradas ${data?.length || 0} notificaciones`);
    
    return {
      data: data as Notification[] || [],
      count: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    };
    
  } catch (error) {
    Logger.error('NOTIFICATIONS', '❌ Error en getNotifications:', error);
    throw error;
  }
};

export const getNotificationStats = async (organizationId: number, userId?: string): Promise<NotificationStats> => {
  Logger.info('NOTIFICATIONS', '📊 Calculando estadísticas de notificaciones:', { organizationId, userId });
  
  try {
    let query = supabase
      .from('notifications')
      .select('status, channel, read_at')
      .eq('organization_id', organizationId);
      
    if (userId) {
      query = query.eq('recipient_user_id', userId);
    }
      
    const { data, error } = await query;
      
    if (error) {
      Logger.error('NOTIFICATIONS', '❌ Error obteniendo estadísticas:', error);
      throw error;
    }
    
    const notifications = data || [];
    
    const stats: NotificationStats = {
      total: notifications.length,
      unread: notifications.filter((n: any) => !n.read_at).length,
      by_channel: {},
      by_status: {}
    };
    
    // Calculate stats
    notifications.forEach((notification: any) => {
      // By channel
      stats.by_channel[notification.channel] = (stats.by_channel[notification.channel] || 0) + 1;
      
      // By status
      stats.by_status[notification.status] = (stats.by_status[notification.status] || 0) + 1;
    });
    
    Logger.info('NOTIFICATIONS', '📊 Estadísticas calculadas:', stats);
    
    return stats;
    
  } catch (error) {
    Logger.error('NOTIFICATIONS', '❌ Error en getNotificationStats:', error);
    throw error;
  }
};

export const markAsRead = async (notificationId: string, organizationId: number): Promise<Notification> => {
  Logger.info('NOTIFICATIONS', '✅ Marcando notificación como leída:', { notificationId, organizationId });
  
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('organization_id', organizationId)
      .select()
      .single();
      
    if (error) {
      Logger.error('NOTIFICATIONS', '❌ Error marcando como leída:', error);
      throw error;
    }
    
    Logger.info('NOTIFICATIONS', '✅ Notificación marcada como leída');
    
    return data as Notification;
    
  } catch (error) {
    Logger.error('NOTIFICATIONS', '❌ Error en markAsRead:', error);
    throw error;
  }
};

export const markAllAsRead = async (organizationId: number, userId?: string): Promise<{ count: number }> => {
  Logger.info('NOTIFICATIONS', '✅ Marcando todas como leídas:', { organizationId, userId });
  
  try {
    let query = supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId)
      .is('read_at', null);
      
    if (userId) {
      query = query.eq('recipient_user_id', userId);
    }
      
    const { data, error } = await query.select('id');
      
    if (error) {
      Logger.error('NOTIFICATIONS', '❌ Error marcando todas como leídas:', error);
      throw error;
    }
    
    const count = data?.length || 0;
    Logger.info('NOTIFICATIONS', `✅ ${count} notificaciones marcadas como leídas`);
    
    return { count };
    
  } catch (error) {
    Logger.error('NOTIFICATIONS', '❌ Error en markAllAsRead:', error);
    throw error;
  }
};

export const createNotification = async (
  notificationData: Omit<Notification, 'id' | 'created_at' | 'updated_at'>,
  organizationId: number
): Promise<Notification> => {
  Logger.info('NOTIFICATIONS', '📧 Creando notificación:', { organizationId, notificationData });
  
  try {
    const newNotification = {
      ...notificationData,
      organization_id: notificationData.organization_id || organizationId,
      status: notificationData.status || 'pending'
    };
    
    const { data, error } = await supabase
      .from('notifications')
      .insert([newNotification])
      .select()
      .single();
      
    if (error) {
      Logger.error('NOTIFICATIONS', '❌ Error creando notificación:', error);
      throw error;
    }
    
    Logger.info('NOTIFICATIONS', '✅ Notificación creada exitosamente:', data);
    
    return data as Notification;
    
  } catch (error) {
    Logger.error('NOTIFICATIONS', '❌ Error en createNotification:', error);
    throw error;
  }
};

export const deleteNotification = async (notificationId: string, organizationId: number): Promise<{ success: boolean; message: string }> => {
  Logger.info('NOTIFICATIONS', '🗑️ Eliminando notificación:', { notificationId, organizationId });
  
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('organization_id', organizationId);
      
    if (error) {
      Logger.error('NOTIFICATIONS', '❌ Error eliminando notificación:', error);
      throw error;
    }
    
    Logger.info('NOTIFICATIONS', '✅ Notificación eliminada exitosamente');
    
    return { success: true, message: 'Notificación eliminada correctamente' };
    
  } catch (error) {
    Logger.error('NOTIFICATIONS', '❌ Error en deleteNotification:', error);
    return { success: false, message: 'Error eliminando notificación' };
  }
};

// Export types
export type { Notification, NotificationFilters, NotificationStats };
