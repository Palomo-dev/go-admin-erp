'use client';

import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { PestanaDocumentos } from '@/components/crm/oportunidad/pestanas/PestanaDocumentos';
import type { DrawerTabProps } from './types';

/** Pestaña Documentos del drawer y del detalle (Figma 822:236526), por `/api/crm/documents/**`. */
export function DocumentosTab({ opportunity, active, onCountChange }: DrawerTabProps & { onCountChange?: (n: number) => void }) {
  const cat = useCatalogosCrm();
  if (!active) return null;
  return <PestanaDocumentos oportunidadId={opportunity.id} usuarios={cat.usuarios} onConteo={onCountChange} />;
}
