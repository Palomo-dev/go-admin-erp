// ── Tipos para Centro de Alertas ─────────────────────

export interface SystemAlert {
  id: string;
  organization_id: number;
  rule_id: string | null;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  source_module: string;
  source_id: string | null;
  metadata: Record<string, any> | null;
  status: 'pending' | 'delivered' | 'read' | 'resolved' | 'ignored';
  resolved_by: string | null;
  resolved_at: string | null;
  sent_channels: string[] | null;
  created_at: string;
  updated_at: string;
  // join opcional
  resolver_profile?: { first_name: string | null; last_name: string | null; email: string } | null;
}

export interface AlertRule {
  id: string;
  organization_id: number;
  name: string;
  source_module: string;
  sql_condition: string;
  channels: string[];
  severity: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertFilters {
  severity: string;
  status: string;
  source_module: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export const DEFAULT_ALERT_FILTERS: AlertFilters = {
  severity: 'all',
  status: 'all',
  source_module: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
};

export interface AlertStats {
  total: number;
  pending: number;
  critical: number;
  resolved: number;
}

export interface CreateAlertPayload {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  source_module: string;
  target_type: 'all' | 'specific';
  target_user_ids?: string[];
}
