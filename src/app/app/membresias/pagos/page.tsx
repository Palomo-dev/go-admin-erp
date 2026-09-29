import { Suspense } from 'react';
import PagosMembresias from '@/components/membresias/pagos/PagosMembresias';

/** Pagos de membresías: ventas y facturas con líneas membresía. Rango y página en la URL. */
export default function PagosMembresiasPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <PagosMembresias />
      </Suspense>
    </div>
  );
}
