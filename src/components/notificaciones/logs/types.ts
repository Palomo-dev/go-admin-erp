// ── Tipos para Delivery Logs (Auditoría de Envíos) ───

export interface DeliveryLog {
  id: string;
  notification_id: string;
  attempt_no: number;
  provider_response: Record<string, any> | null;
  delivered_at: string;
  status: string;
  created_at: string;
  // join desde notifications
  notification?: {
    channel: string;
    status: string;
    payload: Record<string, any>;
    recipient_email: string | null;
    recipient_phone: string | null;
    template_id: string | null;
    created_at: string;
  } | null;
}

export interface LogFilters {
  status: string;
  provider: string;
  channel: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export const DEFAULT_LOG_FILTERS: LogFilters = {
  status: 'all',
  provider: 'all',
  channel: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
};

export interface LogStats {
  total: number;
  success: number;
  failed: number;
  pending: number;
}

export const STATUS_OPTIONS = [
  { value: 'success', label: 'Exitoso', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { value: 'fail', label: 'Fallido', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  { value: 'pending', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { value: 'bounced', label: 'Rebotado', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
] as const;

export const PAGE_SIZE = 25;
