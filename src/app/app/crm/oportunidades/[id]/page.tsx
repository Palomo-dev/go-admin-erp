'use client';

import { use } from 'react';
import { OpportunityDetail } from '@/components/crm/oportunidades';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OpportunityDetailPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OpportunityDetail opportunityId={id} />
    </div>
  );
}
