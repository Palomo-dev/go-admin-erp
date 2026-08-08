"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from "@/components/common/PageSkeletons";

export const dynamic = 'force-dynamic';

function EditOpportunityRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  useEffect(() => {
    if (id) {
      router.replace(`/app/crm/oportunidades/${id}/editar`);
    } else {
      router.replace('/app/crm/pipeline');
    }
  }, [id, router]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeaderSkeleton />
      <StatsSkeleton count={4} />
      <CardListSkeleton cards={3} columns="1" />
    </div>
  );
}

export default function EditOpportunityPage() {
  return (
    <Suspense fallback={
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    }>
      <EditOpportunityRedirect />
    </Suspense>
  );
}
