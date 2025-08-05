/**
 * Exportaciones de componentes de alertas automáticas
 */

export { default as AlertsManager } from './AlertsManager';
export { default as AlertRulesTable } from './AlertRulesTable';
export { default as SystemAlertsTable } from './SystemAlertsTable';
export { default as AlertRuleForm } from './AlertRuleForm';
export { default as AlertStats } from './AlertStats';

// Re-exportar tipos para conveniencia
export type {
  AlertRule,
  SystemAlert,
  AlertRuleFormData,
  AlertFilter,
  AlertStats as AlertStatsType,
  AlertSeverity,
  AlertStatus,
  SourceModule,
  AlertChannel,
  AlertCondition,
  AlertResponse,
  PaginatedAlertResponse,
  ChannelConfig,
  ModuleConfig,
  ConditionTestResult,
  BulkActionRequest
} from '@/types/alert';
