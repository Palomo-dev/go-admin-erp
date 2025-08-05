/**
 * Servicio para gestionar notificaciones y alertas del sistema
 * Conecta con las tablas 'notifications' y 'system_alerts' de Supabase
 */

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrgId, getCurrentUserId } from '../hooks/useOrganization';
import { getModuleFromNotificationType, NOTIFICATION_TYPE_TO_MODULE, translateNotification } from '@/utils/notificationTranslations';
import { getNotificationsWithLocalSearch, invalidateNotificationsCache } from './notificationCache';
import type {
  Notification,
  SystemAlert,
  NotificationFilter,
  SystemAlertFilter,
  NotificationResponse,
  SystemAlertResponse,
  NotificationStats,
  SystemAlertStats,
  ActionResult,
  NotificationChannel,
  AlertSeverity,
  SourceModule,
  NotificationType,
  DeliveryLog,
  NotificationDetail
} from '@/types/notification';

// ========================
// UTILIDADES PRIVADAS
// ========================



/**
 * Obtiene el ID de la organización activa
 */
const getOrganizationId = (): number => {
  try {
    const orgId = getOrgId();
    
    // Verificar si el ID es válido
    if (!orgId || typeof orgId !== 'number') {
      return 2; // Fallback a organización 2
    }
    
    return orgId;
  } catch (error) {
    return 2; // Cambiar fallback a 2 que es donde están las notificaciones
  }
};

/**
 * Calcula el tiempo transcurrido desde una fecha
 */
const getTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min${diffMins > 1 ? 's' : ''}`;
  if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  
  return date.toLocaleDateString('es-ES', { 
    day: 'numeric', 
    month: 'short',
    year: diffDays > 365 ? 'numeric' : undefined 
  });
};

/**
 * Enriquece una notificación con datos adicionales
 */


const enrichNotification = async (notification: any): Promise<Notification> => {
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

  // Enriquecer con datos adicionales según el tipo
  try {
    if (payload.opportunity_id) {
      const opportunityData = await getOpportunityData(payload.opportunity_id);
      
      if (opportunityData && 'name' in opportunityData) {
        enrichedPayload = {
          ...enrichedPayload,
          opportunity_name: opportunityData.name,
          client_name: opportunityData.client_name,
          amount: opportunityData.amount,
          currency: opportunityData.currency
        };
      }
    }

    if (payload.client_id) {
      const clientData = await getClientData(payload.client_id);
      if (clientData && 'full_name' in clientData) {
        enrichedPayload = {
          ...enrichedPayload,
          client_name: clientData.full_name || `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim()
        };
      }
    }
  } catch (error) {
    console.warn('Error enriqueciendo notificación:', error);
  }

  // Obtener información del módulo
  const sourceModule = getModuleFromNotificationType(notificationType);
  
  return {
    ...notification,
    payload: enrichedPayload,
    is_read: !!notification.read_at,
    time_ago: getTimeAgo(notification.created_at),
    source_module: sourceModule, // Agregar módulo derivado
    notification_type: notificationType, // Agregar tipo explícito
  };
};

/**
 * Obtiene datos de entidades relacionadas (oportunidades, clientes, tareas)
 */
const getRelatedEntityData = async (type: 'opportunity' | 'client' | 'task', id: string) => {
  try {
    switch (type) {
      case 'opportunity': {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('id, name, amount, currency, customer_id')
          .eq('id', id)
          .single();

        if (opportunity && opportunity.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id, full_name, first_name, last_name')
            .eq('id', opportunity.customer_id)
            .single();

          return {
            ...opportunity,
            client_name: customer?.full_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Cliente desconocido'
          };
        }
        return opportunity ? { ...opportunity, client_name: 'Cliente no encontrado' } : null;
      }
      
      case 'client': {
        const { data } = await supabase
          .from('customers')
          .select('id, full_name, first_name, last_name, email')
          .eq('id', id)
          .single();
        return data;
      }
      
      case 'task': {
        const { data } = await supabase
          .from('tasks')
          .select('id, title, description, status, priority, due_date, assigned_to, customer_id')
          .eq('id', id)
          .single();
        return data;
      }
      
      default:
        return null;
    }
  } catch (error) {
    console.warn(`Error obteniendo datos de ${type}:`, error);
  }
  return null;
};

// Funciones de compatibilidad
const getOpportunityData = (id: string) => getRelatedEntityData('opportunity', id);
const getClientData = (id: string) => getRelatedEntityData('client', id);

/**
 * Diccionario de traducciones para alertas del sistema
 */
const ALERT_TRANSLATIONS: Record<string, string> = {
  // Severidades
  critical: 'Crítico',
  error: 'Error',
  warning: 'Advertencia',
  info: 'Información',
  
  // Estados
  active: 'Activo',
  resolved: 'Resuelto',
  pending: 'Pendiente',
  acknowledged: 'Reconocido',
  
  // Módulos fuente
  system: 'Sistema',
  database: 'Base de Datos',
  auth: 'Autenticación',
  api: 'API',
  storage: 'Almacenamiento',
  email: 'Email',
  payment: 'Pagos',
  crm: 'CRM',
  inventory: 'Inventario',
  pos: 'Punto de Venta'
};

