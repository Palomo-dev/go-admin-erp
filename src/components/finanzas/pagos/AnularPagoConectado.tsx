'use client';

/**
 * «Anular pago» conectado (Figma `DialogoMotivo` `331:54986`): pide el motivo
 * y llama a `POST /api/pagos/[id]/anular`. La RPC pasa el pago a anulado (los
 * disparadores devuelven el saldo a la factura y a la cartera), devuelve la
 * cuota y revierte el asiento con un contra-asiento. Nunca borra.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DialogoMotivo } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import type { OrigenPago } from '@/lib/finanzas/pagos/contrato';
import { ErrorPeticionPago, enviarAnulacionPago } from '@/lib/finanzas/pagos/clientePagos';

export interface AnularPagoConectadoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** `payments.id` a anular; `null` cierra el diálogo. */
  paymentId: string | null;
  /** Monto ya formateado en la moneda del documento, para el texto. */
  montoTexto?: string;
  origen?: OrigenPago;
  onAnulado?: () => void;
}

export function AnularPagoConectado({ abierto, onAbiertoChange, paymentId, montoTexto, origen, onAnulado }: AnularPagoConectadoProps) {
  const t = useTranslations('pagos.anular');
  const tErr = useTranslations('pagos.errores');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async (motivo: string) => {
    if (!paymentId) return;
    setCargando(true);
    setError(null);
    try {
      await enviarAnulacionPago(paymentId, motivo, origen);
      toastSuccess(t('hecho'), t('hechoDescripcion'));
      onAnulado?.();
      onAbiertoChange(false);
    } catch (e) {
      const codigo = e instanceof ErrorPeticionPago ? e.codigo : 'error_desconocido';
      setError(tErr.has(codigo) ? tErr(codigo as never) : tErr('error_desconocido'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (!cargando) {
          setError(null);
          onAbiertoChange(v);
        }
      }}
      titulo={t('titulo')}
      descripcion={montoTexto ? t('descripcionMonto', { monto: montoTexto }) : t('descripcion')}
      textoConfirmar={t('confirmar')}
      onConfirmar={confirmar}
      tituloConsecuencias={t('consecuenciasTitulo')}
      consecuencias={[t('consecuencias.saldo'), t('consecuencias.asiento'), t('consecuencias.caja'), t('consecuencias.cuota')]}
      motivosRapidos={[t('rapidos.digitacion'), t('rapidos.devuelto'), t('rapidos.duplicado')]}
      cargando={cargando}
      error={error}
    />
  );
}
