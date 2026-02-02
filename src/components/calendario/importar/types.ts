export interface ImportableEvent {
  title: string;
  description?: string;
  location?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  color?: string;
  event_type?: string;
  status?: string;
  assigned_to?: string;
  customer_id?: string;
  branch_id?: number;
}

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  isValid: boolean;
}

export interface ColumnMapping {
  csvColumn: string;
  targetField: keyof ImportableEvent | null;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: { row: number; error: string }[];
}

export const TARGET_FIELDS: { value: keyof ImportableEvent; label: string; required: boolean }[] = [
  { value: 'title', label: 'Título', required: true },
  { value: 'description', label: 'Descripción', required: false },
  { value: 'location', label: 'Ubicación', required: false },
  { value: 'start_at', label: 'Fecha/Hora Inicio', required: true },
  { value: 'end_at', label: 'Fecha/Hora Fin', required: true },
  { value: 'all_day', label: 'Todo el día', required: false },
  { value: 'color', label: 'Color', required: false },
  { value: 'event_type', label: 'Tipo de evento', required: false },
  { value: 'status', label: 'Estado', required: false },
];

export const EVENT_TYPES = [
  { value: 'meeting', label: 'Reunión' },
  { value: 'appointment', label: 'Cita' },
  { value: 'task', label: 'Tarea' },
  { value: 'reminder', label: 'Recordatorio' },
  { value: 'other', label: 'Otro' },
];

export const EVENT_COLORS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#10B981', label: 'Verde' },
  { value: '#F59E0B', label: 'Naranja' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#8B5CF6', label: 'Púrpura' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#6B7280', label: 'Gris' },
];

export type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';
