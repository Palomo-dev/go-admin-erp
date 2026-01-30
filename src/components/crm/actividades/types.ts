// Tipos de actividad disponibles
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'visit' | 'whatsapp' | 'system';

// Tipos de relación
export type RelatedType = 'customer' | 'opportunity';

// Interface principal de actividad
export interface Activity {
  id: string;
  organization_id: number;
  activity_type: ActivityType;
  user_id: string | null;
  notes: string | null;
  related_type: RelatedType | null;
  related_id: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
  // Relaciones expandidas
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  opportunity?: {
    id: string;
    title: string;
    amount?: number;
  };
}

// Para crear una actividad
export interface CreateActivityInput {
  activity_type: ActivityType;
  notes?: string;
  related_type?: RelatedType;
  related_id?: string;
  occurred_at?: string;
  metadata?: Record<string, any>;
}

// Para actualizar una actividad
export interface UpdateActivityInput {
  activity_type?: ActivityType;
  notes?: string;
  related_type?: RelatedType;
  related_id?: string;
  occurred_at?: string;
  metadata?: Record<string, any>;
}

// Filtros para la lista
export interface ActivityFilters {
  activity_type?: ActivityType;
  user_id?: string;
  related_type?: RelatedType;
  related_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// Estadísticas
export interface ActivityStats {
  total: number;
  calls: number;
  emails: number;
  meetings: number;
  notes: number;
  visits: number;
  whatsapp: number;
}

// Configuración de tipos de actividad para UI
export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, {
  label: string;
  color: string;
  bgColor: string;
  darkBgColor: string;
  icon: string;
}> = {
  call: {
    label: 'Llamada',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100',
    darkBgColor: 'dark:bg-green-900/30',
    icon: 'Phone',
  },
  email: {
    label: 'Email',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100',
    darkBgColor: 'dark:bg-blue-900/30',
    icon: 'Mail',
  },
  meeting: {
    label: 'Reunión',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100',
    darkBgColor: 'dark:bg-purple-900/30',
    icon: 'Users',
  },
  note: {
    label: 'Nota',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100',
    darkBgColor: 'dark:bg-yellow-900/30',
    icon: 'StickyNote',
  },
  visit: {
    label: 'Visita',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100',
    darkBgColor: 'dark:bg-orange-900/30',
    icon: 'MapPin',
  },
  whatsapp: {
    label: 'WhatsApp',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100',
    darkBgColor: 'dark:bg-emerald-900/30',
    icon: 'MessageCircle',
  },
  system: {
    label: 'Sistema',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100',
    darkBgColor: 'dark:bg-gray-900/30',
    icon: 'Settings',
  },
};
