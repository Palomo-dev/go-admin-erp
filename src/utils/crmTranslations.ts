/**
 * Utilidades de traducción para el módulo CRM
 * Centraliza todas las traducciones de estados y etiquetas del CRM
 */

// Función para traducir estados de oportunidad a español
export const translateOpportunityStatus = (status: string): string => {
  const statusTranslations: Record<string, string> = {
    'won': 'Ganada',
    'lost': 'Perdida', 
    'open': 'Abierta',
    'active': 'Activa',
    'in_progress': 'En progreso',
    'proposal': 'Propuesta',
    'negotiation': 'Negociación',
    'qualified': 'Calificada',
    'contacted': 'Contactada',
    'demo': 'Demo',
    'contract': 'Contrato',
    'delayed': 'Retrasada',
    'closed': 'Cerrada',
    'cancelled': 'Cancelada'
  };
  return statusTranslations[status] || status;
};

// Función para obtener la variante del badge según el estado de oportunidad
export const getOpportunityStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'won':
      return 'default'; // Verde
    case 'lost':
    case 'cancelled':
      return 'destructive'; // Rojo
    case 'open':
    case 'active':
    case 'proposal':
    case 'negotiation':
      return 'secondary'; // Azul
    default:
      return 'outline'; // Gris
  }
};

// Función para traducir estados de tareas a español
export const translateTaskStatus = (status: string): string => {
  const statusTranslations: Record<string, string> = {
    'pending': 'Pendiente',
    'in_progress': 'En progreso',
    'completed': 'Completada',
    'cancelled': 'Cancelada',
    'delayed': 'Retrasada',
    'on_hold': 'En espera'
  };
  return statusTranslations[status] || status;
};

// Función para traducir prioridades a español
export const translatePriority = (priority: string): string => {
  const priorityTranslations: Record<string, string> = {
    'low': 'Baja',
    'medium': 'Media',
    'high': 'Alta',
    'urgent': 'Urgente'
  };
  return priorityTranslations[priority] || priority;
};

// Función para traducir tipos de actividad a español
export const translateActivityType = (type: string): string => {
  const typeTranslations: Record<string, string> = {
    'call': 'Llamada',
    'email': 'Email',
    'whatsapp': 'WhatsApp',
    'visit': 'Visita',
    'note': 'Nota',
    'system': 'Sistema',
    'sms': 'SMS',
    'meeting': 'Reunión',
    'task': 'Tarea'
  };
  return typeTranslations[type] || type;
};
