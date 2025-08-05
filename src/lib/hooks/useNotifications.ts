/**
 * Hook personalizado para gestionar notificaciones y alertas del sistema
 * Incluye estado, filtros, acciones individuales/masivas y tiempo real
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import {
  getNotifications,
  markAllNotificationsAsRead,
  deleteAllNotifications,
  getNotificationStats,
} from '@/lib/services/notificationService';
import {
  getSystemAlerts,
  getSystemAlertStats,
  markNotificationAsRead,
  deleteNotification,
  resolveSystemAlert,
  deleteSystemAlert,
  resolveAllSystemAlerts,
} from '@/lib/services/notificationServiceExtensions';

import type {
  Notification,
  SystemAlert,
  NotificationFilter,
  SystemAlertFilter,
  NotificationStats,
  SystemAlertStats,
  ActionResult,
  NotificationHookState,
  NotificationHookActions,
} from '@/types/notification';

import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import Logger from '@/lib/utils/logger';

// ========================
// CONFIGURACIÓN INICIAL
// ========================

/**
 * Filtros iniciales para notificaciones
 */
const INITIAL_NOTIFICATION_FILTERS: NotificationFilter = {
  page: 1,
  limit: 10,
};

/**
 * Filtros iniciales para alertas del sistema
 */
const INITIAL_ALERT_FILTERS: SystemAlertFilter = {
  page: 1,
  limit: 10,
};

/**
 * Estado inicial del hook
 */
const INITIAL_STATE: NotificationHookState = {
  notifications: [],
  systemAlerts: [],
  loading: false,
  error: null,
  stats: {
    notifications: null,
    alerts: null,
  },
  filters: {
    notifications: INITIAL_NOTIFICATION_FILTERS,
    alerts: INITIAL_ALERT_FILTERS,
  },
  pagination: {
    notifications: {
      hasMore: false,
      loading: false,
      totalPages: 0,
      currentPage: 1,
      total: 0,
    },
    alerts: {
      hasMore: false,
      loading: false,
      totalPages: 0,
      currentPage: 1,
      total: 0,
    },
  },
};

// ========================
// HOOK PRINCIPAL
// ========================

/**
 * Hook para gestionar notificaciones y alertas del sistema
 */
