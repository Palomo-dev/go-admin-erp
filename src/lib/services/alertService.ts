/**
 * Servicio para la gestión de alertas automáticas
 * Maneja las operaciones CRUD para alert_rules y system_alerts
 */

import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '../hooks/useOrganization';
import type {
  AlertRule,
  SystemAlert,
  AlertRuleFormData,
  AlertFilter,
  AlertStats,
  AlertResponse,
  PaginatedAlertResponse,
  ConditionTestResult,
  BulkActionRequest,
  AlertSeverity,
  AlertStatus,
  SourceModule
} from '@/types/alert';

// ========================
// SERVICIOS DE ALERT RULES
// ========================

/**
 * Obtiene todas las reglas de alerta de la organización
 */
export async function getAlertRules(): Promise<AlertResponse<AlertRule[]>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    const { data, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('organization_id', organizacion.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener reglas de alerta:', error);
      return {
        data: [],
        success: false,
        error: 'Error al obtener las reglas de alerta'
      };
    }

    return {
      data: data || [],
      success: true
    };
  } catch (error) {
    console.error('Error en getAlertRules:', error);
    return {
      data: [],
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

/**
 * Crea una nueva regla de alerta
 */
export async function createAlertRule(formData: AlertRuleFormData): Promise<AlertResponse<AlertRule>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    const { data, error } = await supabase
      .from('alert_rules')
      .insert([{
        organization_id: organizacion.id,
        ...formData
      }])
      .select()
      .single();

    if (error) {
      console.error('Error al crear regla de alerta:', error);
      return {
        data: {} as AlertRule,
        success: false,
        error: 'Error al crear la regla de alerta'
      };
    }

    return {
      data,
      success: true,
      message: 'Regla de alerta creada exitosamente'
    };
  } catch (error) {
    console.error('Error en createAlertRule:', error);
    return {
      data: {} as AlertRule,
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

/**
 * Actualiza una regla de alerta existente
 */
export async function updateAlertRule(id: string, formData: Partial<AlertRuleFormData>): Promise<AlertResponse<AlertRule>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    const { data, error } = await supabase
      .from('alert_rules')
      .update({
        ...formData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizacion.id)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar regla de alerta:', error);
      return {
        data: {} as AlertRule,
        success: false,
        error: 'Error al actualizar la regla de alerta'
      };
    }

    return {
      data,
      success: true,
      message: 'Regla de alerta actualizada exitosamente'
    };
  } catch (error) {
    console.error('Error en updateAlertRule:', error);
    return {
      data: {} as AlertRule,
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

/**
 * Elimina una regla de alerta
 */
export async function deleteAlertRule(id: string): Promise<AlertResponse<boolean>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    const { error } = await supabase
      .from('alert_rules')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizacion.id);

    if (error) {
      console.error('Error al eliminar regla de alerta:', error);
      return {
        data: false,
        success: false,
        error: 'Error al eliminar la regla de alerta'
      };
    }

    return {
      data: true,
      success: true,
      message: 'Regla de alerta eliminada exitosamente'
    };
  } catch (error) {
    console.error('Error en deleteAlertRule:', error);
    return {
      data: false,
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

/**
 * Activa o desactiva una regla de alerta
 */
export async function toggleAlertRule(id: string, active: boolean): Promise<AlertResponse<AlertRule>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    const { data, error } = await supabase
      .from('alert_rules')
      .update({
        active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizacion.id)
      .select()
      .single();

    if (error) {
      console.error('Error al cambiar estado de regla:', error);
      return {
        data: {} as AlertRule,
        success: false,
        error: 'Error al cambiar el estado de la regla'
      };
    }

    return {
      data,
      success: true,
      message: `Regla ${active ? 'activada' : 'desactivada'} exitosamente`
    };
  } catch (error) {
    console.error('Error en toggleAlertRule:', error);
    return {
      data: {} as AlertRule,
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

// ========================
// SERVICIOS DE SYSTEM ALERTS
// ========================

/**
 * Obtiene alertas del sistema con filtros y paginación
 */
export async function getSystemAlerts(filters: AlertFilter = {}): Promise<PaginatedAlertResponse<SystemAlert>> {
  try {
    const organizacion = obtenerOrganizacionActiva();
    const { limit = 20, offset = 0, status, severity, source_module, search, date_from, date_to } = filters;

    let query = supabase
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizacion.id);

    // Aplicar filtros
    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (severity && severity.length > 0) {
      query = query.in('severity', severity);
    }

    if (source_module && source_module.length > 0) {
      query = query.in('source_module', source_module);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    // Paginación y orden
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error al obtener alertas del sistema:', error);
      return {
        data: [],
        total: 0,
        page: Math.floor(offset / limit) + 1,
        limit,
        totalPages: 0
      };
    }

    return {
      data: data || [],
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    };
  } catch (error) {
    console.error('Error en getSystemAlerts:', error);
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0
    };
  }
}

/**
 * Resuelve una alerta del sistema
 */
export async function resolveSystemAlert(id: string, resolvedBy: string, reason?: string): Promise<AlertResponse<SystemAlert>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    const { data, error } = await supabase
      .from('system_alerts')
      .update({
        status: 'resolved',
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
        metadata: { 
          ...{},
          resolution_reason: reason 
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizacion.id)
      .select()
      .single();

    if (error) {
      console.error('Error al resolver alerta:', error);
      return {
        data: {} as SystemAlert,
        success: false,
        error: 'Error al resolver la alerta'
      };
    }

    return {
      data,
      success: true,
      message: 'Alerta resuelta exitosamente'
    };
  } catch (error) {
    console.error('Error en resolveSystemAlert:', error);
    return {
      data: {} as SystemAlert,
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

/**
 * Operaciones masivas en alertas
 */
export async function bulkActionAlerts(request: BulkActionRequest): Promise<AlertResponse<boolean>> {
  try {
    const organizacion = obtenerOrganizacionActiva();
    const { alert_ids, action, reason } = request;

    let updateData: any = {
      updated_at: new Date().toISOString()
    };

    switch (action) {
      case 'resolve':
        updateData.status = 'resolved';
        updateData.resolved_at = new Date().toISOString();
        if (reason) {
          updateData.metadata = { resolution_reason: reason };
        }
        break;
      case 'dismiss':
        updateData.status = 'dismissed';
        break;
      case 'reactivate':
        updateData.status = 'active';
        updateData.resolved_by = null;
        updateData.resolved_at = null;
        break;
      case 'delete':
        const { error: deleteError } = await supabase
          .from('system_alerts')
          .delete()
          .in('id', alert_ids)
          .eq('organization_id', organizacion.id);

        if (deleteError) {
          console.error('Error en eliminación masiva:', deleteError);
          return {
            data: false,
            success: false,
            error: 'Error al eliminar las alertas'
          };
        }

        return {
          data: true,
          success: true,
          message: `${alert_ids.length} alertas eliminadas exitosamente`
        };
      default:
        return {
          data: false,
          success: false,
          error: 'Acción no válida'
        };
    }

    const { error } = await supabase
      .from('system_alerts')
      .update(updateData)
      .in('id', alert_ids)
      .eq('organization_id', organizacion.id);

    if (error) {
      console.error('Error en acción masiva:', error);
      return {
        data: false,
        success: false,
        error: 'Error al procesar la acción masiva'
      };
    }

    return {
      data: true,
      success: true,
      message: `${alert_ids.length} alertas procesadas exitosamente`
    };
  } catch (error) {
    console.error('Error en bulkActionAlerts:', error);
    return {
      data: false,
      success: false,
      error: 'Error interno del servidor'
    };
  }
}

// ========================
// SERVICIOS DE ESTADÍSTICAS
// ========================

/**
 * Obtiene estadísticas de alertas
 */
export async function getAlertStats(): Promise<AlertResponse<AlertStats>> {
  try {
    const organizacion = obtenerOrganizacionActiva();

    // Obtener estadísticas de reglas
    const { data: rulesData } = await supabase
      .from('alert_rules')
      .select('active')
      .eq('organization_id', organizacion.id);

    // Obtener estadísticas de alertas
    const { data: alertsData } = await supabase
      .from('system_alerts')
      .select('status, severity, source_module, created_at')
      .eq('organization_id', organizacion.id);

    // Obtener alertas recientes
    const { data: recentData } = await supabase
      .from('system_alerts')
      .select(`
        *,
        alert_rules:rule_id (
          id,
          name
        )
      `)
      .eq('organization_id', organizacion.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const stats: AlertStats = {
      total_rules: rulesData?.length || 0,
      active_rules: rulesData?.filter(r => r.active).length || 0,
      inactive_rules: rulesData?.filter(r => !r.active).length || 0,
      total_alerts: alertsData?.length || 0,
      pending_alerts: alertsData?.filter(a => a.status === 'pending').length || 0,
      delivered_alerts: alertsData?.filter(a => a.status === 'delivered').length || 0,
      read_alerts: alertsData?.filter(a => a.status === 'read').length || 0,
      resolved_alerts: alertsData?.filter(a => a.status === 'resolved').length || 0,
      ignored_alerts: alertsData?.filter(a => a.status === 'ignored').length || 0,
      by_severity: {
        info: alertsData?.filter(a => a.severity === 'info').length || 0,
        warning: alertsData?.filter(a => a.severity === 'warning').length || 0,
        critical: alertsData?.filter(a => a.severity === 'critical').length || 0,
      },
      by_module: {
        sistema: alertsData?.filter(a => a.source_module === 'sistema').length || 0,
        ventas: alertsData?.filter(a => a.source_module === 'ventas').length || 0,
        inventario: alertsData?.filter(a => a.source_module === 'inventario').length || 0,
        pms: alertsData?.filter(a => a.source_module === 'pms').length || 0,
        rrhh: alertsData?.filter(a => a.source_module === 'rrhh').length || 0,
        crm: alertsData?.filter(a => a.source_module === 'crm').length || 0,
        finanzas: alertsData?.filter(a => a.source_module === 'finanzas').length || 0,
        transporte: alertsData?.filter(a => a.source_module === 'transporte').length || 0,
      },
      recent_alerts: recentData || []
    };

    return {
      data: stats,
      success: true
    };
  } catch (error) {
    console.error('Error en getAlertStats:', error);
    return {
      data: {} as AlertStats,
      success: false,
      error: 'Error al obtener estadísticas'
    };
  }
}

/**
 * Prueba una condición SQL antes de guardar la regla
 */
export async function testAlertCondition(sql_condition: string): Promise<ConditionTestResult> {
  try {
    // Nota: Esta función requiere permisos especiales en Supabase
    // Por seguridad, se podría implementar como una función de base de datos
    
    // Por ahora, validamos la sintaxis básica
    if (!sql_condition.trim()) {
      return {
        valid: false,
        message: 'La condición SQL no puede estar vacía'
      };
    }

    // Validaciones básicas de seguridad
    const dangerousPatterns = [
      /DROP\s+/i,
      /DELETE\s+/i,
      /UPDATE\s+/i,
      /INSERT\s+/i,
      /CREATE\s+/i,
      /ALTER\s+/i,
      /TRUNCATE\s+/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql_condition)) {
        return {
          valid: false,
          message: 'La condición contiene comandos SQL no permitidos'
        };
      }
    }

    return {
      valid: true,
      message: 'Condición SQL válida'
    };
  } catch (error) {
    console.error('Error en testAlertCondition:', error);
    return {
      valid: false,
      message: 'Error al validar la condición SQL'
    };
  }
}

export default {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  toggleAlertRule,
  getSystemAlerts,
  resolveSystemAlert,
  bulkActionAlerts,
  getAlertStats,
  testAlertCondition
};
