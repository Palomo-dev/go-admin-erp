'use client';

import { PestanaActividad } from '@/components/crm/oportunidad/pestanas/PestanaActividad';
import type { DrawerTabProps } from './types';

/**
 * Pestaña Actividad del drawer (`compact`) y del detalle: la línea de tiempo
 * de la oportunidad con el diseño aprobado (Figma 820:66213 y 775:473076).
 */
export function ActividadTab({ opportunity, customer, active, compact = true, refreshToken }: DrawerTabProps & { compact?: boolean; refreshToken?: number }) {
  if (!active) return null;
  return (
    <PestanaActividad
      oportunidadId={opportunity.id}
      oportunidadNombre={opportunity.name}
      clienteId={opportunity.customer_id ?? null}
      cliente={customer ? { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone } : opportunity.customer ?? null}
      variante={compact ? 'drawer' : 'detalle'}
      refreshToken={refreshToken}
    />
  );
}
