'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useOrgAdmin } from '@/components/organization/useOrgAdmin';
import { BranchesSkeleton } from '@/components/organization/OrganizationSkeletons';

const BranchesTab = dynamic(() => import('@/components/organization/BranchesTab'), {
  loading: () => <BranchesSkeleton />
});

export default function SucursalesPage() {
  const t = useTranslations('org');
  const { orgId, isOrgAdmin, userBranches, loading, error } = useOrgAdmin();

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('branches.title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('branches.description')}</p>
        </div>
        <BranchesSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 dark:bg-red-900/30 dark:border-red-400">
          <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="p-4 sm:p-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 dark:bg-yellow-900/30 dark:border-yellow-400">
          <p className="text-sm text-yellow-700 dark:text-yellow-200">{t('common.noPermissions')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('branches.title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('branches.description')}</p>
        </div>
      </div>

      {userBranches.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('branches.yourBranches')}</h2>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {userBranches.map((branch) => (
              <div key={branch.branch_id} className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border dark:border-gray-700">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 min-w-0 break-words">{branch.branch_name || t('branches.branchFallback', { id: branch.branch_id })}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orgId && (
        <Suspense fallback={<BranchesSkeleton />}>
          <BranchesTab orgId={orgId} userBranches={userBranches} />
        </Suspense>
      )}
    </div>
  );
}
