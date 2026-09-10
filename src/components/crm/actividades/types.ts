// Tipos de actividad disponibles (CHECK real ampliado por F0: + sms, ai_call, task)
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'visit' | 'whatsapp' | 'system' | 'sms' | 'ai_call' | 'task';

// Tipos de relación
export type RelatedType = 'customer' | 'opportunity';

/** Sentido del contacto; se guarda en `activities.channel`. */
export type ActivityDirection = 'inbound' | 'outbound';

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
  // Columnas reales de `activities` (verificadas contra la BD)
  channel: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  call_id: string | null;
  email_message_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
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
    customer_id?: string | null;
  };
}

// Para crear una actividad (contrato de POST /api/crm/activities)
export interface CreateActivityInput {
  activity_type: ActivityType;
  notes?: string;
  related_type: RelatedType;
  related_id: string;
  occurred_at?: string;
  channel?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, any>;
}

// Para actualizar una actividad
export interface UpdateActivityInput {
  activity_type?: ActivityType;
  notes?: string;
  related_type?: RelatedType;
  related_id?: string;
  occurred_at?: string;
  channel?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, any>;
}

// Filtros para la lista
export interface ActivityFilters {
  activity_type?: ActivityType;
  user_id?: string;
  related_type?: RelatedType;
  related_id?: string;
  outcome?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// Estadísticas
export interface ActivityStats {
  total: number;
  calls: number;
  emails: number;
  whatsapp: number;
  meetings: number;
  notes: number;
  tasks: number;
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
  sms: {
    label: 'SMS',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-100',
    darkBgColor: 'dark:bg-cyan-900/30',
    icon: 'MessageSquare',
  },
  ai_call: {
    label: 'Llamada IA',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-100',
    darkBgColor: 'dark:bg-violet-900/30',
    icon: 'Bot',
  },
  task: {
    label: 'Tarea',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100',
    darkBgColor: 'dark:bg-indigo-900/30',
    icon: 'CheckSquare',
  },
};

/**
 * Tipos que un comercial registra a mano desde la pantalla de actividades.
 * `system` y `ai_call` los escribe el propio sistema, no se ofrecen aquí.
 */
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = [
  'call',
  'email',
  'whatsapp',
  'meeting',
  'note',
  'task',
  'visit',
  'sms',
];

/** Tipos con sentido entrante/saliente. */
export const DIRECTIONAL_TYPES: ActivityType[] = ['call', 'email', 'whatsapp', 'sms'];

/** Tipos con duración medible. */
export const TIMED_TYPES: ActivityType[] = ['call', 'meeting', 'visit', 'ai_call'];

export const DIRECTION_LABELS: Record<ActivityDirection, string> = {
  outbound: 'Saliente',
  inbound: 'Entrante',
};

/**
 * Resultados por tipo. Se guardan en `activities.outcome` (texto libre en la
 * BD, máx. 60 caracteres según el esquema del endpoint) y alimentan
 * `opportunities.contact_result`.
 */
export const OUTCOME_OPTIONS: Partial<Record<ActivityType, Array<{ value: string; label: string }>>> = {
  call: [
    { value: 'connected', label: 'Contactado' },
    { value: 'no_answer', label: 'No contestó' },
    { value: 'voicemail', label: 'Buzón de voz' },
    { value: 'wrong_number', label: 'Número equivocado' },
    { value: 'callback_requested', label: 'Pidió que le llamen luego' },
    { value: 'not_interested', label: 'No interesado' },
  ],
  email: [
    { value: 'sent', label: 'Enviado' },
    { value: 'replied', label: 'Respondió' },
    { value: 'bounced', label: 'Rebotado' },
    { value: 'no_reply', label: 'Sin respuesta' },
  ],
  whatsapp: [
    { value: 'sent', label: 'Enviado' },
    { value: 'replied', label: 'Respondió' },
    { value: 'no_reply', label: 'Sin respuesta' },
  ],
  sms: [
    { value: 'sent', label: 'Enviado' },
    { value: 'replied', label: 'Respondió' },
    { value: 'no_reply', label: 'Sin respuesta' },
  ],
  meeting: [
    { value: 'held', label: 'Se realizó' },
    { value: 'scheduled', label: 'Agendada' },
    { value: 'no_show', label: 'No asistió' },
    { value: 'rescheduled', label: 'Reprogramada' },
    { value: 'canceled', label: 'Cancelada' },
  ],
  visit: [
    { value: 'held', label: 'Se realizó' },
    { value: 'no_show', label: 'No estaba' },
    { value: 'rescheduled', label: 'Reprogramada' },
  ],
};

/** Etiqueta legible de un `outcome` guardado (o el valor crudo si es libre). */
export function outcomeLabel(type: ActivityType, value?: string | null): string | null {
  if (!value) return null;
  const found = OUTCOME_OPTIONS[type]?.find((o) => o.value === value);
  if (found) return found.label;
  // Puede venir de otro tipo (p. ej. una llamada registrada por telefonía)
  for (const options of Object.values(OUTCOME_OPTIONS)) {
    const hit = options?.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value;
}

/** `125` → `2 min 5 s`; `null` → `null`. */
export function formatDuration(seconds?: number | null): string | null {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  if (seconds < 60) return `${seconds} s`;
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (min < 60) return rest ? `${min} min ${rest} s` : `${min} min`;
  const hours = Math.floor(min / 60);
  const restMin = min % 60;
  return restMin ? `${hours} h ${restMin} min` : `${hours} h`;
}
