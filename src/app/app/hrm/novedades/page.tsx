import { Suspense } from 'react';
import { NovedadesPage } from '@/components/hrm/novedades/NovedadesPage';

/** Recursos humanos › Novedades con aprobación (Figma 20.12). */
export default function Page() {
  return (
    <Suspense>
      <NovedadesPage />
    </Suspense>
  );
}
