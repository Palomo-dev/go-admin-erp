/**
 * Servicio de Automatización de Alertas
 * Evalúa las reglas activas y genera alertas automáticamente
 * SCRUM-1220: Implementar creación automática según condiciones y umbrales
 */

import { supabase } from '@/lib/supabase/config';
import Logger from '../utils/logger';
import type { AlertRule, SystemAlert } from '@/types/alert';

interface EvaluationResult {
  rule_id: string;
  rule_name: string;
  count: number;
  should_alert: boolean;
  metadata?: Record<string, any>;
}

interface AutomationResult {
  rules_evaluated: number;
  alerts_generated: number;
  errors: string[];
  execution_time: number;
}

/**
 * Evalúa una regla de alerta específica
 */
async function evaluateAlertRule(rule: AlertRule, organizationId: number): Promise<EvaluationResult> {
  try {
    Logger.info('ALERT_AUTOMATION', `🔍 Evaluando regla: ${rule.name}`);
    
    // Reemplazar parámetros en la consulta SQL
    let sqlQuery = rule.sql_condition;
    if (sqlQuery.includes('$1')) {
      sqlQuery = sqlQuery.replace(/\$1/g, organizationId.toString());
    }
    
    Logger.debug('ALERT_AUTOMATION', `📝 SQL Query: ${sqlQuery}`);
    
    // Ejecutar la consulta SQL
    const { data, error } = await supabase.rpc('execute_alert_condition', {
      query_sql: sqlQuery,
      org_id: organizationId
    });
    
    if (error) {
      Logger.error('ALERT_AUTOMATION', `❌ Error ejecutando consulta para regla ${rule.name}:`, error);
      throw error;
    }
    
    const count = data?.[0]?.count || 0;
    const shouldAlert = count > 0;
    
    Logger.info('ALERT_AUTOMATION', `📊 Regla ${rule.name}: ${count} elementos encontrados`);
    
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      count,
      should_alert: shouldAlert,
      metadata: {
        sql_query: sqlQuery,
        execution_time: new Date().toISOString(),
        count_result: count
      }
    };
    
  } catch (error) {
    Logger.error('ALERT_AUTOMATION', `💥 Error evaluando regla ${rule.name}:`, error);
    throw error;
  }
}

/**
 * Genera una alerta automática basada en el resultado de evaluación
 */
async function generateSystemAlert(
  result: EvaluationResult, 
  rule: AlertRule, 
  organizationId: number
): Promise<string | null> {
  try {
    if (!result.should_alert) {
      return null;
    }
    
    // Verificar si ya existe una alerta reciente para esta regla
    const { data: existingAlerts } = await supabase
      .from('system_alerts')
      .select('id, created_at')
      .eq('rule_id', rule.id)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Última hora
      .limit(1);
    
    if (existingAlerts && existingAlerts.length > 0) {
      Logger.info('ALERT_AUTOMATION', `⏭️ Alerta reciente ya existe para regla: ${rule.name}`);
      return null;
    }
    
    // Generar título y mensaje específicos según el módulo
    const { title, message } = generateAlertContent(rule, result.count);
    
    // Crear la alerta en system_alerts
    const alertData = {
      organization_id: organizationId,
      rule_id: rule.id,
      title,
      message,
      severity: rule.severity,
      source_module: rule.source_module,
      source_id: `auto-${rule.id}-${Date.now()}`,
      metadata: {
        ...result.metadata,
        auto_generated: true,
        rule_name: rule.name,
        trigger_count: result.count,
        channels_configured: rule.channels
      },
      status: 'pending',
      sent_channels: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: newAlert, error } = await supabase
      .from('system_alerts')
      .insert([alertData])
      .select('id')
      .single();
    
    if (error) {
      Logger.error('ALERT_AUTOMATION', `❌ Error creando alerta:`, error);
      throw error;
    }
    
    Logger.info('ALERT_AUTOMATION', `✅ Alerta generada: ${title} (ID: ${newAlert.id})`);
    return newAlert.id;
    
  } catch (error) {
    Logger.error('ALERT_AUTOMATION', `💥 Error generando alerta:`, error);
    throw error;
  }
}

/**
 * Genera contenido específico para la alerta según el módulo y regla
 */
function generateAlertContent(rule: AlertRule, count: number): { title: string; message: string } {
  const moduleMessages = {
    inventario: {
      'Stock Bajo en Productos': {
        title: `⚠️ Stock Bajo: ${count} producto${count > 1 ? 's' : ''}`,
        message: `Se detectaron ${count} producto${count > 1 ? 's' : ''} con stock por debajo del mínimo requerido. Revisa el inventario para evitar desabastecimiento.`
      },
      'Productos Agotados': {
        title: `🚨 Productos Agotados: ${count} producto${count > 1 ? 's' : ''}`,
        message: `¡CRÍTICO! ${count} producto${count > 1 ? 's están' : ' está'} completamente agotado${count > 1 ? 's' : ''}. Requiere atención inmediata.`
      },
      'Stock Crítico': {
        title: `🔴 Stock Crítico: ${count} producto${count > 1 ? 's' : ''}`,
        message: `${count} producto${count > 1 ? 's tienen' : ' tiene'} menos de 5 unidades en stock. Stock crítico detectado.`
      }
    },
    finanzas: {
      'Facturas Vencidas': {
        title: `💰 Facturas Vencidas: ${count} factura${count > 1 ? 's' : ''}`,
        message: `Se detectaron ${count} factura${count > 1 ? 's' : ''} vencida${count > 1 ? 's' : ''} que requieren seguimiento para cobro.`
      }
    },
    crm: {
      'Tareas Vencidas': {
        title: `📅 Tareas Vencidas: ${count} tarea${count > 1 ? 's' : ''}`,
        message: `${count} tarea${count > 1 ? 's han' : ' ha'} vencido y permanece${count > 1 ? 'n' : ''} sin completar. Revisa las asignaciones pendientes.`
      },
      'Tareas Vencidas CRM': {
        title: `📋 CRM - Tareas Vencidas: ${count} tarea${count > 1 ? 's' : ''}`,
        message: `${count} tarea${count > 1 ? 's del' : ' de'} CRM ${count > 1 ? 'han vencido' : 'ha vencido'} y necesitan atención inmediata.`
      }
    },
    sistema: {
      'Usuarios Inactivos': {
        title: `👥 Usuarios Inactivos: ${count} usuario${count > 1 ? 's' : ''}`,
        message: `Se detectaron ${count} usuario${count > 1 ? 's' : ''} inactivo${count > 1 ? 's' : ''} por más de 30 días. Considera revisar los accesos.`
      }
    }
  };
  
  const moduleContent = moduleMessages[rule.source_module as keyof typeof moduleMessages];
  const ruleContent = moduleContent?.[rule.name as keyof typeof moduleContent];
  
  if (ruleContent) {
    return ruleContent;
  }
  
  // Contenido genérico si no hay específico
  return {
    title: `🚨 ${rule.name}: ${count} elemento${count > 1 ? 's' : ''}`,
    message: `La regla "${rule.name}" ha detectado ${count} elemento${count > 1 ? 's' : ''} que requieren atención según los criterios configurados.`
  };
}

