'use client';

import { DetalleMovimientoTesoreria } from '@/components/finanzas/tesoreria/compartido/formularios';

/** Detalle de un ingreso: el mismo de un egreso, con su tipo (`DetalleMovimientoTesoreria`). */
export function IngresoDetalle({ id }: { id: string }) {
  return <DetalleMovimientoTesoreria id={id} tipo="income" />;
}
