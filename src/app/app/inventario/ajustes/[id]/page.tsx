'use client';

import { Suspense, use } from 'react';
import { AjusteDetalle } from '@/components/inventario/ajustes';

/**
 * Detalle de un ajuste. Un id que no es un entero positivo llega como 0 y la
 * pantalla muestra «no encontrado».
 */
export default function InventarioAjusteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ajusteId = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <AjusteDetalle ajusteId={ajusteId} />
      </Suspense>
    </div>
  );
}
