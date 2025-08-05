/**
 * Tipos para el sistema de alertas automáticas
 * Basado en las tablas 'alert_rules' y 'system_alerts' de Supabase
 */

// ========================
// TIPOS BASE
// ========================

/**
 * Severidad de las alertas
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Estado de las alertas del sistema
 */
export type AlertStatus = 'pending' | 'delivered' | 'read' | 'resolved' | 'ignored';

/**
 * Módulos del sistema que pueden generar alertas
 */
export type SourceModule = 'sistema' | 'ventas' | 'inventario' | 'pms' | 'rrhh' | 'crm' | 'finanzas' | 'transporte';

/**
 * Canales de notificación disponibles para alertas
 */
export type AlertChannel = 'email' | 'sms' | 'push' | 'whatsapp' | 'webhook';

/**
 * Operadores para condiciones SQL
 */
export type ConditionOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';

// ========================
// INTERFACES PRINCIPALES
// ========================

/**
 * Interface para la tabla 'alert_rules'
 * Reglas de alerta que definen las condiciones y acciones
 */
export interface AlertRule {
  id: string;
  organization_id: number;
  name: string;
  description?: string;
  source_module: SourceModule;
  sql_condition: string;
  channels: AlertChannel[];
  severity: AlertSeverity;
  active: boolean;
  created_at: string;
  updated_at: string;
  
  // Campos opcionales para la UI
  trigger_count?: number;
  last_triggered?: string;
}

/**
 * Interface para la tabla 'system_alerts'
 * Alertas activas generadas por las reglas
 */
export interface SystemAlert {
  id: string;
  organization_id: number;
  rule_id?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  source_module: SourceModule;
  source_id?: string;
  metadata?: Record<string, any>;
  status: AlertStatus;
  resolved_by?: string;
  resolved_at?: string;
  sent_channels?: AlertChannel[];
  created_at: string;
  updated_at: string;
  
  // Campos enriquecidos para la UI
  rule?: AlertRule;
  resolved_by_user?: {
    id: string;
    name?: string;
    email?: string;
  };
}

/**
 * Interface para crear/editar reglas de alerta
 */
export interface AlertRuleFormData {
  name: string;
  description?: string;
  source_module: SourceModule;
  sql_condition: string;
  channels: AlertChannel[];
  severity: AlertSeverity;
  active: boolean;
}

/**
 * Interface para condiciones de alerta simplificadas
 */
export interface AlertCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean;
  table_name: string;
}

/**
 * Interface para filtros de alertas
 */
export interface AlertFilter {
  status?: AlertStatus[];
  severity?: AlertSeverity[];
  source_module?: SourceModule[];
  rule_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Interface para estadísticas de alertas
 */
export interface AlertStats {
  total_rules: number;
  active_rules: number;
  inactive_rules: number;
  total_alerts: number;
  pending_alerts: number;
  delivered_alerts: number;
  read_alerts: number;
  resolved_alerts: number;
  ignored_alerts: number;
  by_severity: {
    info: number;
    warning: number;
    critical: number;
  };
  by_module: Record<SourceModule, number>;
  recent_alerts: SystemAlert[];
}

/**
 * Interface para respuesta de servicio
 */
export interface AlertResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Interface para respuesta paginada
 */
export interface PaginatedAlertResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Interface para configuración de canales
 */
export interface ChannelConfig {
  [key: string]: {
    label: string;
    icon: string;
    description: string;
    enabled: boolean;
    config?: Record<string, any>;
  };
}

/**
 * Interface para configuración de módulos
 */
export interface ModuleConfig {
  [key: string]: {
    label: string;
    icon: string;
    color: string;
    tables: string[];
    common_conditions: AlertCondition[];
  };
}

/**
 * Interface para testing de condiciones
 */
export interface ConditionTestResult {
  valid: boolean;
  message: string;
  preview_results?: any[];
  sql_error?: string;
}

/**
 * Interface para acciones masivas
 */
export interface BulkActionRequest {
  alert_ids: string[];
  action: 'resolve' | 'dismiss' | 'reactivate' | 'delete';
  reason?: string;
}


