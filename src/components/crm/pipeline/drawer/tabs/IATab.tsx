'use client';

import { PestanaIA } from '@/components/crm/oportunidad/pestanas/PestanaIA';
import type { DrawerTabProps } from './types';

/** Pestaña IA del drawer y del detalle (Figma 822:237089): próxima acción, discovery y agente de voz. */
export function IATab({ opportunity, active }: DrawerTabProps) {
  if (!active) return null;
  return <PestanaIA oportunidadId={opportunity.id} accionActual={opportunity.next_action ?? null} />;
}
