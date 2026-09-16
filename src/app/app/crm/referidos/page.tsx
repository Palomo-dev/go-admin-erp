import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ReferidosPage } from '@/components/crm/referidos/ReferidosPage';

export const metadata: Metadata = {
  title: 'Referidos | CRM',
  description: 'Referidos de clientes: quién recomendó a quién, estado, conversión en lead y recompensa (FASE-12)',
};

export default function ReferidosRoute() {
  return (
    <Suspense fallback={null}>
      <ReferidosPage />
    </Suspense>
  );
}
