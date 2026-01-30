'use client';

import { useState, useEffect, use } from 'react';
import { OpportunityForm, opportunitiesService, Opportunity } from '@/components/crm/oportunidades';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditarOportunidadPage({ params }: PageProps) {
  const { id } = use(params);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadOpportunity = async () => {
      try {
        const data = await opportunitiesService.getOpportunityById(id);
        setOpportunity(data);
      } catch (error) {
        console.error('Error cargando oportunidad:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadOpportunity();
  }, [id]);

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <p className="text-center text-gray-500 dark:text-gray-400">Oportunidad no encontrada</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OpportunityForm opportunity={opportunity} />
    </div>
  );
}