/**
 * Ejecuta la evaluación automática de todas las reglas activas
 */
export async function runAlertAutomation(organizationId: number): Promise<AutomationResult> {
  const startTime = Date.now();
  let rulesEvaluated = 0;
  let alertsGenerated = 0;
  const errors: string[] = [];
  
  try {
    Logger.info('ALERT_AUTOMATION', `🚀 Iniciando evaluación automática de alertas para organización ${organizationId}`);
    
    // Obtener todas las reglas activas
    const { data: activeRules, error: rulesError } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('active', true);
    
    if (rulesError) {
      throw new Error(`Error obteniendo reglas activas: ${rulesError.message}`);
    }
    
    if (!activeRules || activeRules.length === 0) {
      Logger.info('ALERT_AUTOMATION', '📝 No hay reglas activas para evaluar');
      return {
        rules_evaluated: 0,
        alerts_generated: 0,
        errors: [],
        execution_time: Date.now() - startTime
      };
    }
    
    Logger.info('ALERT_AUTOMATION', `📊 Evaluando ${activeRules.length} reglas activas`);
    
    // Evaluar cada regla
    for (const rule of activeRules) {
      try {
        rulesEvaluated++;
        
        const result = await evaluateAlertRule(rule, organizationId);
        
        if (result.should_alert) {
          const alertId = await generateSystemAlert(result, rule, organizationId);
          if (alertId) {
            alertsGenerated++;
          }
        }
        
      } catch (error) {
        const errorMsg = `Error procesando regla ${rule.name}: ${error}`;
        Logger.error('ALERT_AUTOMATION', errorMsg);
        errors.push(errorMsg);
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    Logger.info('ALERT_AUTOMATION', `✅ Evaluación automática completada:`);
    Logger.info('ALERT_AUTOMATION', `   📊 Reglas evaluadas: ${rulesEvaluated}`);
    Logger.info('ALERT_AUTOMATION', `   🚨 Alertas generadas: ${alertsGenerated}`);
    Logger.info('ALERT_AUTOMATION', `   ⏱️ Tiempo de ejecución: ${executionTime}ms`);
    Logger.info('ALERT_AUTOMATION', `   ❌ Errores: ${errors.length}`);
    
    return {
      rules_evaluated: rulesEvaluated,
      alerts_generated: alertsGenerated,
      errors,
      execution_time: executionTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMsg = `Error general en automatización: ${error}`;
    Logger.error('ALERT_AUTOMATION', errorMsg);
    
    return {
      rules_evaluated: rulesEvaluated,
      alerts_generated: alertsGenerated,
      errors: [errorMsg, ...errors],
      execution_time: executionTime
    };
  }
}

/**
 * Ejecuta la automatización para todas las organizaciones activas
 */
export async function runGlobalAlertAutomation(): Promise<Record<number, AutomationResult>> {
  try {
    Logger.info('ALERT_AUTOMATION', '🌍 Iniciando evaluación global de alertas');
    
    // Obtener todas las organizaciones activas
    const { data: orgs, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('active', true);
    
    if (error || !orgs) {
      throw new Error(`Error obteniendo organizaciones: ${error?.message}`);
    }
    
    const results: Record<number, AutomationResult> = {};
    
    // Ejecutar automatización para cada organización
    for (const org of orgs) {
      try {
        results[org.id] = await runAlertAutomation(org.id);
      } catch (error) {
        Logger.error('ALERT_AUTOMATION', `Error procesando organización ${org.id}:`, error);
        results[org.id] = {
          rules_evaluated: 0,
          alerts_generated: 0,
          errors: [`Error procesando organización: ${error}`],
          execution_time: 0
        };
      }
    }
    
    Logger.info('ALERT_AUTOMATION', `✅ Evaluación global completada para ${orgs.length} organizaciones`);
    return results;
    
  } catch (error) {
    Logger.error('ALERT_AUTOMATION', '💥 Error en evaluación global:', error);
    throw error;
  }
}

/**
 * Función para testing manual - ejecuta inmediatamente la automatización
 */
export async function testAlertAutomation(organizationId: number = 2): Promise<AutomationResult> {
  Logger.info('ALERT_AUTOMATION', '🧪 MODO TESTING - Ejecutando automatización manual');
  return await runAlertAutomation(organizationId);
}
