'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OpportunityForm } from '@/components/crm/oportunidades';

function NuevaOportunidadContent() {
  const searchParams = useSearchParams();
  const initialPipelineId = searchParams?.get('pipeline') || undefined;

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OpportunityForm initialPipelineId={initialPipelineId} />
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
