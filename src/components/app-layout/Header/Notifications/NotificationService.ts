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
      const unreadCount = notifications.filter(n => n.read_at === null).length;
      
      return { notifications, unreadCount };
    } catch (error) {
      console.error('Error al cargar notificaciones:', error);
      return { notifications: [], unreadCount: 0 };
    }
  }

  /**
   * Marca una notificación como leída
   * @param id ID de la notificación
   */
  static async markAsRead(id: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', id);
      
      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Error al marcar como leída:', error);
      return false;
    }
  }

  /**
   * Marca todas las notificaciones como leídas
   * @param organizationId ID de la organización
   * @param userId ID del usuario
   */
  static async markAllAsRead(organizationId: string | null, userId: string | null): Promise<boolean> {
    if (!organizationId || !userId) return false;

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('organization_id', organizationId)
        .eq('recipient_user_id', userId)
        .is('read_at', null);
      
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
      .channel('notifications-changes')
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
