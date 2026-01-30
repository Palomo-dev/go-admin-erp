'use client';

import { Badge } from '@/components/ui/badge';
import { Store, Bike, Truck } from 'lucide-react';
import type { DeliveryType } from '@/lib/services/webOrdersService';

interface DeliveryTypeBadgeProps {
  type: DeliveryType;
  partner?: string;
  showLabel?: boolean;
  variant?: 'default' | 'outline' | 'filled';
}

const DELIVERY_TYPE_CONFIG: Record<DeliveryType, { 
  label: string; 
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
}> = {
  pickup: { 
    label: 'Retiro en tienda', 
    shortLabel: 'Retiro',
    icon: <Store className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  delivery_own: { 
    label: 'Delivery propio', 
    shortLabel: 'Propio',
    icon: <Bike className="h-4 w-4" />,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  },
  delivery_third_party: { 
    label: 'Delivery terceros', 
    shortLabel: 'Terceros',
    icon: <Truck className="h-4 w-4" />,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
  },
};

export function DeliveryTypeBadge({ 
  type, 
  partner, 
  showLabel = true,
  variant = 'filled' 
}: DeliveryTypeBadgeProps) {
  const config = DELIVERY_TYPE_CONFIG[type];

  if (variant === 'outline') {
    return (
      <div className="flex items-center gap-2">
        {config.icon}
        {showLabel && <span className="text-sm">{config.label}</span>}
        {partner && (
          <Badge variant="outline" className="text-xs">
            {partner}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {showLabel && <span>{config.shortLabel}</span>}
      </Badge>
      {partner && (
        <Badge variant="outline" className="text-xs">
          {partner}
        </Badge>
      )}
    </div>
  );
}

export function DeliveryTypeIcon({ type }: { type: DeliveryType }) {
  return DELIVERY_TYPE_CONFIG[type].icon;
}

export function getDeliveryTypeLabel(type: DeliveryType): string {
  return DELIVERY_TYPE_CONFIG[type].label;
}

export { DELIVERY_TYPE_CONFIG };
