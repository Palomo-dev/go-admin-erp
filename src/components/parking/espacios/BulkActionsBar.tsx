'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, CheckCircle, Car, Clock, Wrench, Ban, MapPin } from 'lucide-react';
import { SpaceState, ParkingZone } from './types';

interface BulkActionsBarProps {
  selectedCount: number;
  zones: ParkingZone[];
  onClearSelection: () => void;
  onChangeState: (state: SpaceState) => void;
  onAssignZone: (zoneId: string) => void;
  onDelete: () => void;
}

const stateOptions: { value: SpaceState; label: string; icon: React.ReactNode }[] = [
  { value: 'free', label: 'Libre', icon: <CheckCircle className="h-4 w-4 text-green-600" /> },
  { value: 'occupied', label: 'Ocupado', icon: <Car className="h-4 w-4 text-red-600" /> },
  { value: 'reserved', label: 'Reservado', icon: <Clock className="h-4 w-4 text-yellow-600" /> },
  { value: 'maintenance', label: 'Mantenimiento', icon: <Wrench className="h-4 w-4 text-orange-600" /> },
  { value: 'disabled', label: 'Deshabilitado', icon: <Ban className="h-4 w-4 text-gray-600" /> },
];

export function BulkActionsBar({
  selectedCount,
  zones,
  onClearSelection,
  onChangeState,
  onAssignZone,
  onDelete,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        <Select onValueChange={(v) => onChangeState(v as SpaceState)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Cambiar estado" />
          </SelectTrigger>
          <SelectContent>
            {stateOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  {opt.icon}
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={onAssignZone}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Asignar zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <div className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Sin zona
              </div>
            </SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  {zone.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="destructive" size="sm" onClick={onDelete}>
          Eliminar
        </Button>
      </div>
    </div>
  );
}
