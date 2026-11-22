'use client';

/**
 * «Crear devolución» desde la venta (V4 de CAJAS-VENTAS-PLAN): abre el diálogo
 * de devoluciones (`CrearDevolucionDialog`, rediseño de Figma `874:578120`),
 * que carga la venta con `DevolucionesService.obtenerDetalleVenta(ventaId)` y
 * llama a `procesar_devolucion` en una transacción. Antes el botón navegaba a
 * `/app/pos/devoluciones/nuevo?sale_id=…`, ruta que no existe.
 * Aquí no se calcula ni se escribe nada de la devolución.
 */
import { CrearDevolucionDialog } from '@/components/pos/devoluciones/CrearDevolucionDialog';

export interface DevolucionPanelProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ventaId: string;
  /** Número de la factura de la venta (el diálogo lo vuelve a leer con la venta). */
  numero: string | null;
  onDevuelta: () => void;
}

export function DevolucionPanel({ abierto, onAbiertoChange, ventaId, onDevuelta }: DevolucionPanelProps) {
  if (!abierto) return null;
  return (
    <CrearDevolucionDialog
      abierto
      onAbiertoChange={onAbiertoChange}
      ventaId={ventaId}
      onDevuelta={() => {
        onAbiertoChange(false);
        onDevuelta();
      }}
    />
  );
}
