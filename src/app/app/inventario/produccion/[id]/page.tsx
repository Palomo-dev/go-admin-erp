'use client';

import { Suspense, use } from 'react';
import { OrdenProduccionDetalle } from '@/components/inventario/produccion';

/** Detalle de una orden de producción. Un id que no es un entero positivo llega como 0 («no encontrada»). */
export default function InventarioOrdenProduccionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ordenId = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <OrdenProduccionDetalle ordenId={ordenId} />
      </Suspense>
    </div>
  );
}
