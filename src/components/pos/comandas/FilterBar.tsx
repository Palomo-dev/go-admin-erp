'use client';

import React from 'react';
import { Filter, MapPin, ChefHat, Snowflake, Wine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { useDragScroll } from '@/hooks/useDragScroll';
import type { ZoneFilter, StatusFilter, StationFilter } from '@/lib/services/kitchenService';

interface FilterBarProps {
  zoneFilter: ZoneFilter;
  statusFilter: StatusFilter;
  stationFilter: StationFilter;
  availableZones: string[];
  onZoneChange: (filter: ZoneFilter) => void;
  onStatusChange: (filter: StatusFilter) => void;
  onStationChange: (filter: StationFilter) => void;
  statusCounts: {
    new: number;
    in_progress: number;
    ready: number;
    delivered: number;
  };
}

// La etiqueta sale de `posComandas.estaciones.<key>`.
const STATIONS: { key: 'hot_kitchen' | 'cold_kitchen' | 'bar'; icon: typeof ChefHat }[] = [
  { key: 'hot_kitchen', icon: ChefHat },
  { key: 'cold_kitchen', icon: Snowflake },
  { key: 'bar', icon: Wine },
];

export function FilterBar({
  zoneFilter,
  statusFilter,
  stationFilter,
  availableZones,
  onZoneChange,
  onStatusChange,
  onStationChange,
  statusCounts,
}: FilterBarProps) {
  const dragScroll = useDragScroll<HTMLDivElement>();
  const t = useTranslations('posComandas');

  return (
    <div className="mt-3 sm:mt-4 flex flex-col gap-2 sm:gap-3">
      {/* Filtro por zona */}
      <div
        ref={dragScroll.ref}
        onPointerDown={dragScroll.onPointerDown}
        onPointerMove={dragScroll.onPointerMove}
        onPointerUp={dragScroll.onPointerUp}
        onPointerLeave={dragScroll.onPointerLeave}
        onClickCapture={dragScroll.onClickCapture}
        className={cn(
          'flex flex-nowrap gap-2 w-full overflow-x-auto pb-1 scrollbar-hide cursor-grab active:cursor-grabbing select-none'
        )}
      >
        <Button
          variant={zoneFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onZoneChange('all')}
          className="shrink-0"
        >
          <Filter className="h-4 w-4 mr-2" />
          {t('filtros.todasZonas')}
        </Button>
        {availableZones.map((zone) => (
          <Button
            key={zone}
            variant={zoneFilter === zone ? 'default' : 'outline'}
            size="sm"
            onClick={() => onZoneChange(zone)}
            className={cn('shrink-0', zoneFilter === zone ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800' : '')}
          >
            <MapPin className="h-4 w-4 mr-2" />
            {zone}
          </Button>
        ))}
      </div>

      {/* Filtro por estación de cocina */}
      <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1 scrollbar-hide">
        <Button
          variant={stationFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => onStationChange('all')}
        >
          {t('filtros.todasEstaciones')}
        </Button>
        {STATIONS.map(({ key, icon: Icon }) => (
          <Button
            key={key}
            variant={stationFilter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => onStationChange(key)}
            className={cn('shrink-0', stationFilter === key ? 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800' : '')}
          >
            <Icon className="h-4 w-4 mr-2" />
            {t(`estaciones.${key}`)}
          </Button>
        ))}
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1 scrollbar-hide">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => onStatusChange('all')}
        >
          {t('filtros.todos')}
        </Button>
        <Button
          variant={statusFilter === 'new' ? 'default' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => onStatusChange('new')}
        >
          {t('filtros.nuevos')}
          {statusCounts.new > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusCounts.new}
            </Badge>
          )}
        </Button>
        <Button
          variant={statusFilter === 'preparing' ? 'default' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => onStatusChange('preparing')}
        >
          {t('filtros.enPreparacion')}
          {statusCounts.in_progress > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusCounts.in_progress}
            </Badge>
          )}
        </Button>
        <Button
          variant={statusFilter === 'ready' ? 'default' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => onStatusChange('ready')}
        >
          {t('filtros.listos')}
          {statusCounts.ready > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusCounts.ready}
            </Badge>
          )}
        </Button>
        <Button
          variant={statusFilter === 'delivered' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusChange('delivered')}
          className={cn('shrink-0', statusFilter === 'delivered' ? 'bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600' : '')}
        >
          {t('filtros.entregados')}
          {statusCounts.delivered > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusCounts.delivered}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  );
}
