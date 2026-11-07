'use client';

import { DetalleMovimientoTesoreria } from '@/components/finanzas/movimientos/DetalleMovimientoTesoreria';

/** Detalle de un egreso: el mismo de un ingreso, con su tipo (`DetalleMovimientoTesoreria`). */
export function EgresoDetalle({ id }: { id: string }) {
  return <DetalleMovimientoTesoreria id={id} tipo="expense" />;
}
