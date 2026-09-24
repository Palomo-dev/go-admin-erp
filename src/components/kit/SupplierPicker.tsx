'use client';

import { Truck } from 'lucide-react';
import { SelectorEntidad, type SelectorEntidadProps } from './SelectorEntidad';
import { opcionProveedor, type ProveedorPicker } from './selectorEntidadLogica';
import { useKitT } from './useIdiomaKit';

export { opcionProveedor, type ProveedorPicker };

/**
 * Selector de proveedor (Figma `SupplierPicker`, Layout popover · dialog ·
 * inline · field · sheet): factura de compra, órdenes de compra, documento
 * soporte, lotes y el filtro «Proveedor». Misma base que `CustomerPicker`;
 * el saldo por pagar (`proveedor_resumen`) llega ya formateado y se pinta
 * como chip junto al elegido.
 */
export interface SupplierPickerProps
  extends Omit<SelectorEntidadProps<ProveedorPicker>, 'valor' | 'aOpcion' | 'icono' | 'etiqueta' | 'insigniaValor'> {
  proveedor: ProveedorPicker | null | undefined;
  etiqueta?: string;
}

export function SupplierPicker({ proveedor, etiqueta, textos, layout = 'campo', ...resto }: SupplierPickerProps) {
  const t = useKitT();
  const saldo = proveedor?.saldoPorPagar;
  return (
    <SelectorEntidad<ProveedorPicker>
      {...resto}
      layout={layout}
      valor={proveedor}
      aOpcion={opcionProveedor}
      icono={Truck}
      etiqueta={etiqueta ?? t('picker.proveedor.etiqueta')}
      insigniaValor={
        saldo ? (
          <span className="inline-flex h-5 items-center rounded-full border border-line-warning bg-warning-subtle px-2 text-[11px] font-medium tabular-nums text-warning-text">
            {t('picker.proveedor.saldo', { saldo })}
          </span>
        ) : undefined
      }
      textos={{
        placeholder: t('picker.proveedor.placeholder'),
        buscar: t('picker.proveedor.buscar'),
        vacio: t('picker.proveedor.vacio'),
        crear: (texto) => t('picker.proveedor.crear', { texto }),
        ...textos,
      }}
    />
  );
}
