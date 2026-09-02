'use client';

import { Suspense } from 'react';
import { EquipoPage } from '@/components/crm/equipo/EquipoPage';
import { Skeleton } from '@/components/ui/skeleton';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <EquipoPage />
    </Suspense>
  );
}
