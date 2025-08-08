import { Campaign, CampaignStatistics } from './types';

/**
 * Obtiene el ID de la organización desde el localStorage
 */
export const getOrganizationId = (): number => {
  if (typeof window === 'undefined') {
    return 2; // Valor por defecto para SSR
  }
  
  try {
    const orgData = localStorage.getItem('selectedOrganization');
    if (orgData) {
      const parsed = JSON.parse(orgData);
      return parsed.id || 2;
    }
  } catch (error) {
    console.warn('Error obteniendo organización del localStorage:', error);
  }
  return 2;
};

/**
 * Calcula las métricas de una campaña
 */
export const calculateCampaignMetrics = (statistics: CampaignStatistics) => {
  const totalSent = statistics.total_sent || 0;
  const delivered = statistics.delivered || 0;
  const opened = statistics.opened || 0;
  const clicked = statistics.clicked || 0;

  const openRate = totalSent > 0 ? (opened / totalSent) * 100 : 0;
  const clickRate = totalSent > 0 ? (clicked / totalSent) * 100 : 0;
  const conversionRate = statistics.conversion_rate || 0;

  return {
    totalSent,
    delivered,
    opened,
    clicked,
    openRate: Math.round(openRate * 100) / 100,
    clickRate: Math.round(clickRate * 100) / 100,
    conversionRate: Math.round(conversionRate * 100) / 100,
  };
};

/**
 * Formatea una fecha para mostrar
 */
export const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '-';
  }
};

/**
 * Obtiene el color del badge según el estado
 */
export const getStatusColor = (status: Campaign['status']) => {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'sending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'sent':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

/**
 * Obtiene el texto del estado en español
 */
export const getStatusText = (status: Campaign['status']) => {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'scheduled':
      return 'Programada';
    case 'sending':
      return 'Enviando';
    case 'sent':
      return 'Enviada';
    default:
      return 'Desconocido';
  }
};

/**
 * Obtiene el texto del canal en español
 */
export const getChannelText = (channel: string | null) => {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'whatsapp':
      return 'WhatsApp';
    default:
      return '-';
  }
};

/**
 * Valida los datos del formulario de campaña
 */
export const validateCampaignForm = (data: any): string[] => {
  const errors: string[] = [];

  if (!data.name?.trim()) {
    errors.push('El nombre es requerido');
  }

  if (!data.channel) {
    errors.push('El canal es requerido');
  }

  if (!data.segment_id) {
    errors.push('El segmento es requerido');
  }

  if (data.scheduled_at && new Date(data.scheduled_at) <= new Date()) {
    errors.push('La fecha de programación debe ser futura');
  }

  return errors;
};
