'use client';

import React from 'react';
import { Filter, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ZoneFilter, StatusFilter } from '@/lib/services/kitchenService';

interface FilterBarProps {
  zoneFilter: ZoneFilter;
  statusFilter: StatusFilter;
  availableZones: string[];
  onZoneChange: (filter: ZoneFilter) => void;
  onStatusChange: (filter: StatusFilter) => void;
  statusCounts: {
    new: number;
    in_progress: number;
    ready: number;
  };
}

export function FilterBar({
  zoneFilter,
  statusFilter,
  availableZones,
  onZoneChange,
  onStatusChange,
  statusCounts,
}: FilterBarProps) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {/* Filtro por zona */}
      <div className="flex gap-2">
        <Button
          variant={zoneFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onZoneChange('all')}
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
            className={zoneFilter === zone ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            <MapPin className="h-4 w-4 mr-2" />
            {zone}
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
      </div>
    </div>
  );
}
