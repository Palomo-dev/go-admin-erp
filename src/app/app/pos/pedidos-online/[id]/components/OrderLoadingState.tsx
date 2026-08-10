'use client';

import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';

export function OrderLoadingState() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeaderSkeleton />
      <DetailSkeleton />
    </div>
  );
}
