'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useOrgAdmin } from '@/components/organization/useOrgAdmin';
import { InvitationsSkeleton } from '@/components/organization/OrganizationSkeletons';

const InvitationsTab = dynamic(() => import('@/components/organization/InvitationsTab'), {
  loading: () => <InvitationsSkeleton />
});

export default function InvitacionesPage() {
  const t = useTranslations('org');
  const { orgId, isOrgAdmin, loading, error } = useOrgAdmin();

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('invitations.title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('invitations.description')}</p>
        </div>
        <InvitationsSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 dark:border-red-400">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="p-4 sm:p-8">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 dark:border-yellow-400">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">{t('common.noPermissions')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('invitations.title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('invitations.description')}</p>
        </div>
      </div>

      {orgId && (
        <Suspense fallback={<InvitationsSkeleton />}>
          <InvitationsTab orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
