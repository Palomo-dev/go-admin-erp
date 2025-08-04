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
    <div className="flex flex-col sm:flex-row sm:justify-between gap-3 sm:gap-4">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 order-2 sm:order-1"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Cancelar
      </Button>
      
      <Button
        type="submit"
        disabled={saving}
        onClick={onSubmit}
        className="bg-blue-600 hover:bg-blue-700 text-white order-1 sm:order-2"
      >
        <Save className="w-4 h-4 mr-2" />
        {saving 
          ? (esEdicion ? 'Actualizando...' : 'Guardando...') 
          : (esEdicion ? 'Actualizar Factura' : 'Guardar Factura')
        }
      </Button>
    </div>
  );
}
