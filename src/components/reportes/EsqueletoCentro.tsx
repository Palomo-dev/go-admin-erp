import { Skeleton } from '@/components/ui/skeleton';

/**
 * Lo que se ve mientras el centro de reportes lee la URL (Suspense de
 * `useSearchParams`): la forma del encabezado, las pestañas y las tarjetas, en
 * vez de una pantalla en blanco.
 */
export function EsqueletoCentro() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
