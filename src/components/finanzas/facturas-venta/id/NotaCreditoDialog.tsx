'use client';

/**
 * Compatibilidad: el detalle viejo (`id/DetalleFactura`, que aún monta el POS
 * en `CartView`) abre la nota crédito con esta firma. Antes este diálogo
 * escribía la nota, el saldo de la factura y la cartera desde el navegador;
 * ahora delega en el diálogo nuevo, que emite por
 * `POST /api/facturas-venta/[id]/nota-credito` (`fn_nota_credito_emitir`, una
 * transacción, permiso en el servidor). Se retira cuando el POS monte
 * `DetalleFacturaVenta`.
 */
import { NotaCreditoVentaDialog } from '../detalle/NotaCreditoVentaDialog';

interface NotaCreditoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: { id: string; number?: string | null };
  /** Ya no se usa: las líneas y lo disponible los da el servidor. */
  items?: unknown[];
  onSuccess?: () => void;
}

export function NotaCreditoDialog({ open, onOpenChange, factura, onSuccess }: NotaCreditoDialogProps) {
  return (
    <NotaCreditoVentaDialog
      abierto={open}
      onAbiertoChange={onOpenChange}
      facturaId={factura.id}
      numero={factura.number ?? ''}
      onEmitida={onSuccess}
    />
  );
}
