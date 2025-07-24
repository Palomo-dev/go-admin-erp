/**
 * Tipos y interfaces para el sistema de actividades CRM
 */

// Tipos de actividad disponibles
export enum ActivityType {
  SYSTEM = 'system',
  CALL = 'call',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  VISIT = 'visit',
  NOTE = 'note'
}

// Tipos de entidades relacionadas
export enum RelatedType {
  CUSTOMER = 'customer',
  OPPORTUNITY = 'opportunity',
  TASK = 'task',
  LEAD = 'lead'
}

// Estructura de adjuntos
export interface ActivityAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

// Estructura de enlaces
export interface ActivityLink {
  id: string;
  title: string;
  url: string;
  description?: string;
}

// Metadata de la actividad
export interface ActivityMetadata {
  // Campos existentes
  attachments?: ActivityAttachment[];
  links?: ActivityLink[];
  duration?: number; // en minutos
  phone_number?: string;
  email_subject?: string;
  call_status?: 'answered' | 'missed' | 'voicemail';
  priority?: 'low' | 'medium' | 'high';
  
  // Campos específicos para llamadas VOIP
  call_sid?: string; // ID único de la llamada
  call_direction?: 'inbound' | 'outbound';
  call_from?: string; // Número que llama
  call_to?: string; // Número que recibe
  call_duration?: number; // Duración en segundos
  call_start_time?: string; // Timestamp de inicio
  call_end_time?: string; // Timestamp de fin
  call_recording_url?: string; // URL de grabación
  call_recording_duration?: number; // Duración de grabación
  call_price?: number; // Costo de la llamada
  call_provider?: 'twilio' | 'aircall' | 'ringcentral';
  call_answered_by?: string; // Quién contestó
  call_hangup_by?: 'caller' | 'callee' | 'system';
  call_caller_name?: string; // Nombre del llamador
  
  // Campos para integración con CRM
  customer_id?: string; // ID del cliente relacionado
  opportunity_id?: string; // ID de oportunidad relacionada
  lead_id?: string; // ID de lead relacionado
  
  [key: string]: any; // Para campos adicionales flexibles
}

// Estructura principal de actividad
export interface Activity {
  id: string;
  organization_id: number;
  activity_type: ActivityType;
  user_id?: string;
  notes?: string;
  related_type?: RelatedType | string;
  related_id?: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  metadata: ActivityMetadata;
  
  // Campos enriquecidos (se llenan desde el servicio)
  user_name?: string;
  user_avatar?: string;
  related_entity_name?: string;
  related_entity_data?: any;
}

// Filtros para actividades
export interface ActivityFilter {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  activityType?: ActivityType | ActivityType[];
  relatedType?: RelatedType | string;
  relatedId?: string;
  search?: string; // Búsqueda en notes
  limit?: number;
  page?: number;
}

// Respuesta paginada de actividades
export interface ActivityResponse {
  data: Activity[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Datos para crear nueva actividad
export interface NewActivity {
  activity_type: ActivityType;
  user_id?: string;
  notes?: string;
  related_type?: RelatedType | string;
  related_id?: string;
  occurred_at?: string;
  metadata?: ActivityMetadata;
}

// Configuración de iconos por tipo de actividad
export interface ActivityTypeConfig {
  icon: string;
  color: string;
  label: string;
  bgColor: string;
}

// Mapa de configuración de tipos
export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, ActivityTypeConfig> = {
  [ActivityType.SYSTEM]: {
    icon: 'Settings',
    color: 'text-gray-600',
    label: 'Sistema',
    bgColor: 'bg-gray-100'
  },
  [ActivityType.CALL]: {
    icon: 'Phone',
    color: 'text-green-600',
    label: 'Llamada',
    bgColor: 'bg-green-100'
  },
  [ActivityType.EMAIL]: {
    icon: 'Mail',
    color: 'text-blue-600',
    label: 'Email',
    bgColor: 'bg-blue-100'
  },
  [ActivityType.WHATSAPP]: {
    icon: 'MessageCircle',
    color: 'text-green-500',
    label: 'WhatsApp',
    bgColor: 'bg-green-50'
  },
  [ActivityType.SMS]: {
    icon: 'MessageSquare',
    color: 'text-orange-600',
    label: 'SMS',
    bgColor: 'bg-orange-100'
  },
  [ActivityType.VISIT]: {
    icon: 'MapPin',
    color: 'text-purple-600',
    label: 'Visita',
    bgColor: 'bg-purple-100'
  },
  [ActivityType.NOTE]: {
    icon: 'FileText',
    color: 'text-indigo-600',
    label: 'Nota',
    bgColor: 'bg-indigo-100'
  }
};

// Estados de carga
export interface ActivityState {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
  filters: ActivityFilter;
}