/**
 * Enriquece una alerta con datos adicionales y traducciones
 */
const enrichSystemAlert = (alert: any): SystemAlert => {
  const severityOrder = { critical: 1, error: 2, warning: 3, info: 4 };
  
  return {
    ...alert,
    // Traducir campos
    severity_display: ALERT_TRANSLATIONS[alert.severity] || alert.severity,
    status_display: ALERT_TRANSLATIONS[alert.status] || alert.status,
    source_module_display: ALERT_TRANSLATIONS[alert.source_module] || alert.source_module,
    
    // Campos calculados
    is_resolved: alert.status === 'resolved',
    time_ago: getTimeAgo(alert.created_at),
    priority_order: severityOrder[alert.severity as AlertSeverity] || 5,
  };
};

// ========================
// FUNCIONES PARA NOTIFICATIONS
// ========================

/**
 * Obtiene notificaciones con filtros y paginación (versión antigua - compatible con hooks)
 */
export const getNotifications = async (
  filters: NotificationFilter = {}
): Promise<NotificationResponse> => {
  try {
    const organizationId = getOrganizationId();
    const { page = 1, limit = 10, ...otherFilters } = filters;
    
    // Si hay búsqueda, intentar usar búsqueda local (con fallback)
    if (otherFilters.search) {
      try {
        const localSearchResult = await getNotificationsWithLocalSearch(organizationId, page, limit, otherFilters);
        return {
          data: localSearchResult.data,
          count: localSearchResult.count,
          page: localSearchResult.page,
          limit: localSearchResult.limit,
          totalPages: localSearchResult.totalPages
        };
      } catch (localError) {
        // Continuar con búsqueda normal sin filtro de búsqueda
      }
    }
    
    // Construir la consulta base (sin JOIN problemático)
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .neq('status', 'deleted') // Excluir notificaciones marcadas como eliminadas
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (otherFilters.channel) {
      query = query.eq('channel', otherFilters.channel);
    }
    
    if (otherFilters.status) {
      query = query.eq('status', otherFilters.status);
    }
    
    if (otherFilters.is_read === true) {
      query = query.not('read_at', 'is', null);
    } else if (otherFilters.is_read === false) {
      query = query.is('read_at', null);
    }
    
    if (otherFilters.user_id) {
      query = query.eq('recipient_user_id', otherFilters.user_id);
    }
    
    if (otherFilters.date_from) {
      query = query.gte('created_at', otherFilters.date_from);
    }
    
    if (otherFilters.date_to) {
      query = query.lte('created_at', otherFilters.date_to);
    }
    
    // Filtro por tipo específico de notificación
    if (otherFilters.notification_type) {
      query = query.eq('payload->>type', otherFilters.notification_type);
    }
    
    // Filtro por módulo (usando el mapeo de tipos a módulos)
    if (otherFilters.source_module) {
      // Obtener todos los tipos que pertenecen a este módulo
      const typesForModule = Object.entries(NOTIFICATION_TYPE_TO_MODULE)
        .filter(([_, module]) => module === otherFilters.source_module)
        .map(([type, _]) => type);
      
      if (typesForModule.length > 0) {
        // Usar IN para filtrar por múltiples tipos
        query = query.in('payload->>type', typesForModule);
      }
    }
    
    // NOTA: La búsqueda ahora se hace de forma local - no agregar filtros SQL

    // Aplicar paginación
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Si hay búsqueda, usar búsqueda local
    if (otherFilters.search) {
      console.log('🔍 DEBUG - Usando búsqueda local en lugar de SQL');
      return await getNotificationsWithLocalSearch(organizationId, page, limit, otherFilters);
    }

    const { data, error, count } = await query;

    if (error) {
      // Logging completamente detallado para debug
      console.error('❌ Error al obtener notificaciones - ANÁLISIS COMPLETO:', {
        error,
        errorType: typeof error,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorDetails: error?.details,
        errorName: error?.name,
        errorHint: error?.hint,
        errorStringified: JSON.stringify(error),
        organizationId,
        filters: { page, limit, ...otherFilters },
        queryConstructed: 'Query object details logged above'
      });
      
      // Si el error no tiene información útil, crear uno descriptivo
      const errorMessage = error?.message || error?.hint || error?.details || 'Error desconocido en consulta de Supabase';
      throw new Error(`Fallo en consulta de notificaciones: ${errorMessage}`);
    }

    // Enriquecer notificaciones
    const enrichedNotifications = await Promise.all(
      (data || []).map(async (notification) => {
        const enriched = await enrichNotification(notification);
        return enriched;
      })
    );

    const totalPages = Math.ceil((count || 0) / limit);

    // Solo log en desarrollo o cuando hay errores
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Notificaciones obtenidas:', {
        count: count || 0,
        page,
        limit,
        totalPages,
        dataLength: enrichedNotifications.length,
        hasMore: page < totalPages
      });
    }

    return {
      data: enrichedNotifications,
      count: count || 0,
      page,
      limit,
      totalPages,
    };
  } catch (error: any) {
    // Logging detallado del catch general
    console.error('❌ Error en getNotifications (catch general) - Detalle completo:', {
      error,
      errorMessage: error?.message,
      errorName: error?.name,
      errorStack: error?.stack,
      errorStringified: JSON.stringify(error)
    });
    throw new Error(`Error general en getNotifications: ${error?.message || JSON.stringify(error)}`);
  }
};

