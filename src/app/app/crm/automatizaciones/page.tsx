import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AutomatizacionesPage } from '@/components/crm/automatizaciones/AutomatizacionesPage';

export const metadata: Metadata = {
  title: 'Automatizaciones | CRM',
  description: 'Reglas que actúan solas sobre el pipeline (FASE-08)',
};

export default function AutomatizacionesRoute() {
  return (
    <Suspense fallback={null}>
      <AutomatizacionesPage />
    </Suspense>
  );
}
