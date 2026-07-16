'use client';

import React from 'react';
import { Filter, MapPin, ChefHat, Snowflake, Wine } from 'lucide-react';
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

const STATIONS: { key: StationFilter; label: string; icon: typeof ChefHat }[] = [
  { key: 'hot_kitchen', label: 'Cocina Caliente', icon: ChefHat },
  { key: 'cold_kitchen', label: 'Cocina Fría', icon: Snowflake },
  { key: 'bar', label: 'Bar', icon: Wine },
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

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {/* Filtro por zona */}
      <div
        ref={dragScroll.ref}
        onPointerDown={dragScroll.onPointerDown}
        onPointerMove={dragScroll.onPointerMove}
        onPointerUp={dragScroll.onPointerUp}
        onPointerLeave={dragScroll.onPointerLeave}
        onClickCapture={dragScroll.onClickCapture}
        className={cn(
          'flex gap-2 overflow-x-auto pb-1 scrollbar-hide cursor-grab active:cursor-grabbing select-none',
          availableZones.length > 0 ? 'max-w-full' : ''
        )}
      >
        <Button
          variant={zoneFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onZoneChange('all')}
          className="shrink-0"
        >
          <Filter className="h-4 w-4 mr-2" />
          Todas las Zonas
        </Button>
        {availableZones.map((zone) => (
          <Button
            key={zone}
            variant={zoneFilter === zone ? 'default' : 'outline'}
            size="sm"
            onClick={() => onZoneChange(zone)}
            className={cn('shrink-0', zoneFilter === zone ? 'bg-blue-600 hover:bg-blue-700' : '')}
          >
            <MapPin className="h-4 w-4 mr-2" />
            {zone}
          </Button>
        ))}
      </div>

      {/* Filtro por estación de cocina */}
      <div className="flex gap-2">
        <Button
          variant={stationFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStationChange('all')}
        >
          Todas las Estaciones
        </Button>
        {STATIONS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={stationFilter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => onStationChange(key)}
            className={cn(stationFilter === key ? 'bg-purple-600 hover:bg-purple-700' : '')}
          >
            <Icon className="h-4 w-4 mr-2" />
            {label}
          </Button>
        ))}
      </div>

      {/* Filtro por estado */}
      <div className="flex gap-2 ml-auto">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusChange('all')}
        >
          Todos
        </Button>
        <Button
          variant={statusFilter === 'new' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusChange('new')}
        >
          Nuevos
          {statusCounts.new > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusCounts.new}
            </Badge>
          )}
        </Button>
        <Button
          variant={statusFilter === 'preparing' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusChange('preparing')}
        >
          En Preparación
          {statusCounts.in_progress > 0 && (
            <Badge variant="secondary" className="ml-2">
              {statusCounts.in_progress}
            </Badge>
          )}
        </Button>
        <Button
          variant={statusFilter === 'ready' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusChange('ready')}
        >
          Listos
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
          className={statusFilter === 'delivered' ? 'bg-gray-600 hover:bg-gray-700' : ''}
        >
          Entregados
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
