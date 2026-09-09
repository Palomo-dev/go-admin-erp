'use client';

import { supabase } from '@/lib/supabase/config';
import { Notification } from './types';

/**
 * Clase de servicio para gestionar las notificaciones
 */
export class NotificationService {
  /**
   * Obtiene las notificaciones recientes del usuario
   * @param organizationId ID de la organización
   * @param userId ID del usuario
   * @param limit Número máximo de notificaciones a obtener
   * @returns Lista de notificaciones y número de no leídas
   */
  static async getNotifications(organizationId: string | null, userId: string | null, limit = 5): Promise<{ 
    notifications: Notification[], 
    unreadCount: number 
  }> {
    if (!organizationId || !userId) {
      return { notifications: [], unreadCount: 0 };
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('recipient_user_id', userId)
        .in('channel', ['app', 'all']) // Solo notificaciones para la app
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      const notifications = data as Notification[];

      // Cargar read IDs del usuario desde notification_reads (per-user)
      const { data: readData } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', userId);

      const readIds = new Set((readData || []).map(r => r.notification_id));
      const notificationsWithReadState = notifications.map(n => ({
        ...n,
        is_read_by_me: readIds.has(n.id) ?? false,
      }));

      const unreadCount = notificationsWithReadState.filter(n => !n.is_read_by_me).length;

      return { notifications: notificationsWithReadState, unreadCount };
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
      return { notifications: [], unreadCount: 0 };
    }
  }

  /**
   * Marca una notificación como leída (per-user: INSERT en notification_reads)
   * @param id ID de la notificación
   * @param userId ID del usuario actual
   */
  static async markAsRead(id: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notification_reads')
        .insert({ notification_id: id, user_id: userId });

      if (error) {
        // Si ya existe (conflict), no es un error real
        if (error.code === '23505') return true;
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error al marcar como leída:', error);
      return false;
    }
  }

  /**
   * Marca todas las notificaciones como leídas (RPC server-side: atomico)
   * @param organizationId ID de la organización
   * @param userId ID del usuario (no se pasa al RPC; auth.uid() es la fuente)
   */
  static async markAllAsRead(organizationId: string | null, userId: string | null): Promise<boolean> {
    if (!organizationId || !userId) return false;

    try {
      const { error } = await supabase.rpc('mark_all_notifications_as_read', {
        p_organization_id: parseInt(organizationId, 10),
        p_scope: 'mine',
      });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error al marcar todas como leídas:', error);
      return false;
    }
  }

  /**
   * Crea una suscripción para cambios en tiempo real en notificaciones
   * @param organizationId ID de la organización
   * @param userId ID del usuario
   * @param callback Función a llamar cuando hay cambios
   */
  static subscribeToChanges(organizationId: string | null, userId: string | null, callback: () => void) {
    if (!organizationId || !userId) return null;
    
    return supabase
      .channel(`notifications-changes-${organizationId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications', 
          filter: `organization_id=eq.${organizationId} AND recipient_user_id=eq.${userId}` 
        },
        callback
      )
      .subscribe();
  }
}
