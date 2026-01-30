'use client';

import { Suspense } from 'react';
import { NuevaVentaPage } from '@/components/pos/ventas/nuevo';
import { RefreshCw } from 'lucide-react';

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );
}

export default function NuevaVentaRoute() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NuevaVentaPage />
    </Suspense>
  );
}