/**
 * Marca una notificación como leída
 */
export const markNotificationAsRead = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    const timestamp = new Date().toISOString();
    
    console.log('🔍 markNotificationAsRead INICIADO:', { id, organizationId, timestamp });
    
    // DEBUG: Verificar si la notificación existe SIN filtro de organización
    const { data: existingNotification, error: checkError } = await supabase
      .from('notifications')
      .select('id, organization_id, read_at')
      .eq('id', id)
      .single();
    
    if (checkError) {
      console.error('❌ Error al verificar existencia de notificación:', checkError);
      return { success: false, message: `Notificación no existe: ${checkError.message}` };
    }
    
    console.log('📎 DEBUGGING - Notificación encontrada:', existingNotification);
    console.log('📎 DEBUGGING - organizationId solicitado:', organizationId, typeof organizationId);
    console.log('📎 DEBUGGING - organization_id en BD:', existingNotification.organization_id, typeof existingNotification.organization_id);
    
    if (existingNotification.organization_id !== organizationId) {
      console.error('❌ MISMATCH de organization_id:', {
        expected: organizationId,
        actual: existingNotification.organization_id,
        idType: typeof organizationId,
        actualType: typeof existingNotification.organization_id
      });
      return { success: false, message: `Sin permisos: organización ${organizationId} vs ${existingNotification.organization_id}` };
    }
    
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        read_at: timestamp,
        status: 'read', // Cambiar estado a 'read'
        updated_at: timestamp
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id, read_at, status, updated_at'); // Retornar datos actualizados

    console.log('🔍 UPDATE resultado completo:', { data, error, affectedRows: data?.length });

    if (error) {
      console.error('❌ Error al marcar como leída:', error);
      return { success: false, message: `Error al marcar como leída: ${error.message}` };
    }

    // Verificar si se afectó alguna fila usando data.length
    const affectedRows = data?.length || 0;
    
    if (affectedRows === 0) {
      console.warn('⚠️ UPDATE no afectó ninguna fila - posible problema de permisos RLS:', { id, organizationId, dataLength: data?.length });
      return { success: false, message: 'No se pudo actualizar - verificar permisos' };
    }

    console.log('✅ Notificación marcada como leída correctamente:', { affectedRows, firstRow: data?.[0] });
    return { success: true, message: 'Notificación marcada como leída' };
  } catch (error) {
    console.error('Error en markNotificationAsRead:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Marca todas las notificaciones como leídas
 */
export const markAllNotificationsAsRead = async (): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    const timestamp = new Date().toISOString();
    
    console.log('📖 [markAllNotificationsAsRead] Iniciando para organización:', organizationId);
    
    // CORRECCIÓN: Actualizar tanto read_at como status
    const { error, count } = await supabase
      .from('notifications')
      .update({ 
        read_at: timestamp,
        status: 'read', // ✅ IMPORTANTE: Cambiar estado a 'read'
        updated_at: timestamp
      })
      .eq('organization_id', organizationId)
      .neq('status', 'deleted') // Excluir notificaciones eliminadas
      .neq('status', 'read'); // Solo actualizar las que no están ya leídas

    if (error) {
      console.error('❌ Error al marcar todas como leídas:', {
        message: error.message,
        code: error.code,
        details: error.details,
        organizationId
      });
      return { success: false, message: `Error al marcar todas como leídas: ${error.message}` };
    }

    console.log('✅ [markAllNotificationsAsRead] Completado:', {
      organizationId,
      affectedCount: count,
      timestamp
    });
    
    // Invalidar cache para refrescar los datos
    invalidateNotificationsCache();
    
    return { 
      success: true, 
      message: `${count || 0} notificaciones marcadas como leídas`,
      affected_count: count || 0
    };
  } catch (error: any) {
    console.error('❌ Error en markAllNotificationsAsRead:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack
    });
    return { success: false, message: 'Error inesperado al marcar notificaciones' };
  }
};

/**
 * Marca una notificación como eliminada (soft delete)
 */
