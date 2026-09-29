'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/kit/SearchInput';

interface MaintenanceFiltersProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedPriority: string;
  onPriorityChange: (priority: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export function MaintenanceFilters({
  selectedStatus,
  onStatusChange,
  selectedPriority,
  onPriorityChange,
  searchTerm,
  onSearchChange,
}: MaintenanceFiltersProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Búsqueda */}
        <div className="space-y-2">
          <Label htmlFor="search">Buscar</Label>
          <SearchInput
            value={searchTerm}
            onChange={onSearchChange}
            onValueChange={onSearchChange}
            placeholder="Buscar por descripción o espacio..."
            id="search"
          />
        </div>

        {/* Filtro por estado */}
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger id="status" className="dark:bg-gray-900">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="reported">Reportadas</SelectItem>
              <SelectItem value="assigned">Asignadas</SelectItem>
              <SelectItem value="in_progress">En Progreso</SelectItem>
              <SelectItem value="on_hold">En Espera</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro por prioridad */}
        <div className="space-y-2">
          <Label htmlFor="priority">Prioridad</Label>
          <Select value={selectedPriority} onValueChange={onPriorityChange}>
            <SelectTrigger id="priority" className="dark:bg-gray-900">
              <SelectValue placeholder="Todas las prioridades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las prioridades</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="med">Media</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
