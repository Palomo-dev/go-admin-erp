/**
 * Funciones adicionales para el servicio de notificaciones
 * Estas funciones se exportan desde el archivo principal
 */

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '../hooks/useOrganization';
import { translateNotification } from '@/utils/notificationTranslations';

// Función de enriquecimiento local
const enrichNotification = async (notification: any): Promise<any> => {
  const payload = notification.payload || {};
  const notificationType = payload.type || 'unknown';
  
  // Usar traducción del archivo centralizado
  const translated = translateNotification(notification);
  
  let enrichedPayload = {
    ...payload,
    title: translated.title,
    content: translated.message,
    original_type: notificationType
  };

  return {
    ...notification,
    payload: enrichedPayload,
    type: notificationType,
    title: translated.title,
    message: translated.message,
    created_at: notification.created_at,
    read_at: notification.read_at,
    status: notification.status || 'pending'
  };
};

// ========================
// FUNCIONES PARA DETALLES DE NOTIFICACIONES
// ========================

/**
 * Obtiene los detalles completos de una notificación incluyendo delivery logs
 */
export async function getNotificationDetail(id: string): Promise<any | null> {
  try {
    const organizationId = getOrganizationId();
    
    // Obtener la notificación
    const { data: notificationData, error: notificationError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (notificationError || !notificationData) {
      return null;
    }

    // Obtener los delivery logs
    const { data: deliveryLogsData, error: logsError } = await supabase
      .from('delivery_logs')
      .select('*')
      .eq('notification_id', id)
      .order('created_at', { ascending: false });

    // Enriquecer la notificación
    const enrichedNotification = await enrichNotification(notificationData);

    return {
      ...enrichedNotification,
      delivery_logs: deliveryLogsData || []
    };
    
  } catch (error) {
    console.error('Error obteniendo detalles de notificación:', error);
    return null;
  }
}

/**
 * Reintentar envío de una notificación
 */
export async function retryNotificationDelivery(notificationId: string): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    // Marcar como pendiente de reenvío
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Notificación marcada para reenvío' };
    
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Obtener logs de entrega de una notificación
 */
export async function getDeliveryLogs(notificationId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('delivery_logs')
      .select('*')
      .eq('notification_id', notificationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo delivery logs:', error);
      return [];
    }

    return data || [];
    
  } catch (error) {
    console.error('Error obteniendo delivery logs:', error);
    return [];
  }
}

/**
 * Obtiene alertas del sistema
 */
export async function getSystemAlerts(filter: any = {}): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    let query = supabase
      .from('system_alerts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filter.status) {
      query = query.eq('status', filter.status);
    }
    
    if (filter.severity) {
      query = query.eq('severity', filter.severity);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo alertas del sistema:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
    
  } catch (error) {
    console.error('Error obteniendo alertas del sistema:', error);
    return { data: [], error };
  }
}

/**
 * Obtiene estadísticas de alertas del sistema
 */
export async function getSystemAlertStats(): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    const { data, error } = await supabase
      .from('system_alerts')
      .select('status, severity, created_at')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error obteniendo estadísticas de alertas:', error);
      return null;
    }

    const total = data?.length || 0;
    const active = data?.filter(a => a.status === 'active').length || 0;
    const resolved = data?.filter(a => a.status === 'resolved').length || 0;

    return {
      total,
      active,
      resolved,
      by_severity: data?.reduce((acc: any, a) => {
        acc[a.severity] = (acc[a.severity] || 0) + 1;
        return acc;
      }, {}) || {}
    };
    
  } catch (error) {
    console.error('Error obteniendo estadísticas de alertas:', error);
    return null;
  }
}

/**
 * Resolver una alerta del sistema
 */
export async function resolveSystemAlert(id: string): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    const { data, error } = await supabase
      .from('system_alerts')
      .update({ 
        status: 'resolved', 
        resolved_at: new Date().toISOString() 
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, data };
    
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Eliminar una alerta del sistema
 */
export async function deleteSystemAlert(id: string): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    const { error } = await supabase
      .from('system_alerts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Alerta eliminada' };
    
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Resolver todas las alertas del sistema
 */
export async function resolveAllSystemAlerts(): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    const { data, error } = await supabase
      .from('system_alerts')
      .update({ 
        status: 'resolved', 
        resolved_at: new Date().toISOString() 
      })
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .select();

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, count: data?.length || 0 };
    
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Marcar notificación como leída
 */
export async function markNotificationAsRead(id: string): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, data };
    
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Eliminar notificación
 */
export async function deleteNotification(id: string): Promise<any> {
  try {
    const organizationId = getOrganizationId();
    
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Notificación eliminada' };
    
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
