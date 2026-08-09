'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
import RolesConfigurationSettings from '@/components/admin/RolesConfigurationSettings';

export function RolesConfigPanel() {
  const { organization, isLoading } = useOrganization();

  if (isLoading || !organization) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  return <RolesConfigurationSettings organizationId={organization.id} />;
}
