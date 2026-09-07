'use client';

import React from 'react';
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
 * Usa el mismo patrón visual y funcional del modal de "Nueva Sucursal" (div custom).
 */
export function ProductoFormDialog({ open, onOpenChange, onCreated }: ProductoFormDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[97vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50">
                Nuevo Producto
              </h2>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                Completa la información para agregar un producto al catálogo.
              </p>
            </div>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700"
              onClick={() => onOpenChange(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-900">
            <NuevoProductoForm
              embedded
              onSuccess={(product) => {
                onCreated(product);
                onOpenChange(false);
              }}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductoFormDialog;
