'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';

export default function OrganizacionPage() {
  const router = useRouter();
  const t = useTranslations('org.common');

  useEffect(() => {
    // Redirect to the default organization route (miembros)
    router.replace('/app/organizacion/miembros');
  }, [router]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeaderSkeleton />
      <DetailSkeleton />
      <p className="text-center text-gray-500 dark:text-gray-400">{t('redirecting')}</p>
    </div>
  );
}
