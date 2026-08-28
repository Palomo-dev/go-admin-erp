'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { ReviewsModerationPanel } from '@/components/organization/reviews/ReviewsModerationPanel';
import { Loader2 } from 'lucide-react';

export default function ReviewsModerationPage() {
  const { organization, isLoading } = useOrganization();

  if (isLoading || !organization) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Moderación de Reseñas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aprueba, rechaza o responde las reseñas de productos de tu tienda.
        </p>
      </div>
      <ReviewsModerationPanel organizationId={organization.id} />
    </div>
  );
}
