'use client';

import { Suspense } from 'react';
import { ConfiguracionLayout } from '@/components/configuracion/layout/ConfiguracionLayout';
import { Skeleton } from '@/components/ui/skeleton';

export default function ConfiguracionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)]">
          <div className="w-64 border-r p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      }
    >
      <ConfiguracionLayout />
    </Suspense>
  );
}
