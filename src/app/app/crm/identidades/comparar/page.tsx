import { Suspense } from 'react';
import { Metadata } from 'next';
import { CompararFusion } from '@/components/crm/identidades/CompararFusion';

export const metadata: Metadata = {
  title: 'Comparar y fusionar | CRM',
};

export default function CompararFusionRoute() {
  // `useSearchParams` (los ids del grupo) necesita su límite de Suspense.
  return (
    <Suspense fallback={null}>
      <CompararFusion />
    </Suspense>
  );
}
