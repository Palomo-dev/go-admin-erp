import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ObjecionesPage } from '@/components/crm/objeciones/ObjecionesPage';

export const metadata: Metadata = {
  title: 'Objeciones | CRM',
  description: 'Biblioteca de objeciones: qué dice el cliente, cómo responder y qué preguntar (FASE-02)',
};

export default function ObjecionesRoute() {
  return (
    <Suspense fallback={null}>
      <ObjecionesPage />
    </Suspense>
  );
}
