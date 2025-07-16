'use client';

import { useMemo } from 'react';
import OrganizationSelector from '@/components/common/OrganizationSelector';

interface OrganizationSelectorWrapperProps {
  userId?: string;
  className?: string;
  showCreateOption?: boolean;
}

export const OrganizationSelectorWrapper = ({ 
  userId,
  className = '',
  showCreateOption = true 
}: OrganizationSelectorWrapperProps) => {
  
  return (
    <OrganizationSelector 
      userId={userId}
      className={className}
      showCreateOption={showCreateOption}
    />
  );
};

export default OrganizationSelectorWrapper;
