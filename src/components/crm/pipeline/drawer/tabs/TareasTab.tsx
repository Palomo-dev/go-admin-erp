'use client';

import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { PestanaTareas } from '@/components/crm/oportunidad/pestanas/PestanaTareas';
import type { DrawerTabProps } from './types';

/** Pestaña Tareas del drawer y del detalle (Figma 822:235333). `onCountChange` recibe las pendientes. */
export function TareasTab({ opportunity, active, onCountChange, variante }: DrawerTabProps & { onCountChange?: (n: number) => void; variante?: 'drawer' | 'detalle' }) {
  const cat = useCatalogosCrm();
  if (!active) return null;
  return <PestanaTareas oportunidadId={opportunity.id} clienteId={opportunity.customer_id ?? null} usuarios={cat.usuarios} usuarioId={cat.usuarioId} onConteo={onCountChange} variante={variante} />;
}
