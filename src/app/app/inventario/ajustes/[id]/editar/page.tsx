'use client';

import { Suspense, use } from 'react';
import { FormularioAjuste } from '@/components/inventario/ajustes';

/** Editar un borrador de ajuste. Un ajuste aplicado o descartado no se edita. */
export default function InventarioAjusteEditarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ajusteId = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <FormularioAjuste ajusteId={ajusteId} />
      </Suspense>
    </div>
  );
}
