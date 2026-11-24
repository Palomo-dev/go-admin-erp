import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AsistenteCampanaVoz } from '@/components/crm/campanas/voz/AsistenteCampanaVoz';

export const metadata: Metadata = {
  title: 'Nueva campaña de llamadas IA | CRM',
  description: 'Asistente de 6 pasos para crear una campaña del agente de voz',
};

export default function NuevaCampanaVozRoute() {
  return (
    <Suspense fallback={null}>
      <AsistenteCampanaVoz />
    </Suspense>
  );
}
