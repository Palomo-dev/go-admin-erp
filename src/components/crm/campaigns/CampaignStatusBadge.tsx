import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Campaign } from './types';
import { getStatusColor, getStatusText } from './utils';

interface CampaignStatusBadgeProps {
  status: Campaign['status'];
  className?: string;
}

const CampaignStatusBadge: React.FC<CampaignStatusBadgeProps> = ({ 
  status, 
  className = '' 
}) => {
  return (
    <Badge 
      variant="secondary" 
      className={`${getStatusColor(status)} ${className}`}
    >
      {getStatusText(status)}
    </Badge>
  );
};

export default CampaignStatusBadge;
