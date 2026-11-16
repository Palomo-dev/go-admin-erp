'use client';

import { PestanaNotas } from '@/components/crm/oportunidad/pestanas/PestanaNotas';
import type { DrawerTabProps } from './types';

/** Pestaña Notas del drawer y del detalle (Figma 822:235945). */
export function NotasTab({ opportunity, active, onCountChange }: DrawerTabProps & { onCountChange?: (n: number) => void }) {
  if (!active) return null;
  return <PestanaNotas oportunidadId={opportunity.id} onConteo={onCountChange} />;
}
