'use client';

import { Suspense } from 'react';
import { NuevaVenta } from '@/components/pos/ventas/NuevaVenta';

/** Nueva venta = pantalla del POS (D3); con `?duplicar={id}` lleva las líneas de esa venta. */
export default function NuevaVentaRoute() {
  return (
    <Suspense fallback={null}>
      <NuevaVenta />
    </Suspense>
  );
}
