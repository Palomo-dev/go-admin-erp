'use client';

import { Suspense } from 'react';
import { NuevaVentaPage } from '@/components/pos/ventas/nuevo';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';

function LoadingFallback() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeaderSkeleton />
      <CardListSkeleton cards={3} columns="1" />
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