export const deleteNotification = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    
    // Verificar autenticación del usuario
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('🔑 Estado de autenticación:', { 
      user: user?.id, 
      email: user?.email, 
      authError,
      organizationId 
    });
    
    console.log('🗑️ MARCANDO NOTIFICACIÓN COMO ELIMINADA (SOFT DELETE):', { id, organizationId });
    
    // Verificar la notificación antes de marcar como eliminada
    const { data: existingNotification, error: selectError } = await supabase
      .from('notifications')
      .select('id, organization_id, recipient_user_id, status')
      .eq('id', id)
      .single();
    
    if (selectError) {
      console.error('❌ Error al verificar notificación antes de eliminar:', selectError);
      return { success: false, message: 'Notificación no encontrada' };
    }
    
    console.log('📋 Notificación encontrada:', existingNotification);
    
    // Actualizar status a 'deleted' en lugar de eliminar físicamente
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        status: 'deleted',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select();

    console.log('🔍 Resultado de UPDATE (soft delete):', { 
      data, 
      error, 
      errorMessage: error?.message,
      errorDetails: error?.details,
      errorHint: error?.hint,
      errorCode: error?.code,
      affectedRows: data?.length 
    });

    if (error) {
      console.error('❌ Error al marcar notificación como eliminada:', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      const errorMsg = error?.message || error?.details || 'Error desconocido en UPDATE';
      return { success: false, message: `Error al eliminar: ${errorMsg}` };
    }

    // Verificar si se actualizó alguna fila
    const updatedRows = data?.length || 0;
    
    if (updatedRows === 0) {
      console.warn('⚠️ UPDATE no afectó ninguna fila - posible problema de permisos RLS');
      return { success: false, message: 'No se pudo eliminar - verificar permisos' };
    }

    console.log('✅ Notificación marcada como eliminada correctamente:', { updatedRows });
    return { success: true, message: 'Notificación eliminada' };
  } catch (error) {
    console.error('❌ Error en deleteNotification:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Elimina todas las notificaciones
 */
export const deleteAllNotifications = async (): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('🗑️ Eliminando todas las notificaciones');
    
    const { error, count } = await supabase
      .from('notifications')
      .delete()
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error al eliminar todas las notificaciones:', error);
      return { success: false, message: 'Error al eliminar todas las notificaciones' };
    }

    console.log('✅ Todas las notificaciones eliminadas:', count);
    return { 
      success: true, 
      message: `${count || 0} notificaciones eliminadas`,
      affected_count: count || 0
    };
  } catch (error) {
    console.error('Error en deleteAllNotifications:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Obtiene estadísticas de notificaciones
 */
export const getNotificationStats = async (): Promise<NotificationStats> => {
  try {
    const organizationId = getOrganizationId();
    
    // console.log('🗊 Obteniendo estadísticas de notificaciones'); // LOG REDUCIDO
    
    // Obtener todas las notificaciones para calcular estadísticas (excluyendo eliminadas)
    const { data, error } = await supabase
      .from('notifications')
      .select('channel, status, read_at, created_at')
      .eq('organization_id', organizationId)
      .neq('status', 'deleted'); // Excluir notificaciones eliminadas

    if (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }

    const notifications = data || [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calcular estadísticas
    const stats: NotificationStats = {
      total: notifications.length,
      unread: notifications.filter(n => !n.read_at).length,
      by_channel: {
        email: 0,
        sms: 0,
        push: 0,
        whatsapp: 0,
        webhook: 0,
      },
      by_status: {
        pending: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        read: 0,
      },
      today: 0,
      this_week: 0,
      this_month: 0,
    };

    notifications.forEach(notification => {
      const createdAt = new Date(notification.created_at);
      
      // Contar por canal
      if (notification.channel in stats.by_channel) {
        stats.by_channel[notification.channel as NotificationChannel]++;
      }
      
      // Contar por estado
      if (notification.status in stats.by_status) {
        stats.by_status[notification.status as keyof typeof stats.by_status]++;
      }
      
      // Contar por período
      if (createdAt >= today) stats.today++;
      if (createdAt >= thisWeek) stats.this_week++;
      if (createdAt >= thisMonth) stats.this_month++;
    });

    // Solo log en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Estadísticas calculadas:', stats);
    }
    return stats;
  } catch (error) {
    console.error('Error en getNotificationStats:', error);
    throw error;
  }
};

// ========================
// FUNCIONES PARA SYSTEM_ALERTS
// ========================

/**
 * Obtiene alertas del sistema con filtros y paginación
 */
export const getSystemAlerts = async (
  filters: SystemAlertFilter = {}
): Promise<SystemAlertResponse> => {
  try {
    const organizationId = getOrganizationId();
    const { page = 1, limit = 10, ...otherFilters } = filters;
    
    // console.log('🔍 Obteniendo alertas del sistema:', { organizationId, filters }); // LOG REDUCIDO
    
    // Construir la consulta base (sin JOIN problemático)
    let query = supabase
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (otherFilters.severity) {
      query = query.eq('severity', otherFilters.severity);
    }
    
    if (otherFilters.status) {
      query = query.eq('status', otherFilters.status);
    }
    
    if (otherFilters.source_module) {
      query = query.eq('source_module', otherFilters.source_module);
    }
    
    if (otherFilters.resolved_by) {
      query = query.eq('resolved_by', otherFilters.resolved_by);
    }
    
    if (otherFilters.date_from) {
      query = query.gte('created_at', otherFilters.date_from);
    }
    
    if (otherFilters.date_to) {
      query = query.lte('created_at', otherFilters.date_to);
    }
    
    if (otherFilters.search) {
      const searchTerm = `%${otherFilters.search}%`;
      query = query.or(`title.ilike.${searchTerm},message.ilike.${searchTerm}`);
    }

    // Aplicar paginación
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error al obtener alertas del sistema:', error);
      throw error;
    }

    // Enriquecer alertas
    const enrichedAlerts = (data || []).map(alert => {
      const enriched = enrichSystemAlert(alert);
      // TODO: Agregar nombre del usuario que resolvió en consulta separada si es necesario
      return enriched;
    });

    const totalPages = Math.ceil((count || 0) / limit);

    // Solo log en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Alertas del sistema obtenidas:', enrichedAlerts.length);
    }

    return {
      data: enrichedAlerts,
      count: count || 0,
      page,
      limit,
      totalPages,
    };
  } catch (error) {
    console.error('Error en getSystemAlerts:', error);
    throw error;
  }
};

