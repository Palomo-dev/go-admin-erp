'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import RolesConfigurationSettings from '@/components/admin/RolesConfigurationSettings';

export function RolesConfigPanel() {
  const { organization, isLoading } = useOrganization();

  if (isLoading || !organization) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={4} columns="2" />
      </div>
    );
  }

  return <RolesConfigurationSettings organizationId={organization.id} />;
}
