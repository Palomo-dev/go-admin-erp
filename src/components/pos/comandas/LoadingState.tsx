'use client';

import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto del tablero (Figma `961:279128`): 4 columnas con cabecera y 2 comandas cada una. */
export function LoadingState() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((columna) => (
        <div key={columna} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
          <Skeleton className="h-5 w-28" />
          {[0, 1].map((comanda) => (
            <div key={comanda} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