/**
 * Resuelve una alerta del sistema
 */
export const resolveSystemAlert = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    const userId = await getCurrentUserId();
    
    console.log('✅ Resolviendo alerta del sistema:', id);
    
    const { error } = await supabase
      .from('system_alerts')
      .update({ 
        status: 'resolved',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error al resolver alerta:', error);
      return { success: false, message: 'Error al resolver alerta' };
    }

    console.log('✅ Alerta del sistema resuelta');
    return { success: true, message: 'Alerta resuelta correctamente' };
  } catch (error) {
    console.error('Error en resolveSystemAlert:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Resuelve todas las alertas pendientes
 */
export const resolveAllSystemAlerts = async (): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    const userId = await getCurrentUserId();
    
    console.log('✅ Resolviendo todas las alertas pendientes');
    
    const { error, count } = await supabase
      .from('system_alerts')
      .update({ 
        status: 'resolved',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId)
      .neq('status', 'resolved');

    if (error) {
      console.error('Error al resolver todas las alertas:', error);
      return { success: false, message: 'Error al resolver todas las alertas' };
    }

    console.log('✅ Todas las alertas resueltas:', count);
    return { 
      success: true, 
      message: `${count || 0} alertas resueltas`,
      affected_count: count || 0
    };
  } catch (error) {
    console.error('Error en resolveAllSystemAlerts:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Elimina una alerta del sistema
 */
export const deleteSystemAlert = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('🗑️ Eliminando alerta del sistema:', id);
    
    const { error } = await supabase
      .from('system_alerts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error al eliminar alerta:', error);
      return { success: false, message: 'Error al eliminar alerta' };
    }

    console.log('✅ Alerta del sistema eliminada');
    return { success: true, message: 'Alerta eliminada correctamente' };
  } catch (error) {
    console.error('Error en deleteSystemAlert:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Obtiene estadísticas de alertas del sistema
 */
export const getSystemAlertStats = async (): Promise<SystemAlertStats> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('📊 Obteniendo estadísticas de alertas del sistema');
    
    // Obtener todas las alertas para calcular estadísticas
    const { data, error } = await supabase
      .from('system_alerts')
      .select('severity, status, source_module, created_at')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error al obtener estadísticas de alertas:', error);
      throw error;
    }

    const alerts = data || [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calcular estadísticas
    const stats: SystemAlertStats = {
      total: alerts.length,
      pending: alerts.filter(a => a.status !== 'resolved').length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
      by_severity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
      by_module: {
        sistema: 0,
        ventas: 0,
        inventario: 0,
        pms: 0,
        rrhh: 0,
        crm: 0,
        finanzas: 0,
      },
      critical_count: 0,
      today: 0,
      this_week: 0,
    };

    alerts.forEach(alert => {
      const createdAt = new Date(alert.created_at);
      
      // Contar por severidad
      if (alert.severity in stats.by_severity) {
        stats.by_severity[alert.severity as AlertSeverity]++;
      }
      
      // Contar por módulo
      if (alert.source_module in stats.by_module) {
        stats.by_module[alert.source_module as SourceModule]++;
      }
      
      // Contar críticas
      if (alert.severity === 'critical') {
        stats.critical_count++;
      }
      
      // Contar por período
      if (createdAt >= today) stats.today++;
      if (createdAt >= thisWeek) stats.this_week++;
    });

    console.log('✅ Estadísticas de alertas calculadas:', stats);
    return stats;
  } catch (error) {
    console.error('Error en getSystemAlertStats:', error);
    throw error;
  }
};

// ========================
// FUNCIONES PARA DETALLES DE NOTIFICACIONES
// ========================





/**
 * Archiva una notificación (marca como archivada sin eliminar)
 * @param id ID de la notificación
 * @returns Resultado de la operación
 */
export async function archiveNotification(id: string): Promise<ActionResult> {
  try {
    console.log('📦 Archivando notificación:', id);
    const organizationId = getOrganizationId();
    
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'read', // Marcamos como leída al archivar
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Agregamos flag de archivada en metadata
        payload: supabase.rpc('jsonb_set', {
          target: 'payload',
          path: '{archived}',
          new_value: 'true'
        })
      })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('❌ Error al archivar notificación:', error);
      return {
        success: false,
        message: `Error al archivar notificación: ${error.message}`
      };
    }

    // Invalidar cache
    invalidateNotificationsCache();

    console.log('✅ Notificación archivada exitosamente');
    return {
      success: true,
      message: 'Notificación archivada exitosamente'
    };
  } catch (error: any) {
    console.error('❌ Error en archiveNotification:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    return {
      success: false,
      message: `Error al archivar notificación: ${error.message}`
    };
  }
}

// ========================
// FUNCIONES PARA TESTING Y DESARROLLO
// ========================

/**
 * Crea una notificación de prueba con adjuntos y enlaces para testing
 * @param organizationId ID de la organización
 * @returns Resultado de la creación
 */
