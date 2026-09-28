'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ProductoForm } from '@/components/inventario/productos/formulario/ProductoForm';

interface ProductoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con el producto creado; el diálogo se cierra automáticamente */
  onCreated: (product: { id: number; uuid: string; name: string; sku: string; price: number; cost: number }) => void;
}

/**
 * Diálogo compartido (crear producto desde facturas y buscadores) con el
 * formulario único de producto (`ProductoForm` en `layout="dialog"`): la
 * misma validación y el mismo guardado transaccional que la página «Nuevo».
 */
export function ProductoFormDialog({ open, onOpenChange, onCreated }: ProductoFormDialogProps) {
  const t = useTranslations('productoForm.general');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 text-fg sm:max-h-[90vh] sm:max-w-7xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-semibold leading-6 text-fg">{t('tituloCrear')}</DialogTitle>
            <DialogDescription className="text-sm leading-5 text-fg-secondary">{t('dialogoDescripcion')}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label={t('cerrar')}
            onClick={() => onOpenChange(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-subtle">
          {open && (
            <ProductoForm
              modo="crear"
              layout="dialog"
              onSuccess={(product) => {
                onCreated(product);
                onOpenChange(false);
              }}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProductoFormDialog;
