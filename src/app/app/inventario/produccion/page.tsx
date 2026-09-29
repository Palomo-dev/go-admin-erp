'use client';

import { Suspense } from 'react';
import { ProduccionPage } from '@/components/inventario/produccion';

export default function InventarioProduccionPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <ProduccionPage />
      </Suspense>
    </div>
  );
}