export async function createTestNotificationWithAttachments(organizationId?: number): Promise<ActionResult> {
  try {
    console.log('📝 Creando notificación de prueba con adjuntos...');
    
    const orgId = organizationId || getOrganizationId();
    const currentUserId = await getCurrentUserId();
    
    // Datos de prueba
    const testPayload = {
      type: 'test_notification',
      title: 'Notificación de Prueba Completa',
      content: `Esta es una notificación de prueba para demostrar la vista detallada.\n\nIncluye:\n- Mensaje completo con formato\n- Archivos adjuntos simulados\n- Enlaces contextuales\n- Historial de entregas\n\nCreada el: ${new Date().toLocaleString()}`,
      test_data: {
        created_by: 'Sistema de Pruebas',
        test_id: `test-${Date.now()}`,
        environment: 'development'
      },
      // Adjuntos simulados
      attachments: [
        {
          name: 'Documento_Importante.pdf',
          url: '/test-files/documento.pdf',
          type: 'application/pdf',
          size: 2048576 // 2MB
        },
        {
          name: 'Imagen_Producto.jpg',
          url: '/test-files/imagen.jpg',
          type: 'image/jpeg',
          size: 1024000 // 1MB
        },
        {
          name: 'Hoja_Calculos.xlsx',
          url: '/test-files/spreadsheet.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 512000 // 500KB
        }
      ],
      // Enlaces contextuales simulados
      links: [
        {
          name: 'Ver Cliente Relacionado',
          url: '/app/clientes/123',
          description: 'Información completa del cliente asociado a esta notificación'
        },
        {
          name: 'Tarea CRM Asociada',
          url: '/app/crm/tareas/456',
          description: 'Tarea relacionada con esta notificación'
        },
        {
          name: 'Oportunidad de Venta',
          url: '/app/crm/pipeline/789',
          description: 'Oportunidad en el pipeline de ventas'
        },
        {
          name: 'Sitio Web Externo',
          url: 'https://www.ejemplo.com',
          description: 'Enlace externo relacionado con la notificación'
        }
      ]
    };
    
    // Crear la notificación
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        organization_id: orgId,
        recipient_user_id: currentUserId,
        recipient_email: 'usuario@test.com',
        channel: 'email',
        payload: testPayload,
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error al crear notificación de prueba:', error);
      throw new Error(`Error al crear notificación de prueba: ${error.message}`);
    }
    
    console.log('✅ Notificación de prueba creada:', data.id);
    
    // Crear algunos delivery logs de prueba
    const deliveryLogs = [
      {
        notification_id: data.id,
        attempt_no: 1,
        status: 'pending',
        provider_response: {
          provider: 'EmailService',
          message_id: `test-${Date.now()}-1`,
          status: 'queued',
          queued_at: new Date().toISOString()
        }
      },
      {
        notification_id: data.id,
        attempt_no: 2,
        status: 'sent',
        provider_response: {
          provider: 'EmailService',
          message_id: `test-${Date.now()}-2`,
          status: 'sent',
          sent_at: new Date(Date.now() - 5000).toISOString(),
          recipient: 'usuario@test.com'
        }
      },
      {
        notification_id: data.id,
        attempt_no: 3,
        status: 'delivered',
        provider_response: {
          provider: 'EmailService',
          message_id: `test-${Date.now()}-3`,
          status: 'delivered',
          delivered_at: new Date(Date.now() - 1000).toISOString(),
          recipient: 'usuario@test.com',
          details: {
            opened: false,
            clicked: false,
            bounced: false
          }
        }
      }
    ];
    
    // Insertar delivery logs
    const { error: logsError } = await supabase
      .from('delivery_logs')
      .insert(deliveryLogs);
    
    if (logsError) {
      console.warn('⚠️ Error al crear delivery logs de prueba (no crítico):', logsError);
    } else {
      console.log('✅ Delivery logs de prueba creados');
    }
    
    // Invalidar cache
    invalidateNotificationsCache();
    
    return {
      success: true,
      message: `Notificación de prueba creada exitosamente. ID: ${data.id}`
    };
  } catch (error: any) {
    console.error('❌ Error en createTestNotificationWithAttachments:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    return {
      success: false,
      message: `Error al crear notificación de prueba: ${error.message}`
    };
  }
}

// ========================
// FUNCIONES PARA NOTIFICACIONES AUTOMÁTICAS DE TAREAS
// ========================

/**
 * Crea una notificación cuando se asigna una tarea a un usuario
 * VERSIÓN CORREGIDA - Sin campos created_at/updated_at manuales
 * @param taskData Datos de la tarea
 * @param assignedUserId ID del usuario asignado
 * @param organizationId ID de la organización
 * @returns Resultado de la creación
 */
