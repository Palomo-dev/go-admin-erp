'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SpaceStatus, SpaceType } from '@/lib/services/spacesService';
import type { OrgServiceView } from '@/lib/services/spaceServicesService';

interface EspaciosFiltersProps {
  searchTerm: string;
  statusFilter: SpaceStatus | 'all';
  zoneFilter: string;
  typeFilter: string;
  serviceFilter?: string;
  floorZones: string[];
  spaceTypes: SpaceType[];
  orgServices?: OrgServiceView[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: SpaceStatus | 'all') => void;
  onZoneChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onServiceChange?: (value: string) => void;
}

export function EspaciosFilters({
  searchTerm,
  statusFilter,
  zoneFilter,
  typeFilter,
  serviceFilter = 'all',
  floorZones,
  spaceTypes,
  orgServices = [],
  onSearchChange,
  onStatusChange,
  onZoneChange,
  onTypeChange,
  onServiceChange,
}: EspaciosFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Buscar por etiqueta o tipo..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-64"
      />

      <Select value={statusFilter} onValueChange={(v: any) => onStatusChange(v)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="available">Disponible</SelectItem>
          <SelectItem value="occupied">Ocupado</SelectItem>
          <SelectItem value="reserved">Reservado</SelectItem>
          <SelectItem value="maintenance">Mantenimiento</SelectItem>
          <SelectItem value="cleaning">Limpieza</SelectItem>
          <SelectItem value="out_of_order">Fuera de Servicio</SelectItem>
        </SelectContent>
      </Select>

      <Select value={zoneFilter} onValueChange={onZoneChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Zona" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las zonas</SelectItem>
          {floorZones.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {zone}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {spaceTypes.length > 0 && (
        <Select value={typeFilter} onValueChange={onTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {spaceTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {orgServices.length > 0 && onServiceChange && (
        <Select value={serviceFilter} onValueChange={onServiceChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Servicio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los servicios</SelectItem>
            {orgServices
              .filter((s) => s.is_active && (s.org_service_id || s.service_id))
              .map((svc) => {
                const val = svc.org_service_id || svc.service_id || svc.name;
                return (
                  <SelectItem key={val} value={val}>
                    {svc.name}
                  </SelectItem>
                );
              })}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
