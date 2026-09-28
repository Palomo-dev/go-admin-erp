'use client';

/**
 * Compatibilidad: el detalle viejo (`id/DetalleFactura`, que aún monta el POS
 * en `CartView`) anula con esta firma. Antes este diálogo escribía el estado de
 * la factura, la cartera y el kardex desde el navegador; ahora usa
 * `DialogoMotivo` del kit y `POST /api/facturas-venta/[id]/anular`
 * (`fn_factura_venta_anular`: reglas L4 en la base, inventario y seriales de
 * vuelta, cartera 'cancelled' y contra-asiento por disparador). Se retira
 * cuando el POS monte `DetalleFacturaVenta`.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DialogoMotivo } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { ErrorPeticionFactura, anularFacturaVenta } from '@/lib/finanzas/ventas/clienteFacturas';

interface AnularFacturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: { id: string; number?: string | null };
  onSuccess?: () => void;
}

export function AnularFacturaDialog({ open, onOpenChange, factura, onSuccess }: AnularFacturaDialogProps) {
  const t = useTranslations('facturasVenta');
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anular = async (motivo: string) => {
    setAnulando(true);
    setError(null);
    try {
      await anularFacturaVenta(factura.id, motivo);
      toastSuccess(t('anular.hecho'), t('anular.hechoDescripcion', { numero: factura.number ?? '' }));
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      const k = `errores.${e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido'}`;
      setError(t.has(k) ? t(k as never) : t('errores.error_desconocido'));
    } finally {
      setAnulando(false);
    }
  };

  return (
    <DialogoMotivo
      abierto={open}
      onAbiertoChange={(v) => {
        if (!anulando) {
          setError(null);
          onOpenChange(v);
        }
      }}
      titulo={t('anular.titulo', { numero: factura.number ?? '' })}
      descripcion={t('anular.descripcion')}
      textoConfirmar={t('anular.confirmar')}
      onConfirmar={anular}
      tituloConsecuencias={t('anular.consecuenciasTitulo')}
      consecuencias={[t('anular.consecuencias.cartera'), t('anular.consecuencias.asiento'), t('anular.consecuencias.inventario')]}
      motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.cliente'), t('anular.rapidos.duplicada')]}
      cargando={anulando}
      error={error}
    />
  );
}
