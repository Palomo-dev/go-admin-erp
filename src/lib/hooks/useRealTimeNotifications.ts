/**
 * Hook para notificaciones en tiempo real con Supabase
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import {
  subscribeToNotifications,
  unsubscribeFromNotifications,
  getNotifications,
  getNotificationStats,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
  type Notification,
  type NotificationFilters,
  type NotificationStats
} from '@/lib/services/realtimeNotificationService';

import { pushNotificationsManager } from '@/lib/services/pushNotificationsService';
import { useOrganization } from '@/lib/hooks/useOrganization';

interface UseRealTimeNotificationsReturn {
  // Estado
  notifications: Notification[];
  stats: NotificationStats | null;
  loading: boolean;
  error: string | null;
  
  // Paginación
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    count: number;
  };
  
  // Filtros
  filters: NotificationFilters;
  
  // Acciones
  loadNotifications: (newFilters?: Partial<NotificationFilters>) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  sendTestNotification: () => Promise<void>;
  updateFilters: (newFilters: Partial<NotificationFilters>) => void;
  refreshStats: () => Promise<void>;
  
  // Push notifications
  enablePushNotifications: () => Promise<boolean>;
  disablePushNotifications: () => Promise<boolean>;
  isPushEnabled: boolean;
}

export const useRealTimeNotifications = (userId?: string): UseRealTimeNotificationsReturn => {
  const { organization } = useOrganization();
  
  // Estado
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  
  // Filtros y paginación
  const [filters, setFilters] = useState<NotificationFilters>({
    page: 1,
    limit: 10
  });
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 0,
    count: 0
  });

  const organizationId = organization?.id || 1;

  /**
   * Cargar notificaciones
   */
  const loadNotifications = useCallback(async (newFilters?: Partial<NotificationFilters>) => {
    setLoading(true);
    setError(null);

    try {
      const currentFilters = newFilters ? { ...filters, ...newFilters } : filters;
      
      const response = await getNotifications(currentFilters, organizationId);
      
      setNotifications(response.data);
      setPagination({
        page: response.page,
        limit: response.limit,
        totalPages: response.totalPages,
        count: response.count
      });
      
      if (newFilters) {
        setFilters({ ...filters, ...newFilters });
      }
      
    } catch (err: any) {
      console.error('Error cargando notificaciones:', err);
      setError(err.message || 'Error cargando notificaciones');
    } finally {
      setLoading(false);
    }
  }, [filters, organizationId]);

  /**
   * Cargar estadísticas
   */
  const refreshStats = useCallback(async () => {
    try {
      const statsData = await getNotificationStats(organizationId, userId);
      setStats(statsData);
    } catch (err: any) {
      console.error('Error cargando estadísticas:', err);
    }
  }, [organizationId, userId]);

  /**
   * Marcar notificación como leída
   */
  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    try {
      await markAsRead(notificationId, organizationId);
      
      // Actualizar estado local
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, status: 'read', read_at: new Date().toISOString() }
            : n
        )
      );
      
      // Actualizar estadísticas
      refreshStats();
      
      toast.success('Notificación marcada como leída');
      
    } catch (err: any) {
      console.error('Error marcando como leída:', err);
      toast.error('Error marcando notificación como leída');
    }
  }, [organizationId, refreshStats]);

  /**
   * Marcar todas como leídas
   */
  const markAllAsReadAction = useCallback(async () => {
    try {
      const result = await markAllAsRead(organizationId, userId);
      
      // Actualizar estado local
      setNotifications(prev => 
        prev.map(n => ({ 
          ...n, 
          status: 'read', 
          read_at: new Date().toISOString() 
        }))
      );
      
      // Actualizar estadísticas
      refreshStats();
      
      toast.success(`${result.count} notificaciones marcadas como leídas`);
      
    } catch (err: any) {
      console.error('Error marcando todas como leídas:', err);
      toast.error('Error marcando todas las notificaciones como leídas');
    }
  }, [organizationId, userId, refreshStats]);

  /**
   * Eliminar notificación
   */
  const deleteNotificationAction = useCallback(async (notificationId: string) => {
    try {
      await deleteNotification(notificationId, organizationId);
      
      // Actualizar estado local
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Actualizar estadísticas
      refreshStats();
      
      toast.success('Notificación eliminada');
      
    } catch (err: any) {
      console.error('Error eliminando notificación:', err);
      toast.error('Error eliminando notificación');
    }
  }, [organizationId, refreshStats]);

  /**
   * Enviar notificación de prueba
   */
  const sendTestNotification = useCallback(async () => {
    try {
      // Crear notificación en la base de datos
      await createNotification({
        organization_id: organizationId,
        recipient_user_id: userId,
        channel: 'system',
        payload: {
          title: 'Notificación de Prueba',
          message: 'Esta es una notificación de prueba del sistema Go Admin ERP',
          type: 'test'
        },
        status: 'sent'
      }, organizationId);

      // Enviar push notification si está habilitado
      if (isPushEnabled) {
        await pushNotificationsManager.sendLocalNotification({
          title: 'Go Admin ERP - Prueba',
          body: 'Esta es una notificación de prueba del sistema',
          icon: '/icons/notification-icon.png',
          data: {
            type: 'test',
            url: '/app/notificaciones'
          }
        });
      }
      
      toast.success('Notificación de prueba enviada');
      
    } catch (err: any) {
      console.error('Error enviando notificación de prueba:', err);
      toast.error('Error enviando notificación de prueba');
    }
  }, [organizationId, userId, isPushEnabled]);

  /**
   * Habilitar push notifications
   */
  const enablePushNotifications = useCallback(async (): Promise<boolean> => {
    try {
      const permission = await pushNotificationsManager.requestPermission();
      
      if (permission !== 'granted') {
        toast.error('Permisos de notificación denegados');
        return false;
      }
      
      await pushNotificationsManager.subscribe();
      setIsPushEnabled(true);
      
      toast.success('Push notifications habilitadas');
      return true;
      
    } catch (err: any) {
      console.error('Error habilitando push notifications:', err);
      toast.error('Error habilitando push notifications');
      return false;
    }
  }, []);

  /**
   * Deshabilitar push notifications
   */
  const disablePushNotifications = useCallback(async (): Promise<boolean> => {
    try {
      await pushNotificationsManager.unsubscribe();
      setIsPushEnabled(false);
      
      toast.success('Push notifications deshabilitadas');
      return true;
      
    } catch (err: any) {
      console.error('Error deshabilitando push notifications:', err);
      toast.error('Error deshabilitando push notifications');
      return false;
    }
  }, []);

  /**
   * Actualizar filtros
   */
  const updateFilters = useCallback((newFilters: Partial<NotificationFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Verificar estado inicial de push notifications
  useEffect(() => {
    const checkPushStatus = async () => {
      try {
        const subscription = await pushNotificationsManager.getSubscription();
        setIsPushEnabled(!!subscription);
      } catch (err) {
        console.error('Error verificando push notifications:', err);
      }
    };

    checkPushStatus();
  }, []);

  // Cargar datos inicial y configurar real-time
  useEffect(() => {
    // Cargar datos inicial
    loadNotifications();
    refreshStats();

    // Configurar suscripción real-time
    const subscription = subscribeToNotifications(
      organizationId,
      (payload) => {
        console.log('🔔 Cambio de notificación recibido:', payload);
        
        // Actualizar datos
        loadNotifications();
        refreshStats();
        
        // Mostrar toast para nuevas notificaciones
        if (payload.eventType === 'INSERT' && payload.new) {
          // Mostrar toast para nuevas notificaciones
          toast.info(
            `Nueva notificación: ${payload.new.payload?.title || 'Notificación del sistema'}`,
            {
              action: {
                label: 'Ver',
                onClick: () => {
                  // Navigate to notifications page
                  window.location.href = '/app/notificaciones';
                }
              }
            }
          );
          
          // Enviar push notification si está habilitado
          if (isPushEnabled && payload.new.payload) {
            pushNotificationsManager.sendLocalNotification({
              title: payload.new.payload.title || 'Go Admin ERP',
              body: payload.new.payload.message || 'Nueva notificación',
              icon: '/icons/notification-icon.png',
              data: {
                notificationId: payload.new.id,
                url: '/app/notificaciones'
              }
            }).catch(err => console.error('Error enviando push notification:', err));
          }
        }
      },
      userId
    );

    // Cleanup
    return () => {
      unsubscribeFromNotifications();
    };
  }, [organizationId, userId, isPushEnabled, loadNotifications, refreshStats]);

  // Actualizar cuando cambien los filtros
  useEffect(() => {
    loadNotifications();
  }, [filters]);

  return {
    notifications,
    stats,
    loading,
    error,
    pagination,
    filters,
    loadNotifications,
    markNotificationAsRead,
    markAllAsRead: markAllAsReadAction,
    deleteNotification: deleteNotificationAction,
    sendTestNotification,
    updateFilters,
    refreshStats,
    enablePushNotifications,
    disablePushNotifications,
    isPushEnabled
  };
};
