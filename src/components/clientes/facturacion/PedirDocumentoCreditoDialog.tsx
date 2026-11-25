'use client';

/**
 * Venta a crédito o con saldo pendiente sin documento del cliente (Contador, 2026-11-25): abre el
 * mismo «Editar datos de facturación» de la ficha (`EditarFacturacionDialog`), con un aviso de por
 * qué, para capturar el NIT o la cédula sin salir de la venta. Al guardar, quien lo abrió reintenta.
 * La regla vive en `@/lib/cartera/documentoCredito` y en la base (`documento_requerido_credito`).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cargarFacturacionCliente, type DatosFacturacionCliente } from '@/lib/clientes/facturacionClienteDatos';
import { EditarFacturacionDialog } from './EditarFacturacionDialog';

export interface PedirDocumentoCreditoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  /** La persona de la venta (la ficha a la que se le pide el documento). */
  clienteId: string | null;
  /** Documento guardado: la pantalla vuelve a cargar al cliente y reintenta. */
  onGuardado: () => void;
}

export function PedirDocumentoCreditoDialog({ abierto, onAbiertoChange, organizationId, clienteId, onGuardado }: PedirDocumentoCreditoDialogProps) {
  const t = useTranslations('documentoCredito');
  const [datos, setDatos] = useState<DatosFacturacionCliente | null>(null);

  useEffect(() => {
    if (!abierto || !clienteId) {
      setDatos(null);
      return;
    }
    let vivo = true;
    cargarFacturacionCliente(organizationId, clienteId)
      .then((d) => {
        if (!vivo) return;
        if (!d) {
          toast.error(t('errorCarga'));
          onAbiertoChange(false);
          return;
        }
        setDatos(d);
      })
      .catch(() => {
        if (!vivo) return;
        toast.error(t('errorCarga'));
        onAbiertoChange(false);
      });
    return () => {
      vivo = false;
    };
  }, [abierto, clienteId, organizationId, onAbiertoChange, t]);

  if (!datos) return null;
  return (
    <EditarFacturacionDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      organizationId={organizationId}
      datos={datos}
      aviso={{ titulo: t('aviso.titulo'), descripcion: t('aviso.descripcion') }}
      onGuardado={() => {
        toast.info(t('guardado'));
        onGuardado();
      }}
    />
  );
}
