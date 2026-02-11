// ── Tipos para Gestor de Reglas de Alerta ────────────

export interface AlertRule {
  id: string;
  organization_id: number;
  name: string;
  source_module: string;
  sql_condition: string;
  channels: string[];
  severity: 'info' | 'warning' | 'critical';
  active: boolean;
  created_at: string;
  updated_at: string;
  fire_count?: number;
  last_fired_at?: string | null;
}

export interface RuleFormData {
  name: string;
  source_module: string;
  sql_condition: string;
  channels: string[];
  severity: 'info' | 'warning' | 'critical';
  active: boolean;
}

export interface RuleFilters {
  severity: string;
  status: string;
  source_module: string;
  search: string;
}

export const DEFAULT_RULE_FILTERS: RuleFilters = {
  severity: 'all',
  status: 'all',
  source_module: 'all',
  search: '',
};

export interface RuleStats {
  total: number;
  active: number;
  inactive: number;
  critical: number;
}

export interface RuleAlert {
  id: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  source_module: string;
  created_at: string;
}

export const SOURCE_MODULES = [
  { value: 'inventario', label: 'Inventario' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'pos', label: 'POS' },
  { value: 'crm', label: 'CRM' },
  { value: 'hrm', label: 'HRM' },
  { value: 'pms', label: 'PMS' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'calendario', label: 'Calendario' },
] as const;

export const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'warning', label: 'Warning', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'critical', label: 'Crítica', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
] as const;

export const CHANNEL_OPTIONS = [
  { value: 'app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'webhook', label: 'Webhook' },
] as const;

export const INDUSTRY_PRESETS: Record<string, RuleFormData[]> = {
  retail: [
    { name: 'Stock Bajo', source_module: 'inventario', sql_condition: "SELECT COUNT(*) FROM products WHERE stock_quantity <= minimum_stock AND active = true", channels: ['email', 'push'], severity: 'warning', active: true },
    { name: 'Productos Agotados', source_module: 'inventario', sql_condition: "SELECT COUNT(*) FROM products WHERE stock_quantity = 0 AND active = true", channels: ['email', 'push', 'sms'], severity: 'critical', active: true },
    { name: 'Caja sin cerrar +8h', source_module: 'pos', sql_condition: "SELECT COUNT(*) FROM cash_sessions WHERE status = 'open' AND opened_at < NOW() - INTERVAL '8 hours'", channels: ['email', 'push'], severity: 'warning', active: true },
  ],
  hotel: [
    { name: 'Overbooking detectado', source_module: 'pms', sql_condition: "SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' GROUP BY room_id, check_in HAVING COUNT(*) > 1", channels: ['email', 'push'], severity: 'critical', active: true },
    { name: 'No-show del día', source_module: 'pms', sql_condition: "SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' AND check_in = CURRENT_DATE AND CURRENT_TIME > '18:00'", channels: ['email'], severity: 'warning', active: true },
    { name: 'Housekeeping pendiente', source_module: 'pms', sql_condition: "SELECT COUNT(*) FROM housekeeping_tasks WHERE status = 'pending' AND scheduled_date = CURRENT_DATE", channels: ['push'], severity: 'info', active: true },
  ],
  gym: [
    { name: 'Membresías por vencer (7 días)', source_module: 'crm', sql_condition: "SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND current_period_end <= NOW() + INTERVAL '7 days'", channels: ['email', 'whatsapp'], severity: 'warning', active: true },
    { name: 'Pagos fallidos', source_module: 'finanzas', sql_condition: "SELECT COUNT(*) FROM payments WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'", channels: ['email', 'sms'], severity: 'critical', active: true },
  ],
};
