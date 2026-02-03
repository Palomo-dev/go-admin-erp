'use client';

export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import { OpportunityForm } from '@/components/crm/oportunidades';

export default function NuevaOportunidadPage() {
  const searchParams = useSearchParams();
  const initialPipelineId = searchParams.get('pipeline') || undefined;

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OpportunityForm initialPipelineId={initialPipelineId} />
    </div>
  );
}
