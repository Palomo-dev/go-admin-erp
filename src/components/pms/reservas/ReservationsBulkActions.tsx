'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle,
  XCircle,
  Download,
  X,
} from 'lucide-react';

interface ReservationsBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onExport: () => void;
  isProcessing?: boolean;
  canConfirm: boolean;
  canCancel: boolean;
}

export function ReservationsBulkActions({
  selectedCount,
  totalCount,
  allSelected,
  onSelectAll,
  onClearSelection,
  onConfirm,
  onCancel,
  onExport,
  isProcessing = false,
  canConfirm,
  canCancel,
}: ReservationsBulkActionsProps) {
  if (selectedCount === 0) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onSelectAll}
          aria-label="Seleccionar todas"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Seleccionar todas las reservas ({totalCount})
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onSelectAll}
          aria-label="Seleccionar todas"
        />
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {selectedCount} seleccionada{selectedCount !== 1 ? 's' : ''}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4 mr-1" />
          Limpiar
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {canConfirm && (
          <Button
            size="sm"
            variant="outline"
            onClick={onConfirm}
            disabled={isProcessing}
            className="text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirmar
          </Button>
        )}

        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={onExport}
          disabled={isProcessing}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>
    </div>
  );
}
