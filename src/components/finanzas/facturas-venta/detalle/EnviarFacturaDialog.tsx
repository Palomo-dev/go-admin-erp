'use client';

/**
 * «Enviar» la factura por correo (antes era un aviso): el PDF lo arma el motor
 * de documentos y el correo sale por el canal transaccional del CRM
 * (`POST /api/facturas-venta/[id]/enviar`). WhatsApp queda para el enlace
 * firmado del motor (D6), que aún no existe.
 *
 * Envoltura del diálogo genérico `EnviarDocumentoDialog` (mismo contrato
 * `{ para, mensaje, clave }`, mismos textos de `facturasVenta.enviar`).
 */
import { useTranslations } from 'next-intl';
import { EnviarDocumentoDialog } from '@/components/finanzas/documento/EnviarDocumentoDialog';

export interface EnviarFacturaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  facturaId: string;
  numero: string;
  correo?: string | null;
}

export function EnviarFacturaDialog({ abierto, onAbiertoChange, facturaId, numero, correo }: EnviarFacturaDialogProps) {
  const t = useTranslations('facturasVenta.enviar');
  return (
    <EnviarDocumentoDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      endpoint={`/api/facturas-venta/${encodeURIComponent(facturaId)}/enviar`}
      tipoClave="factura"
      correo={correo}
      textos={{
        titulo: t('titulo', { numero }),
        descripcion: t('descripcion'),
        enviado: t('enviado'),
        enviadoA: (destino) => t('enviadoA', { destino }),
        enviadoSinAdjunto: (destino) => t('enviadoSinAdjunto', { destino }),
      }}
      mensajeError={(codigo) => {
        const k = `errores.${codigo}`;
        return t.has(k) ? t(k as never) : t('errores.error_desconocido');
      }}
    />
  );
}
