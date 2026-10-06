'use client';

/**
 * /app/crm/pronostico — desde F14 es el panel Revenue OS (resumen, embudo,
 * forecast, cohortes y matemática comercial). Misma ruta y misma entrada de
 * navegación: el pronóstico anterior vive en la pestaña «Forecast».
 */

import { Suspense } from 'react';
import { RevenueOsPage } from '@/components/crm/revenueos/RevenueOsPage';

// La sección elegida vive en `?pestana=` (useSearchParams necesita Suspense).
export default function PronosticoPage() {
  return (
    <Suspense fallback={null}>
      <RevenueOsPage />
    </Suspense>
  );
}
