'use client';

import { RefreshCw } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PromotionWizard } from '@/components/pos/promociones/nuevo';

export default function NuevaPromocionPage() {
  const { isLoading: orgLoading } = useOrganization();

  if (orgLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <PromotionWizard />
      </div>
    </div>
  );
}
