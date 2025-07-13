'use client';

import { useMemo } from 'react';
import BranchSelector from '@/components/common/BranchSelector';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface BranchSelectorWrapperProps {
  orgId: string | null;
  className?: string;
}

export const BranchSelectorWrapper = ({ orgId, className = '' }: BranchSelectorWrapperProps) => {
  // Solo re-renderiza cuando cambia orgId
  const organizationId = useMemo(() => {
    // Convertir a número para compatibilidad con BranchSelector
    return orgId ? parseInt(orgId, 10) : undefined;
  }, [orgId]);
  
  // Si no hay ID de organización, no mostrar el selector
  if (!organizationId) {
    return null;
  }
  
  return (
    <BranchSelector 
      organizationId={organizationId}
      className={className}
    />
  );
};

export default BranchSelectorWrapper;
