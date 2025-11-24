'use client';

import React from 'react';
import { Settings, Wrench, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onBulkMaintenance: () => void;
  onBulkAvailable: () => void;
  onBulkCleaning: () => void;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  allSelected,
  onSelectAll,
  onBulkMaintenance,
  onBulkAvailable,
  onBulkCleaning,
}: BulkActionsBarProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {totalCount > 0 && (
        <Button
          variant="link"
          size="sm"
          onClick={onSelectAll}
          className="text-blue-600 dark:text-blue-400"
        >
          {allSelected
            ? 'Deseleccionar todos'
            : `Seleccionar todos (${totalCount})`}
        </Button>
      )}

      {selectedCount > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Acciones ({selectedCount})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onBulkMaintenance}>
              <Wrench className="h-4 w-4 mr-2" />
              Crear Orden de Mantenimiento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBulkCleaning}>
              <Sparkles className="h-4 w-4 mr-2" />
              Asignar Tarea de Limpieza
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onBulkAvailable}>
              Marcar como Disponible
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
