'use client';

import { useTranslations } from 'next-intl';
import { FormularioRapidoProducto } from '@/components/kit/documento/FormularioRapidoProducto';
import { useImpuestosOrganizacion } from '@/components/finanzas/documento/productos';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { crearProductoRapido } from '@/lib/services/documentos/edicionDocumento';

/**
 * «Crear ingrediente» de la receta (Figma kit `QuickCreateDialog` 590:107156):
 * el alta rápida única (`kit/documento/FormularioRapidoProducto`, la de
 * «Agregar productos» de compras y ventas) en variante de compra —nombre, SKU,
 * costo, impuesto y «Controla inventario»— por `fn_producto_guardar`. Antes se
 * abría el formulario completo de producto dentro de un diálogo.
 */
export interface DialogoIngredienteRapidoProps {
  organizacionId: number;
  /** Lo escrito en el buscador de ingredientes. */
  texto: string;
  codigoMoneda: string;
  onCreado: (productoId: number) => void;
  onCerrar: () => void;
}

export function DialogoIngredienteRapido({ organizacionId, texto, codigoMoneda, onCreado, onCerrar }: DialogoIngredienteRapidoProps) {
  const t = useTranslations('productoForm.ingredienteRapido');
  const { impuestos } = useImpuestosOrganizacion();
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('titulo')}</DialogTitle>
          <DialogDescription>{t('descripcion')}</DialogDescription>
        </DialogHeader>
        <FormularioRapidoProducto
          variante="compra"
          texto={texto}
          moneda={codigoMoneda}
          impuestos={impuestos}
          onCrear={(d) => crearProductoRapido(organizacionId, 'compra', d, null, impuestos)}
          onCreado={(p) => onCreado(p.id)}
          onCancelar={onCerrar}
        />
      </DialogContent>
    </Dialog>
  );
}
