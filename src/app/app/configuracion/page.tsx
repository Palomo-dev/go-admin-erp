'use client';

import { Suspense } from 'react';
import { ConfiguracionLayout } from '@/components/configuracion/layout/ConfiguracionLayout';
import { Skeleton } from '@/components/ui/skeleton';

export default function ConfiguracionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full">
          <div className="border-b px-6 py-4 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="px-6 py-3">
            <Skeleton className="h-10 w-full max-w-2xl" />
          </div>
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      }
    >
      <ConfiguracionLayout />
    </Suspense>
  );
}
