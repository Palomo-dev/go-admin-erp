import { Suspense } from 'react';
import type { Metadata } from 'next';
import { HistorialEjecucionesPage } from '@/components/crm/automatizaciones/HistorialEjecucionesPage';

export const metadata: Metadata = {
  title: 'Historial de ejecuciones | Automatizaciones | CRM',
};

export default function HistorialEjecucionesRoute() {
  return (
    <Suspense fallback={null}>
      <HistorialEjecucionesPage />
    </Suspense>
  );
}
