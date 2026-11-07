'use client';

import React, { Suspense } from 'react';
import { BancosPage } from '@/components/finanzas/bancos/BancosPage';
import { Skeleton } from '@/components/ui/skeleton';

// La pestaña activa va en la URL (`?tab=alertas`): useSearchParams pide Suspense.
export default function BancosAppPage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <BancosPage />
    </Suspense>
  );
}
