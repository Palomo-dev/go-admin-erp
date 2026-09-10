import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SecuenciasPage } from '@/components/crm/secuencias/SecuenciasPage';

export const metadata: Metadata = {
  title: 'Secuencias | CRM',
  description: 'Secuencias multicanal de seguimiento (FASE-08)',
};

export default function SecuenciasRoute() {
  return (
    <Suspense fallback={null}>
      <SecuenciasPage />
    </Suspense>
  );
}
