'use client';

import { use } from 'react';
import { GarantiaDetailPage } from '@/components/inventario/garantias';

/** Detalle de un reclamo de garantía (el id es el uuid del reclamo). */
export default function InventarioGarantiaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <GarantiaDetailPage claimId={id} />
    </div>
  );
}
