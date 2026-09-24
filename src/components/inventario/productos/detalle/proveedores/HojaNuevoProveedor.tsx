'use client';

import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ProveedorForm } from '@/components/inventario/proveedores/ProveedorForm';
import type { Supplier } from '@/lib/services/supplierService';

/**
 * Alta rápida de proveedor en una hoja lateral: el mismo `ProveedorForm` del
 * módulo de proveedores en modo embebido (no se duplica el formulario). Al
 * crear, entrega el proveedor para seleccionarlo donde se abrió.
 *
 * La hoja vive en un portal, pero los eventos de React suben por el árbol de
 * componentes: se corta el `submit` aquí para que no dispare el formulario
 * del producto que la contiene.
 */
export function HojaNuevoProveedor({
  abierto,
  onAbiertoChange,
  onCreado,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onCreado: (proveedor: Supplier) => void;
}) {
  const t = useTranslations('productoDetalle.proveedores');
  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="right" className="w-full border-line bg-canvas p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-line bg-surface px-5 py-4 text-left">
          <SheetTitle className="text-lg font-semibold text-fg">{t('nuevo.titulo')}</SheetTitle>
          <SheetDescription className="text-sm text-fg-secondary">{t('nuevo.descripcion')}</SheetDescription>
        </SheetHeader>
        <div onSubmit={(e) => e.stopPropagation()}>
          {abierto && (
            <ProveedorForm
              modo="nuevo"
              embedded
              onSuccess={(p) => {
                onCreado(p);
                onAbiertoChange(false);
              }}
              onCancel={() => onAbiertoChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
