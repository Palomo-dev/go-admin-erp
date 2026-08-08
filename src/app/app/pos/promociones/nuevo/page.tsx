'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { PromotionWizard } from '@/components/pos/promociones/nuevo';

export default function NuevaPromocionPage() {
  const { isLoading: orgLoading } = useOrganization();

  if (orgLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <DetailSkeleton />
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
