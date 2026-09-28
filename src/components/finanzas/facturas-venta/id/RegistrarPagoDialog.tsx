'use client';

/**
 * Compatibilidad: el detalle viejo (`id/DetalleFactura`, que aún monta el POS
 * en `CartView`) y `PagosFactura` registran el pago con esta firma. Antes este
 * diálogo insertaba en `payments` y escribía el saldo de la factura desde el
 * navegador; ahora delega en el pago único (`POST /api/pagos`,
 * `fn_registrar_pago`: caja abierta para efectivo, idempotencia, permiso en el
 * servidor; los disparadores mueven saldo y cartera). Se retira cuando el POS
 * monte `DetalleFacturaVenta`.
 */
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';

interface RegistrarPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: { id?: string | number; [campo: string]: unknown };
  onSuccess?: () => void;
}

export function RegistrarPagoDialog({ open, onOpenChange, factura, onSuccess }: RegistrarPagoDialogProps) {
  if (factura.id == null) return null;
  return (
    <RegistrarPagoConectado
      abierto={open}
      onAbiertoChange={onOpenChange}
      destino={{ tipo: 'factura', id: String(factura.id) }}
      origen="factura_venta"
      onRegistrado={() => onSuccess?.()}
    />
  );
}
