'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import NuevoProductoForm from '@/components/inventario/productos/nuevo/NuevoProductoForm';

interface ProductoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con el producto creado; el diálogo se cierra automáticamente */
  onCreated: (product: { id: number; uuid: string; name: string; sku: string; price: number; cost: number }) => void;
}

/**
 * Diálogo compartido que reutiliza el formulario COMPLETO de producto (NuevoProductoForm).
 * Cualquier cambio en NuevoProductoForm se refleja aquí automáticamente.
 */
export function ProductoFormDialog({ open, onOpenChange, onCreated }: ProductoFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">Nuevo Producto</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Completa la información para agregar un producto al catálogo.
          </DialogDescription>
        </DialogHeader>
        <NuevoProductoForm
          embedded
          onSuccess={(product) => {
            onCreated(product);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default ProductoFormDialog;
