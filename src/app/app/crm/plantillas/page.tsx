import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PlantillasPage } from '@/components/crm/plantillas/PlantillasPage';

export const metadata: Metadata = {
  title: 'Plantillas | CRM',
  description: 'Plantillas de email y WhatsApp del CRM',
};

export default function PlantillasRoute() {
  return (
    <Suspense fallback={null}>
      <PlantillasPage />
    </Suspense>
  );
}
