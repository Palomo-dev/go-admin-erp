/**
 * Hook compartido para sincronizar notificaciones entre el header y la página principal
 * Proporciona una fuente única de datos para evitar desincronización
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getNotifications, markNotificationAsRead } from '@/lib/services/notificationService';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import type { Notification, NotificationFilter, NotificationResponse } from '@/types/notification';
import Logger from '@/lib/utils/logger';

// ========================
// TIPOS
// ========================

export interface SharedNotificationState {
  notifications: Notification[];
  unreadCount: number;
  totalCount: number;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

export interface SharedNotificationActions {
  loadNotifications: (filters?: NotificationFilter) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseSharedNotificationsReturn extends SharedNotificationState, SharedNotificationActions {}

// ========================
// CONFIGURACIÓN
// ========================

/**
 * Filtros por defecto para el header (notificaciones del usuario)
 */
const DEFAULT_HEADER_FILTERS: NotificationFilter = {
  page: 1,
  limit: 5,
  // Sin filtro de canal para incluir todas las notificaciones
};

/**
 * Filtros por defecto para la página principal (todas las notificaciones de la organización)
 */
const DEFAULT_PAGE_FILTERS: NotificationFilter = {
  page: 1,
  limit: 10,
  // Sin filtro de canal ni usuario para mostrar todas
};

// ========================
// HOOK PRINCIPAL
// ========================

/**
 * Hook compartido para gestionar notificaciones de forma sincronizada
 */
export const useSharedNotifications = (
  forHeader: boolean = false,
  customFilters?: NotificationFilter
): UseSharedNotificationsReturn => {
  // Estado
  const [state, setState] = useState<SharedNotificationState>({
    notifications: [],
    unreadCount: 0,
    totalCount: 0,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  // Referencias
  const mountedRef = useRef(true);
  const subscriptionRef = useRef<any>(null);

  // ========================
  // FUNCIONES AUXILIARES
  // ========================

  /**
   * Obtiene el ID del usuario actual
   */
  const getCurrentUserId = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        Logger.warn('NOTIFICATIONS', 'No se pudo obtener usuario actual');
        return null;
      }
      return user.id;
    } catch (error) {
      Logger.error('NOTIFICATIONS', 'Error al obtener usuario:', error);
      return null;
    }
  }, []);

  /**
   * Prepara los filtros según el contexto (header vs página)
   */
  const prepareFilters = useCallback(async (customFilters?: NotificationFilter): Promise<NotificationFilter> => {
    const baseFilters = forHeader ? DEFAULT_HEADER_FILTERS : DEFAULT_PAGE_FILTERS;
    let filters = { ...baseFilters, ...customFilters };

    // Para el header, incluir notificaciones sin usuario específico también
    // ya que muchas notificaciones del sistema no tienen recipient_user_id
    if (forHeader) {
      const userId = await getCurrentUserId();
      Logger.debug('NOTIFICATIONS', `Preparando filtros para header, userId: ${userId}`);
      // No filtrar por usuario para mostrar notificaciones generales del sistema
    }

    return filters;
  }, [forHeader, getCurrentUserId]);

  // ========================
  // ACCIONES PRINCIPALES
  // ========================

  /**
   * Carga notificaciones con filtros
   */
  const loadNotifications = useCallback(async (filters?: NotificationFilter) => {
    if (!mountedRef.current) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Preparar filtros según contexto
      const finalFilters = await prepareFilters(filters);
      
      Logger.debug('NOTIFICATIONS', `Cargando notificaciones ${forHeader ? '(header)' : '(página)'}:`, finalFilters);

      // Cargar notificaciones
      const response: NotificationResponse = await getNotifications(finalFilters);

      if (!mountedRef.current) return;

      // Calcular estadísticas
      const unreadCount = response.data.filter(n => n.read_at === null).length;

      setState(prev => ({
        ...prev,
        notifications: response.data,
        unreadCount,
        totalCount: response.count,
        loading: false,
        lastUpdated: new Date().toISOString(),
      }));

      Logger.info('NOTIFICATIONS', `Notificaciones cargadas: ${response.data.length}/${response.count}, no leídas: ${unreadCount}`);

    } catch (error: any) {
      Logger.error('NOTIFICATIONS', 'Error al cargar notificaciones:', error);
      
      if (!mountedRef.current) return;

      setState(prev => ({
        ...prev,
        loading: false,
        error: error?.message || 'Error al cargar notificaciones',
      }));
    }
  }, [forHeader, prepareFilters]);

  /**
   * Marca una notificación como leída
   */
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      Logger.debug('NOTIFICATIONS', `Marcando notificación como leída: ${notificationId}`);
      
      await markNotificationAsRead(notificationId);

      // Actualizar estado local
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n => 
          n.id === notificationId 
            ? { ...n, read_at: new Date().toISOString() }
            : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));

      Logger.info('NOTIFICATIONS', 'Notificación marcada como leída');

    } catch (error: any) {
      Logger.error('NOTIFICATIONS', 'Error al marcar como leída:', error);
    }
  }, []);

  /**
   * Refresca las notificaciones
   */
  const refresh = useCallback(async () => {
    Logger.debug('NOTIFICATIONS', 'Refrescando notificaciones...');
    await loadNotifications(customFilters);
  }, [loadNotifications, customFilters]);

  // ========================
  // EFECTOS
  // ========================

  /**
   * Carga inicial
   */
  useEffect(() => {
    loadNotifications(customFilters);
  }, [loadNotifications, customFilters]);

  /**
   * Suscripción en tiempo real
   */
  useEffect(() => {
    const setupRealtimeSubscription = async () => {
      try {
        const organizationId = obtenerOrganizacionActiva();
        if (!organizationId) return;

        Logger.debug('NOTIFICATIONS', `Configurando suscripción tiempo real para organización ${organizationId}`);

        // Cancelar suscripción anterior
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
        }

        // Crear nueva suscripción
        const subscription = supabase
          .channel(`notifications-shared-${organizationId}-${forHeader ? 'header' : 'page'}`)
          .on('postgres_changes', 
            { 
              event: '*', 
              schema: 'public', 
              table: 'notifications',
              filter: `organization_id=eq.${organizationId}`
            },
            (payload) => {
              Logger.debug('NOTIFICATIONS', 'Cambio en notificaciones detectado:', payload);
              // Recargar notificaciones cuando hay cambios
              refresh();
            }
          )
          .subscribe();

        subscriptionRef.current = subscription;

      } catch (error) {
        Logger.error('NOTIFICATIONS', 'Error configurando tiempo real:', error);
      }
    };

    setupRealtimeSubscription();

    // Limpieza
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [forHeader, refresh]);

  /**
   * Limpieza al desmontar
   */
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  // ========================
  // RETORNO
  // ========================

  return {
    ...state,
    loadNotifications,
    markAsRead,
    refresh,
  };
};

export default useSharedNotifications;
