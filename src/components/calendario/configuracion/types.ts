export type CalendarViewType = 'day' | 'week' | 'month' | 'agenda';
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo, 1 = Lunes, etc.

export interface WorkingHours {
  start: string; // "08:00"
  end: string;   // "18:00"
}

export interface SourceTypeColor {
  calendar_event: string;
  task: string;
  shift: string;
  permit: string;
  reservation: string;
}

export interface CalendarSettings {
  // Vista
  defaultView: CalendarViewType;
  weekStartDay: WeekStartDay;
  
  // Horario laboral
  workingHours: WorkingHours;
  showWeekends: boolean;
  
  // Módulos visibles por defecto
  visibleSourceTypes: string[];
  
  // Colores por tipo de fuente
  sourceTypeColors: SourceTypeColor;
  
  // Zona horaria
  timezone: string;
  
  // Opciones de visualización
  showEventTime: boolean;
  showEventLocation: boolean;
  compactMode: boolean;
  
  // Notificaciones
  defaultReminder: number; // minutos antes del evento
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  defaultView: 'week',
  weekStartDay: 1, // Lunes
  workingHours: {
    start: '08:00',
    end: '18:00',
  },
  showWeekends: true,
  visibleSourceTypes: ['calendar_event', 'task', 'shift', 'permit', 'reservation'],
  sourceTypeColors: {
    calendar_event: '#3B82F6', // Azul
    task: '#F59E0B',          // Naranja
    shift: '#10B981',         // Verde
    permit: '#8B5CF6',        // Púrpura
    reservation: '#EC4899',   // Rosa
  },
  timezone: 'America/Bogota',
  showEventTime: true,
  showEventLocation: true,
  compactMode: false,
  defaultReminder: 15,
};

export const VIEW_OPTIONS: { value: CalendarViewType; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'agenda', label: 'Agenda' },
];

export const WEEK_START_OPTIONS: { value: WeekStartDay; label: string }[] = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 6, label: 'Sábado' },
];

export const SOURCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'calendar_event', label: 'Eventos' },
  { value: 'task', label: 'Tareas' },
  { value: 'shift', label: 'Turnos' },
  { value: 'permit', label: 'Permisos' },
  { value: 'reservation', label: 'Reservas' },
];

export const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sin recordatorio' },
  { value: 5, label: '5 minutos antes' },
  { value: 10, label: '10 minutos antes' },
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 día antes' },
];

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'America/Lima', label: 'Lima (GMT-5)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
  { value: 'America/New_York', label: 'Nueva York (GMT-5)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
];
