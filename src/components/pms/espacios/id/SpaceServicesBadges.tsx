'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Wifi, Tv, Lock, Car, Bath, Flame, Wind, Phone, Laptop, Waves, Dumbbell, Coffee, PawPrint } from 'lucide-react';
import spaceServicesService, { SpaceServiceView } from '@/lib/services/spaceServicesService';

// Mapa simplificado de iconos conocidos
const ICON_MAP: Record<string, React.ElementType> = {
  wifi: Wifi,
  tv: Tv,
  lock: Lock,
  car: Car,
  bath: Bath,
  flame: Flame,
  wind: Wind,
  phone: Phone,
  laptop: Laptop,
  waves: Waves,
  dumbbell: Dumbbell,
  coffee: Coffee,
  'paw-print': PawPrint,
};

interface SpaceServicesBadgesProps {
  spaceId: string;
  refreshTrigger?: number;
}

export function SpaceServicesBadges({ spaceId, refreshTrigger = 0 }: SpaceServicesBadgesProps) {
  const [services, setServices] = useState<SpaceServiceView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const data = await spaceServicesService.getSpaceServices(spaceId);
      setServices(data);
      setIsLoading(false);
    };
    load();
  }, [spaceId, refreshTrigger]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (services.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Servicios
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {services.map((s) => {
          const IconComp = s.icon ? ICON_MAP[s.icon] || null : null;
          return (
            <Badge
              key={s.space_service_id}
              variant="outline"
              className="text-[11px] px-2 py-0.5 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 gap-1"
            >
              {IconComp && <IconComp className="h-3 w-3" />}
              {s.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
