'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Save, ArrowLeft } from 'lucide-react';

interface FormActionsProps {
  saving: boolean;
  esEdicion: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function FormActions({
  saving,
  esEdicion,
  onSubmit,
  onCancel
}: FormActionsProps) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sm:gap-4">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={saving}
        className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
        <span>Cancelar</span>
      </Button>
      
      <Button
        type="submit"
        disabled={saving}
        onClick={onSubmit}
        className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
      >
        {saving ? (
          <>
            <div className="animate-spin rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 border-b-2 border-white mr-2"></div>
            <span>{esEdicion ? 'Actualizando...' : 'Guardando...'}</span>
          </>
        ) : (
          <>
            <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
            <span>{esEdicion ? 'Actualizar Factura' : 'Guardar Factura'}</span>
          </>
        )}
      </Button>
    </div>
  );
}
