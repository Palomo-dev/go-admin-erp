/**
 * Hook para manejar los detalles de una notificación específica
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  getNotificationDetail, 
  markNotificationAsRead, 
  deleteNotification, 
  retryNotificationDelivery,
  getDeliveryLogs
} from '@/lib/services/notificationServiceExtensions';
import type { NotificationDetail, DeliveryLog, ActionResult } from '@/types/notification';

interface UseNotificationDetailState {
  notification: NotificationDetail | null;
  loading: boolean;
  error: string | null;
  actionLoading: string | null;
}

interface UseNotificationDetailActions {
  loadDetail: () => Promise<void>;
  markAsRead: () => Promise<ActionResult>;
  markAsUnread: () => Promise<ActionResult>;
  archive: () => Promise<ActionResult>;
  retryDelivery: () => Promise<ActionResult>;
  refreshDeliveryLogs: () => Promise<void>;
}

export interface UseNotificationDetailResult extends UseNotificationDetailState, UseNotificationDetailActions {}

export function useNotificationDetail(notificationId: string): UseNotificationDetailResult {
  const [state, setState] = useState<UseNotificationDetailState>({
    notification: null,
    loading: false,
    error: null,
    actionLoading: null
  });

  // Cargar detalles de la notificación
  const loadDetail = useCallback(async () => {
    if (!notificationId) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const detail = await getNotificationDetail(notificationId);
      
      setState(prev => ({ 
        ...prev, 
        notification: detail,
        loading: false 
      }));
    } catch (error: any) {
      console.error('Error al cargar detalles de notificación:', error);
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Error al cargar los detalles',
        loading: false 
      }));
    }
  }, [notificationId]);

  // Marcar como leída
  const markAsRead = useCallback(async (): Promise<ActionResult> => {
    if (!state.notification) {
      return { success: false, message: 'No hay notificación cargada' };
    }

    try {
      setState(prev => ({ ...prev, actionLoading: 'mark_read' }));
      
      const result = await markNotificationAsRead(state.notification.id);
      
      if (result.success) {
        setState(prev => ({
          ...prev,
          notification: prev.notification ? {
            ...prev.notification,
            read_at: new Date().toISOString(),
            status: 'read'
          } : null
        }));
      }
      
      return result;
    } catch (error: any) {
      console.error('Error al marcar como leída:', error);
      return { 
        success: false, 
        message: error.message || 'Error al marcar como leída' 
      };
    } finally {
      setState(prev => ({ ...prev, actionLoading: null }));
    }
  }, [state.notification]);

  // Marcar como no leída (simulado - no hay endpoint específico)
  const markAsUnread = useCallback(async (): Promise<ActionResult> => {
    if (!state.notification) {
      return { success: false, message: 'No hay notificación cargada' };
    }

    try {
      setState(prev => ({ ...prev, actionLoading: 'mark_unread' }));
      
      // Simular el cambio localmente (no hay endpoint específico)
      setState(prev => ({
        ...prev,
        notification: prev.notification ? {
          ...prev.notification,
          read_at: null
        } : null
      }));
      
      return { success: true, message: 'Marcada como no leída' };
    } catch (error: any) {
      console.error('Error al marcar como no leída:', error);
      return { 
        success: false, 
        message: error.message || 'Error al marcar como no leída' 
      };
    } finally {
      setState(prev => ({ ...prev, actionLoading: null }));
    }
  }, [state.notification]);

  // Archivar notificación
  const archive = useCallback(async (): Promise<ActionResult> => {
    if (!state.notification) {
      return { success: false, message: 'No hay notificación cargada' };
    }

    try {
      setState(prev => ({ ...prev, actionLoading: 'archive' }));
      
      const result = await deleteNotification(state.notification.id);
      
      if (result.success) {
        setState(prev => ({
          ...prev,
          notification: prev.notification ? {
            ...prev.notification,
            status: 'read',
            read_at: new Date().toISOString()
          } : null
        }));
      }
      
      return result;
    } catch (error: any) {
      console.error('Error al archivar:', error);
      return { 
        success: false, 
        message: error.message || 'Error al archivar notificación' 
      };
    } finally {
      setState(prev => ({ ...prev, actionLoading: null }));
    }
  }, [state.notification]);

  // Reintentar entrega
  const retryDelivery = useCallback(async (): Promise<ActionResult> => {
    if (!state.notification) {
      return { success: false, message: 'No hay notificación cargada' };
    }

    try {
      setState(prev => ({ ...prev, actionLoading: 'retry' }));
      
      const result = await retryNotificationDelivery(state.notification.id);
      
      if (result.success) {
        // Recargar los detalles para mostrar el nuevo log de entrega
        await loadDetail();
      }
      
      return result;
    } catch (error: any) {
      console.error('Error al reintentar entrega:', error);
      return { 
        success: false, 
        message: error.message || 'Error al reintentar entrega' 
      };
    } finally {
      setState(prev => ({ ...prev, actionLoading: null }));
    }
  }, [state.notification, loadDetail]);

  // Refrescar solo los delivery logs
  const refreshDeliveryLogs = useCallback(async () => {
    if (!state.notification) return;

    try {
      const logs = await getDeliveryLogs(state.notification.id);
      
      setState(prev => ({
        ...prev,
        notification: prev.notification ? {
          ...prev.notification,
          delivery_logs: logs
        } : null
      }));
    } catch (error: any) {
      console.error('Error al refrescar delivery logs:', error);
    }
  }, [state.notification]);

  // Cargar detalles al montar o cambiar ID
  useEffect(() => {
    if (notificationId) {
      loadDetail();
    }
  }, [notificationId, loadDetail]);

  return {
    ...state,
    loadDetail,
    markAsRead,
    markAsUnread,
    archive,
    retryDelivery,
    refreshDeliveryLogs
  };
}
