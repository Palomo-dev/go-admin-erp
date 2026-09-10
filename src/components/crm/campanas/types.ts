// Tipos de Campañas (FASE-16): alineados con el schema real y `statistics` v2.
import type { Campaign, CampaignContact, CampaignEffectiveStatus, CampaignChannel, ContactState } from '@/lib/services/crm/whatsapp/types';

export type { Campaign, CampaignContact, CampaignChannel, ContactState };
export type CampaignStatus = CampaignEffectiveStatus;

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Borrador', color: 'text-gray-600 dark:text-gray-300', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  materializing: { label: 'Calculando', color: 'text-blue-600 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  scheduled: { label: 'Programada', color: 'text-blue-600 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  sending: { label: 'Enviando', color: 'text-yellow-700 dark:text-yellow-300', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  paused: { label: 'Pausada', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  sent: { label: 'Enviada', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  canceled: { label: 'Cancelada', color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

export const CHANNEL_CONFIG: Record<CampaignChannel, { label: string; color: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'text-green-600', icon: 'MessageCircle' },
  email: { label: 'Email', color: 'text-blue-600', icon: 'Mail' },
};

export const CONTACT_STATE_LABEL: Record<ContactState, string> = {
  pending: 'Pendiente', queued: 'En cola', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', opened: 'Abierto', clicked: 'Clic', replied: 'Respondió', bounced: 'Rebotado', failed: 'Fallido', skipped: 'Omitido',
};