export const createTaskAssignedNotification = async (
  taskData: any,
  assignedUserId: string,
  organizationId: number
): Promise<ActionResult> => {
  try {
    console.log('🔔 Creando notificación de tarea asignada:', {
      taskId: taskData.id,
      taskTitle: taskData.title,
      assignedUserId,
      organizationId
    });

    // Validar datos de entrada
    if (!taskData || !taskData.id || !taskData.title) {
      console.error('❌ Datos de tarea incompletos:', taskData);
      return {
        success: false,
        message: 'Datos de tarea incompletos'
      };
    }
    
    if (!assignedUserId || typeof assignedUserId !== 'string') {
      console.error('❌ ID de usuario asignado inválido:', assignedUserId);
      return {
        success: false,
        message: 'ID de usuario asignado inválido'
      };
    }
    
    if (!organizationId || typeof organizationId !== 'number') {
      console.error('❌ ID de organización inválido:', organizationId);
      return {
        success: false,
        message: 'ID de organización inválido'
      };
    }

    // Obtener información del usuario asignado
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .select('name, email')
      .eq('id', assignedUserId)
      .single();

    if (userError) {
      console.warn('⚠️ No se pudo obtener información del usuario asignado:', userError);
    }

    // Crear la notificación (SIN created_at/updated_at - los maneja la BD)
    const notificationData = {
      organization_id: organizationId,
      recipient_user_id: assignedUserId,
      recipient_email: userData?.email || null,
      channel: 'push' as NotificationChannel, // Cambiado de in_app a push según constraints de BD
      payload: {
        type: 'task_assigned',
        title: 'Nueva tarea asignada',
        content: `Se te ha asignado la tarea: ${taskData.title}`,
        task_id: taskData.id,
        task_title: taskData.title,
        task_description: taskData.description,
        due_date: taskData.due_date,
        priority: taskData.priority
      },
      status: 'pending'
    };

    console.log('📦 Insertando notificación:', JSON.stringify(notificationData, null, 2));

    const { data, error } = await supabase
      .from('notifications')
      .insert([notificationData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error detallado al insertar notificación:');
      console.error('- message:', error.message);
      console.error('- code:', error.code);
      console.error('- details:', error.details);
      console.error('- hint:', error.hint);
      return {
        success: false,
        message: `Error al crear notificación: ${error.message || error.code || 'Error desconocido'}`
      };
    }

    console.log('✅ Notificación creada exitosamente:', data.id);
    
    // Invalidar cache de notificaciones
    invalidateNotificationsCache();

    return {
      success: true,
      message: 'Notificación de tarea asignada creada exitosamente',
      affected_count: 1
    };

  } catch (error: any) {
    console.error('❌ Error inesperado:', error);
    return {
      success: false,
      message: `Error inesperado: ${error.message || 'Error desconocido'}`
    };
  }
};

/**
 * Crea una notificación para el cliente relacionado con una tarea
 * @param taskData Datos de la tarea
 * @param customerId ID del cliente relacionado
 * @param organizationId ID de la organización
 * @returns Resultado de la creación
 */
export const createTaskClientNotification = async (
  taskData: any,
  customerId: string,
  organizationId: number
): Promise<ActionResult> => {
  try {
    console.log('🔔 Creando notificación de tarea para cliente:', {
      taskId: taskData.id,
      taskTitle: taskData.title,
      customerId,
      organizationId
    });

    // Obtener información del cliente
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('first_name, last_name, email, phone')
      .eq('id', customerId)
      .single();

    if (customerError || !customerData) {
      console.warn('⚠️ No se pudo obtener información del cliente:', customerError);
      return {
        success: false,
        message: 'Cliente no encontrado'
      };
    }

    const customerName = `${customerData.first_name} ${customerData.last_name}`.trim();
    const recipientEmail = customerData.email;

    if (!recipientEmail) {
      console.warn('⚠️ El cliente no tiene email configurado, no se puede enviar notificación');
      return {
        success: false,
        message: 'El cliente no tiene email configurado'
      };
    }

    // Crear la notificación
    const notificationData = {
      organization_id: organizationId,
      recipient_user_id: null, // Los clientes no tienen user_id
      recipient_email: recipientEmail,
      channel: 'email' as NotificationChannel,
      payload: {
        type: 'task_created_for_client',
        title: 'Nueva tarea relacionada',
        content: `Se ha creado una nueva tarea relacionada con usted: ${taskData.title}`,
        task_id: taskData.id,
        task_title: taskData.title,
        task_description: taskData.description,
        customer_id: customerId,
        customer_name: customerName,
        due_date: taskData.due_date,
        priority: taskData.priority
      },
      status: 'pending'
      // created_at y updated_at se manejan automáticamente por la BD
    };

    console.log('📦 Insertando notificación para cliente:', JSON.stringify(notificationData, null, 2));

    const { data, error } = await supabase
      .from('notifications')
      .insert([notificationData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error detallado al insertar notificación para cliente:');
      console.error('- message:', error.message);
      console.error('- code:', error.code);
      console.error('- details:', error.details);
      console.error('- hint:', error.hint);
      return {
        success: false,
        message: `Error al crear notificación: ${error.message || error.code || 'Error desconocido'}`
      };
    }

    console.log('✅ Notificación para cliente creada exitosamente:', data.id);
    
    // Invalidar cache de notificaciones
    invalidateNotificationsCache();

    return {
      success: true,
      message: 'Notificación para cliente creada exitosamente',
      affected_count: 1
    };

  } catch (error: any) {
    console.error('❌ Error inesperado al crear notificación para cliente:', error);
    return {
      success: false,
      message: `Error inesperado: ${error.message || 'Error desconocido'}`
    };
  }
};

/**
 * Función principal para generar notificaciones automáticas de tareas
 * Se ejecuta cuando se crea o actualiza una tarea con asignación
 * @param taskData Datos de la tarea (nueva o actualizada)
 * @param isNewTask Si es una tarea nueva (true) o actualización (false)
 * @param oldAssignedTo ID del usuario anteriormente asignado (solo para actualizaciones)
 * @returns Array con resultados de las notificaciones creadas
 */
export const generateTaskNotifications = async (
  taskData: any,
  isNewTask: boolean = true,
  oldAssignedTo?: string | null
): Promise<ActionResult[]> => {
  const results: ActionResult[] = [];
  
  try {
    console.log('🚀 Generando notificaciones automáticas de tarea:', {
      taskId: taskData.id,
      taskTitle: taskData.title,
      isNewTask,
      assignedTo: taskData.assigned_to,
      oldAssignedTo,
      relatedToType: taskData.related_to_type,
      relatedToId: taskData.related_to_id
    });

    // 1. Notificación para el usuario asignado (solo si hay asignación y es diferente al anterior)
    if (taskData.assigned_to && taskData.assigned_to !== oldAssignedTo) {
      const assignedResult = await createTaskAssignedNotification(
        taskData,
        taskData.assigned_to,
        taskData.organization_id
      );
      results.push(assignedResult);
    }

    // 2. Notificación para el cliente relacionado (solo para tareas nuevas o si cambió la relación)
    if (isNewTask && taskData.related_to_type === 'customer' && taskData.related_to_id) {
      const clientResult = await createTaskClientNotification(
        taskData,
        taskData.related_to_id,
        taskData.organization_id
      );
      results.push(clientResult);
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    console.log(`📊 Resumen de notificaciones: ${successCount}/${totalCount} exitosas`);

    return results;

  } catch (error: any) {
    console.error('❌ Error al generar notificaciones de tarea:', error);
    return [{
      success: false,
      message: `Error generando notificaciones: ${error.message}`
    }];
  }
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
 * Restaura una notificación archivada (cambia status de 'deleted' a 'pending')
 */
export const restoreNotification = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('♾️ RESTAURANDO NOTIFICACIÓN ARCHIVADA:', { id, organizationId });
    
    // Verificar que la notificación existe y está archivada
    const { data: existingNotification, error: selectError } = await supabase
      .from('notifications')
      .select('id, organization_id, status')
      .eq('id', id)
      .eq('status', 'deleted')
      .single();
    
    if (selectError) {
      console.error('❌ Error verificando notificación archivada:', selectError);
      return { success: false, message: 'Notificación archivada no encontrada' };
    }
    
    console.log('📋 Notificación archivada encontrada:', existingNotification);
    
    // Restaurar cambiando status a 'pending' y actualizando fecha
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select();

    console.log('🔍 Resultado de RESTORE:', { 
      data, 
      error, 
      errorMessage: error?.message
    });
    
    if (error) {
      console.error('❌ Error restaurando notificación:', error);
      return { 
        success: false, 
        message: `Error restaurando: ${error.message}` 
      };
    }
    
    if (!data || data.length === 0) {
      console.error('❌ No se pudo restaurar la notificación');
      return { 
        success: false, 
        message: 'No se pudo restaurar la notificación' 
      };
    }
    
    console.log('✅ Notificación restaurada exitosamente:', data[0]);
    return { 
      success: true, 
      message: 'Notificación restaurada exitosamente' 
    };
    
  } catch (error: any) {
    console.error('❌ Error inesperado restaurando notificación:', error);
    return { 
      success: false, 
      message: `Error inesperado: ${error.message || 'Error desconocido'}` 
    };
  }
};

/**
 * Elimina permanentemente una notificación (hard delete)
 */
export const permanentDeleteNotification = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('🗑️ ELIMINANDO PERMANENTEMENTE NOTIFICACIÓN:', { id, organizationId });
    
    // Verificar que la notificación existe y está archivada
    const { data: existingNotification, error: selectError } = await supabase
      .from('notifications')
      .select('id, organization_id, status')
      .eq('id', id)
      .eq('status', 'deleted')
      .single();
    
    if (selectError) {
      console.error('❌ Error verificando notificación archivada:', selectError);
      return { success: false, message: 'Notificación archivada no encontrada' };
    }
    
    console.log('📋 Notificación archivada encontrada para eliminación permanente:', existingNotification);
    
    // Eliminar físicamente de la base de datos
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    
    console.log('🔍 Resultado de DELETE PERMANENTE:', { 
      error, 
      errorMessage: error?.message
    });
    
    if (error) {
      console.error('❌ Error eliminando permanentemente:', error);
      return { 
        success: false, 
        message: `Error eliminando: ${error.message}` 
      };
    }
    
    console.log('✅ Notificación eliminada permanentemente');
    return { 
      success: true, 
      message: 'Notificación eliminada permanentemente' 
    };
    
  } catch (error: any) {
    console.error('❌ Error inesperado eliminando permanentemente:', error);
    return { 
      success: false, 
      message: `Error inesperado: ${error.message || 'Error desconocido'}` 
    };
  }
};
