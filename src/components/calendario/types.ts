export type CalendarViewType = 'month' | 'week' | 'day' | 'agenda';

export type AgendaQuickFilter = 'all' | 'mine' | 'today' | 'week' | 'pending' | 'cancelled';

export type EventSourceType = 
  | 'calendar_event'
  | 'task'
  | 'shift'
  | 'leave'
  | 'reservation'
  | 'housekeeping'
  | 'maintenance'
  | 'gym_class'
  | 'trip';

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled' | 'pending' | 'completed';

export interface CalendarEvent {
  id?: string;
  source_type: EventSourceType;
  source_id: string;
  /** Getter para obtener el ID efectivo del evento (usa source_id como fallback) */
  organization_id: number;
  branch_id: number | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  status: EventStatus | null;
  color: string;
  recurrence_rule: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CalendarFilters {
  dateRange: { from: Date; to: Date };
  branchId: number | null;
  assignedTo: string | null;
  status: EventStatus | 'all';
  sourceTypes: EventSourceType[];
}

export interface CalendarSettings {
  defaultView: CalendarViewType;
  weekStartsOn: 0 | 1; // 0 = Domingo, 1 = Lunes
  showWeekends: boolean;
  workingHoursStart: number;
  workingHoursEnd: number;
}

export const SOURCE_TYPE_LABELS: Record<EventSourceType, string> = {
  calendar_event: 'Evento Manual',
  task: 'Tarea (CRM)',
  shift: 'Turno (HRM)',
  leave: 'Permiso (HRM)',
  reservation: 'Reserva (PMS)',
  housekeeping: 'Limpieza (PMS)',
  maintenance: 'Mantenimiento (PMS)',
  gym_class: 'Clase (Gym)',
  trip: 'Viaje (Transporte)',
};

export const SOURCE_TYPE_COLORS: Record<EventSourceType, string> = {
  calendar_event: '#3B82F6', // blue-500
  task: '#F59E0B',          // amber-500
  shift: '#8B5CF6',          // violet-500
  leave: '#F97316',          // orange-500
  reservation: '#10B981',    // emerald-500
  housekeeping: '#06B6D4',   // cyan-500
  maintenance: '#EF4444',    // red-500
  gym_class: '#EC4899',      // pink-500
  trip: '#0EA5E9',           // sky-500
};

export const SOURCE_TYPE_ICONS: Record<EventSourceType, string> = {
  calendar_event: 'CalendarDays',
  task: 'CheckSquare',
  shift: 'Clock',
  leave: 'Palmtree',
  reservation: 'BedDouble',
  housekeeping: 'Sparkles',
  maintenance: 'Wrench',
  gym_class: 'Dumbbell',
  trip: 'Truck',
};

export const ALL_SOURCE_TYPES: EventSourceType[] = [
  'calendar_event',
  'task',
  'shift',
  'leave',
  'reservation',
  'housekeeping',
  'maintenance',
  'gym_class',
  'trip',
];
