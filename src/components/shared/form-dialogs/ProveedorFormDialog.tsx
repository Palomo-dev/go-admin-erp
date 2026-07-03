'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NuevoProveedorForm } from '@/components/inventario/proveedores/nuevo';

interface ProveedorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con el proveedor creado; el diálogo se cierra automáticamente */
  onCreated: (supplier: any) => void;
}

/**
 * Diálogo compartido que reutiliza el formulario COMPLETO de proveedor (NuevoProveedorForm).
 * Cualquier cambio en NuevoProveedorForm se refleja aquí automáticamente.
 */
export function ProveedorFormDialog({ open, onOpenChange, onCreated }: ProveedorFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">Nuevo Proveedor</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Registra un nuevo proveedor en el sistema.
          </DialogDescription>
        </DialogHeader>
        <NuevoProveedorForm
          embedded
          onSuccess={(supplier) => {
            onCreated(supplier);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default ProveedorFormDialog;
