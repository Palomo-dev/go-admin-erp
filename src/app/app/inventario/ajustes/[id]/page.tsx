'use client';

import React from 'react';
import { useParams } from 'next/navigation';

import { AjusteDetalle } from '@/components/inventario/ajustes/detalle';

export default function AjusteDetallePage() {

  const params = useParams();
  const adjustmentId = parseInt(params.id as string);

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <AjusteDetalle adjustmentId={adjustmentId} />
    </div>
  );
}
