'use client';

/**
 * Organización › Plan y facturación › Plan. La pantalla vive en
 * `src/components/organization/plan/PlanPantalla.tsx` (Figma 08, sección 7).
 * `Suspense`: lee el regreso de la pasarela (`?addon=`, `?checkout=`) con
 * `useSearchParams`.
 */
import { Suspense } from 'react';
import { PlanPantalla } from '@/components/organization/plan/PlanPantalla';

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanPantalla />
    </Suspense>
  );
}