export const useNotifications = (): NotificationHookState & NotificationHookActions => {
  // Estado principal
  const [state, setState] = useState<NotificationHookState>(INITIAL_STATE);
  
  // Referencias para evitar loops infinitos
  const organizationRef = useRef<number | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // ========================
  // FUNCIONES DE CARGA
  // ========================

  /**
   * Carga notificaciones con filtros (reemplaza lista actual)
   */
  const loadNotifications = useCallback(async (filters?: NotificationFilter) => {
    if (!mountedRef.current) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Obtener filtros actuales del estado o usar los proporcionados
      const filtersToUse = filters || INITIAL_NOTIFICATION_FILTERS;
      const filtersWithDefaults = { ...INITIAL_NOTIFICATION_FILTERS, ...filtersToUse };
      Logger.debug('NOTIFICATIONS', `Cargando notificaciones con filtros: ${JSON.stringify(filtersWithDefaults)}`);
      
      const response = await getNotifications(filtersWithDefaults);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        notifications: response.data,
        loading: false,
        filters: {
          ...prev.filters,
          notifications: { ...filtersToUse, page: response.page },
        },
        pagination: {
          ...prev.pagination,
          notifications: {
            hasMore: response.page < response.totalPages,
            loading: false,
            totalPages: response.totalPages,
            currentPage: response.page,
            total: response.count,
          },
        },
      }));
      
      // Debug: Log para verificar paginación
      Logger.debug('NOTIFICATIONS', `Estado de paginación actualizado: página ${response.page}/${response.totalPages}, total: ${response.count}`);
      Logger.info('NOTIFICATIONS', `Notificaciones cargadas: ${response.data.length} de ${response.count}`);
    } catch (error: any) {
      // Logging detallado del error en hook
      console.error('❌ Error al cargar notificaciones (hook useNotifications) - Detalle completo:', {
        error,
        errorMessage: error?.message,
        errorName: error?.name,
        errorStack: error?.stack,
        errorStringified: JSON.stringify(error),
        filters: filters || INITIAL_NOTIFICATION_FILTERS
      });
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Error al cargar notificaciones',
      }));
    }
  }, []); // Eliminamos dependencias problemáticas

  /**
   * Carga alertas del sistema con filtros (reemplaza lista actual)
   */
  const loadSystemAlerts = useCallback(async (filters?: SystemAlertFilter) => {
    if (!mountedRef.current) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Obtener filtros actuales del estado o usar los proporcionados
      const filtersToUse = filters || INITIAL_ALERT_FILTERS;
      const filtersWithDefaults = { ...INITIAL_ALERT_FILTERS, ...filtersToUse };
      Logger.debug('NOTIFICATIONS', `Cargando alertas del sistema con filtros: ${JSON.stringify(filtersWithDefaults)}`);
      
      const response = await getSystemAlerts(filtersToUse);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        systemAlerts: response.data,
        loading: false,
        filters: {
          ...prev.filters,
          alerts: { ...filtersToUse, page: response.page },
        },
        pagination: {
          ...prev.pagination,
          alerts: {
            hasMore: response.page < response.totalPages,
            loading: false,
            totalPages: response.totalPages,
            currentPage: response.page,
            total: response.count,
          },
        },
      }));
      
      Logger.info('NOTIFICATIONS', `Alertas del sistema cargadas: ${response.data.length} de ${response.count}`);
    } catch (error) {
      console.error('Error al cargar alertas del sistema:', error);
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Error al cargar alertas del sistema',
      }));
    }
  }, []); // Eliminamos dependencias problemáticas

  /**
   * Carga más notificaciones (agrega a la lista actual)
   */
  const loadMoreNotifications = useCallback(async () => {
    if (!mountedRef.current) return;
    
    const currentPagination = state.pagination.notifications;
    
    // No cargar si ya estamos cargando o no hay más páginas
    if (currentPagination.loading || !currentPagination.hasMore) {
      console.log('⏸️ No se puede cargar más notificaciones:', { loading: currentPagination.loading, hasMore: currentPagination.hasMore });
      return;
    }
    
    try {
      setState(prev => ({
        ...prev,
        pagination: {
          ...prev.pagination,
          notifications: {
            ...prev.pagination.notifications,
            loading: true,
          },
        },
      }));
      
      const nextPage = currentPagination.currentPage + 1;
      const filtersWithNextPage = {
        ...state.filters.notifications,
        page: nextPage,
      };
      
      // Solo log en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('📬 Cargando más notificaciones - página:', nextPage);
      }
      
      const response = await getNotifications(filtersWithNextPage);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        notifications: [...prev.notifications, ...response.data], // Agregar a la lista existente
        pagination: {
          ...prev.pagination,
          notifications: {
            hasMore: response.page < response.totalPages,
            loading: false,
            totalPages: response.totalPages,
            currentPage: response.page,
            total: response.count,
          },
        },
        filters: {
          ...prev.filters,
          notifications: filtersWithNextPage,
        },
      }));
      
      // Solo log en desarrollo para notificaciones cargadas
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Más notificaciones cargadas:', response.data.length, 'nuevas');
      }
    } catch (error) {
      console.error('Error al cargar más notificaciones:', error);
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        pagination: {
          ...prev.pagination,
          notifications: {
            ...prev.pagination.notifications,
            loading: false,
          },
        },
      }));
    }
  }, [state.pagination.notifications, state.filters.notifications]);

  /**
   * Carga más alertas del sistema (agrega a la lista actual)
   */
  const loadMoreAlerts = useCallback(async () => {
    if (!mountedRef.current) return;
    
    const currentPagination = state.pagination.alerts;
    
    // No cargar si ya estamos cargando o no hay más páginas
    if (currentPagination.loading || !currentPagination.hasMore) {
      console.log('⏸️ No se puede cargar más alertas:', { loading: currentPagination.loading, hasMore: currentPagination.hasMore });
      return;
    }
    
    try {
      setState(prev => ({
        ...prev,
        pagination: {
          ...prev.pagination,
          alerts: {
            ...prev.pagination.alerts,
            loading: true,
          },
        },
      }));
      
      const nextPage = currentPagination.currentPage + 1;
      const filtersWithNextPage = {
        ...state.filters.alerts,
        page: nextPage,
      };
      
      console.log('🚨 Cargando más alertas - página:', nextPage);
      
      const response = await getSystemAlerts(filtersWithNextPage);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        systemAlerts: [...prev.systemAlerts, ...response.data], // Agregar a la lista existente
        pagination: {
          ...prev.pagination,
          alerts: {
            hasMore: response.page < response.totalPages,
            loading: false,
            totalPages: response.totalPages,
            currentPage: response.page,
            total: response.count,
          },
        },
        filters: {
          ...prev.filters,
          alerts: filtersWithNextPage,
        },
      }));
      
      console.log('✅ Más alertas cargadas:', response.data.length, 'nuevas');
    } catch (error) {
      console.error('Error al cargar más alertas:', error);
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        pagination: {
          ...prev.pagination,
          alerts: {
            ...prev.pagination.alerts,
            loading: false,
          },
        },
      }));
    }
  }, [state.pagination.alerts, state.filters.alerts]);

  /**
   * Navega directamente a una página específica de notificaciones
   */
  const goToNotificationPage = useCallback(async (page: number) => {
    if (!mountedRef.current) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const filtersWithPage = {
        ...state.filters.notifications,
        page,
      };
      
      console.log('📬 Navegando a página de notificaciones:', page);
      
      const response = await getNotifications(filtersWithPage);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        notifications: response.data, // Reemplazar lista actual
        loading: false,
        filters: {
          ...prev.filters,
          notifications: { ...filtersWithPage, page: response.page },
        },
        pagination: {
          ...prev.pagination,
          notifications: {
            hasMore: response.page < response.totalPages,
            loading: false,
            totalPages: response.totalPages,
            currentPage: response.page,
            total: response.count,
          },
        },
      }));
      
      console.log('✅ Navegación completada a página:', response.page);
    } catch (error) {
      console.error('Error al navegar a página de notificaciones:', error);
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Error al cargar notificaciones',
      }));
    }
  }, [state.filters.notifications]);

  /**
   * Navega directamente a una página específica de alertas
   */
  const goToAlertPage = useCallback(async (page: number) => {
    if (!mountedRef.current) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const filtersWithPage = {
        ...state.filters.alerts,
        page,
      };
      
      console.log('🚨 Navegando a página de alertas:', page);
      
      const response = await getSystemAlerts(filtersWithPage);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        systemAlerts: response.data, // Reemplazar lista actual
        loading: false,
        filters: {
          ...prev.filters,
          alerts: { ...filtersWithPage, page: response.page },
        },
        pagination: {
          ...prev.pagination,
          alerts: {
            hasMore: response.page < response.totalPages,
            loading: false,
            totalPages: response.totalPages,
            currentPage: response.page,
            total: response.count,
          },
        },
      }));
      
      console.log('✅ Navegación completada a página:', response.page);
    } catch (error) {
      console.error('Error al navegar a página de alertas:', error);
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Error al cargar alertas',
      }));
    }
  }, [state.filters.alerts]);

  /**
   * Carga estadísticas de ambos tipos
   */
  const loadStats = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      Logger.debug('NOTIFICATIONS', 'Cargando estadísticas...');
      
      const [notificationStats, alertStats] = await Promise.all([
        getNotificationStats(),
        getSystemAlertStats(),
      ]);
      
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        stats: {
          notifications: notificationStats,
          alerts: alertStats,
        },
      }));
      
      Logger.debug('NOTIFICATIONS', 'Estadísticas cargadas');
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    }
  }, []);

  /**
   * Refresca todos los datos
   */
  const refreshAll = useCallback(async () => {
    Logger.debug('NOTIFICATIONS', 'Refrescando todos los datos...');
    if (!mountedRef.current) return;
    
    try {
      // Cargar datos de forma secuencial para evitar race conditions
      await loadNotifications();
      await loadSystemAlerts();
      await loadStats();
      Logger.info('NOTIFICATIONS', 'Todos los datos refrescados exitosamente');
    } catch (error) {
      console.error('❌ Error al refrescar datos:', error);
    }
  }, []); // Sin dependencias para evitar bucles

  // ========================
  // ACCIONES INDIVIDUALES
  // ========================

  /**
   * Marca una notificación como leída
   */
  const markNotificationAsReadAction = useCallback(async (id: string): Promise<ActionResult> => {
    console.log('📎 Hook markNotificationAsReadAction INICIADO para:', id);
    
    // Buscar la notificación en el estado actual
    const currentNotification = state.notifications.find(n => n.id === id);
    console.log('🔍 Notificación actual en estado:', currentNotification);
    
    const result = await markNotificationAsRead(id);
    console.log('📎 Resultado del servicio markNotificationAsRead:', result);
    
    if (result.success) {
      // Actualizar el estado local inmediatamente
      const readTimestamp = new Date().toISOString();
      console.log('✨ Actualizando estado local con timestamp:', readTimestamp);
      
      setState(prev => {
        const updatedNotifications = prev.notifications.map(n =>
          n.id === id ? { 
            ...n, 
            read_at: readTimestamp,
            is_read: true, // Campo enriquecido para compatibilidad
            updated_at: readTimestamp
          } : n
        );
        
        console.log('🔄 Estado actualizado, notificación modificada:', 
          updatedNotifications.find(n => n.id === id)
        );
        
        return {
          ...prev,
          notifications: updatedNotifications,
        };
      });
      
      // Recargar estadísticas usando setTimeout para evitar ciclos
      setTimeout(() => {
        if (mountedRef.current) {
          loadStats();
        }
      }, 0);
    } else {
      console.error('❌ Error en markNotificationAsRead:', result.message);
    }
    
    return result;
  }, []); // Sin dependencias para evitar ciclos infinitos

  /**
   * Elimina una notificación
   */
  const deleteNotificationAction = useCallback(async (id: string): Promise<ActionResult> => {
    console.log('🗑️ Eliminando notificación:', id);
    
    const result = await deleteNotification(id);
    
    if (result.success) {
      // Remover de estado local inmediatamente
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.filter(n => n.id !== id),
      }));
      
      // Recargar estadísticas usando setTimeout para evitar ciclos
      setTimeout(() => {
        if (mountedRef.current) {
          loadStats();
        }
      }, 0);
    }
    
    return result;
  }, []); // Sin dependencias para evitar ciclos infinitos

  /**
   * Resuelve una alerta del sistema
   */
  const resolveAlertAction = useCallback(async (id: string): Promise<ActionResult> => {
    console.log('✅ Resolviendo alerta del sistema:', id);
    
    const result = await resolveSystemAlert(id);
    
    if (result.success) {
      // Actualizar el estado local inmediatamente
      setState(prev => ({
        ...prev,
        systemAlerts: prev.systemAlerts.map(a =>
          a.id === id 
            ? { 
                ...a, 
                status: 'resolved', 
                is_resolved: true, 
                resolved_at: new Date().toISOString() 
              } 
            : a
        ),
      }));
      
      // Recargar estadísticas usando setTimeout para evitar ciclos
      setTimeout(() => {
        if (mountedRef.current) {
          loadStats();
        }
      }, 0);
    }
    
    return result;
  }, []); // Sin dependencias para evitar ciclos infinitos

  /**
   * Elimina una alerta del sistema
   */
  const deleteAlertAction = useCallback(async (id: string): Promise<ActionResult> => {
    console.log('🗑️ Eliminando alerta del sistema:', id);
    
    const result = await deleteSystemAlert(id);
    
    if (result.success) {
      // Remover de estado local inmediatamente
      setState(prev => ({
        ...prev,
        systemAlerts: prev.systemAlerts.filter(a => a.id !== id),
      }));
      
      // Recargar estadísticas usando setTimeout para evitar ciclos
      setTimeout(() => {
        if (mountedRef.current) {
          loadStats();
        }
      }, 0);
    }
    
    return result;
  }, []); // Sin dependencias para evitar ciclos infinitos

  // ========================
  // ACCIONES MASIVAS
  // ========================

  /**
   * Marca todas las notificaciones como leídas
   */
  const markAllNotificationsAsReadAction = useCallback(async (): Promise<ActionResult> => {
    console.log('📖 Marcando todas las notificaciones como leídas...');
    
    const result = await markAllNotificationsAsRead();
    
    if (result.success) {
      // Recargar datos para reflejar cambios - usar funciones sin dependencias
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n => ({ ...n, read_at: new Date().toISOString() }))
      }));
    }
    
    return result;
  }, []);

  /**
   * Elimina todas las notificaciones
   */
  const deleteAllNotificationsAction = useCallback(async (): Promise<ActionResult> => {
    console.log('🗑️ Eliminando todas las notificaciones...');
    
    const result = await deleteAllNotifications();
    
    if (result.success) {
      // Limpiar estado local inmediatamente
      setState(prev => ({
        ...prev,
        notifications: [],
      }));
    }
    
    return result;
  }, []);

  /**
   * Resuelve todas las alertas pendientes
   */
  const resolveAllAlertsAction = useCallback(async (): Promise<ActionResult> => {
    console.log('✅ Resolviendo todas las alertas...');
    
    const result = await resolveAllSystemAlerts();
    
    if (result.success) {
      // Actualizar estado local para reflejar cambios
      setState(prev => ({
        ...prev,
        systemAlerts: prev.systemAlerts.map(alert => ({ 
          ...alert, 
          status: 'resolved', 
          resolved_at: new Date().toISOString() 
        }))
      }));
    }
    
    return result;
  }, []);

  // ========================
  // GESTIÓN DE FILTROS
  // ========================

  /**
   * Actualiza los filtros de notificaciones
   */
  const updateNotificationFilters = useCallback((newFilters: Partial<NotificationFilter>) => {
    console.log('🔍 Actualizando filtros de notificaciones:', newFilters);
    
    setState(prev => {
      const updatedFilters = { ...prev.filters.notifications, ...newFilters };
      
      // Cargar inmediatamente con nuevos filtros
      setTimeout(() => {
        if (mountedRef.current) {
          loadNotifications(updatedFilters);
        }
      }, 0);
      
      return {
        ...prev,
        filters: {
          ...prev.filters,
          notifications: updatedFilters,
        },
      };
    });
  }, []);

  /**
   * Actualiza los filtros de alertas
   */
  const updateAlertFilters = useCallback((newFilters: Partial<SystemAlertFilter>) => {
    console.log('🔍 Actualizando filtros de alertas:', newFilters);
    
    setState(prev => {
      const updatedFilters = { ...prev.filters.alerts, ...newFilters };
      
      // Cargar con nuevos filtros usando setTimeout para evitar ciclos
      setTimeout(() => {
        if (mountedRef.current) {
          loadSystemAlerts(updatedFilters);
        }
      }, 0);
      
      return {
        ...prev,
        filters: {
          ...prev.filters,
          alerts: updatedFilters,
        },
      };
    });
  }, []); // Sin dependencias para evitar ciclos infinitos

  /**
   * Limpiar todos los filtros
   */
  const clearFilters = useCallback(() => {
    console.log('🧹 Limpiando todos los filtros...');
    
    setState(prev => ({
      ...prev,
      filters: {
        notifications: INITIAL_NOTIFICATION_FILTERS,
        alerts: INITIAL_ALERT_FILTERS,
      },
    }));
    
    // Recargar con filtros iniciales usando setTimeout para evitar ciclos
    setTimeout(() => {
      if (mountedRef.current) {
        loadNotifications(INITIAL_NOTIFICATION_FILTERS);
        loadSystemAlerts(INITIAL_ALERT_FILTERS);
      }
    }, 0);
  }, []); // Sin dependencias para evitar ciclos infinitos

  // ========================
  // EFECTOS Y TIEMPO REAL
  // ========================

  /**
   * Configurar suscripciones de tiempo real
   */
  const setupRealtimeSubscriptions = useCallback((organizationId: number) => {
    // Solo log en desarrollo para tiempo real
    if (process.env.NODE_ENV === 'development') {
      console.log('🔔 Configurando suscripciones de tiempo real para org:', organizationId);
    }
    
    // Limpiar suscripción anterior si existe
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    
    // Crear canal de tiempo real
    const channel = supabase.channel(`notifications-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('🔔 Cambio en notificaciones:', payload);
          // Recargar usando timeout para evitar bucles
          setTimeout(() => {
            if (mountedRef.current) {
              loadNotifications();
            }
          }, 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_alerts',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('🚨 Cambio en alertas:', payload);
          // Recargar usando timeout para evitar bucles
          setTimeout(() => {
            if (mountedRef.current) {
              loadSystemAlerts();
            }
          }, 100);
        }
      )
      .subscribe();
    
    realtimeChannelRef.current = channel;
  }, []); // Eliminamos dependencias problemáticas

  /**
   * Efecto principal para inicializar el hook
   */
  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    
    const initializeHook = async () => {
      try {
        // Obtener organización activa
        const organizacion = obtenerOrganizacionActiva();
        const organizationId = organizacion.id;
        
        // Si la organización cambió, actualizar referencia
        if (organizationRef.current !== organizationId) {
          // Solo log en desarrollo para cambios de organización
          if (process.env.NODE_ENV === 'development') {
            console.log('🏢 Organización cambiada:', organizationId);
          }
          organizationRef.current = organizationId;
          
          // Configurar tiempo real para nueva organización
          setupRealtimeSubscriptions(organizationId);
        }
        
        // Cargar datos iniciales solo si el componente sigue montado
        if (mounted) {
          await refreshAll();
        }
      } catch (error) {
        console.error('Error al inicializar hook de notificaciones:', error);
        if (mounted) {
          setState(prev => ({
            ...prev,
            error: 'Error al inicializar notificaciones',
            loading: false,
          }));
        }
      }
    };
    
    initializeHook();
    
    // Cleanup
    return () => {
      mounted = false;
      mountedRef.current = false;
      
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, []); // Solo ejecutar una vez al montar

  // ========================
  // RETORNO DEL HOOK
  // ========================

  return {
    // Estado
    ...state,
    
    // Funciones de carga
    loadNotifications,
    loadSystemAlerts,
    refreshAll,
    
    // Paginación
    loadMoreNotifications,
    loadMoreAlerts,
    goToNotificationPage,
    goToAlertPage,
    
    // Acciones individuales
    markNotificationAsRead: markNotificationAsReadAction,
    deleteNotification: deleteNotificationAction,
    resolveAlert: resolveAlertAction,
    deleteAlert: deleteAlertAction,
    
    // Acciones masivas
    markAllNotificationsAsRead: markAllNotificationsAsReadAction,
    deleteAllNotifications: deleteAllNotificationsAction,
    resolveAllAlerts: resolveAllAlertsAction,
    
    // Gestión de filtros
    updateNotificationFilters,
    updateAlertFilters,
    clearFilters,
  };
};
