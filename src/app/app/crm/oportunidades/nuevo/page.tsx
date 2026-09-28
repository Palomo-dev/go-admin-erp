'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OpportunityForm } from '@/components/crm/oportunidades';

function NuevaOportunidadContent() {
  const searchParams = useSearchParams();
  const initialPipelineId = searchParams?.get('pipeline') || undefined;
  // «Nueva oportunidad» desde la ficha o el listado de clientes.
  const initialCustomerId = searchParams?.get('cliente') || undefined;

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OpportunityForm initialPipelineId={initialPipelineId} initialCustomerId={initialCustomerId} />
    </div>
  );
}

export default function NuevaOportunidadPage() {
  return (
    <Suspense fallback={<div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen" />}>
      <NuevaOportunidadContent />
    </Suspense>
  );
}
