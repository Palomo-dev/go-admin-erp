'use client';

/**
 * Anular una venta (Figma `331:54986`): motivo obligatorio y la lista de lo
 * que se revierte, sobre `DialogoMotivo` del kit. Sustituye a los
 * `confirm()`/`prompt()`/`alert()` del listado y del detalle.
 *
 * Una sola llamada a `pos_anular_venta_v1` (`anularVentaEnServidor`, del
 * agente de cobro): permiso `pos.void`, pagos, stock, nota crédito, propinas,
 * comisiones y asientos en una transacción. El resultado y los errores se
 * traducen con los textos de `posCobroServidor`, los mismos del POS.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
import { DialogoMotivo } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { anularVentaEnServidor, type ResultadoAnulacion } from '@/lib/pos/anularVenta';
import { avisoAnulacion, mensajeErrorCobro } from '@/lib/pos/erroresCobro';

export interface AnularVentaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  venta: { id: string; numero: string | null; facturada: boolean } | null;
  onAnulada?: (resultado: ResultadoAnulacion) => void;
}

export function AnularVentaDialog({ abierto, onAbiertoChange, venta, onAnulada }: AnularVentaDialogProps) {
  const t = useTranslations('posVentas.anular');
  const tCobro = useTranslations('posCobroServidor');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (v: boolean) => {
    if (enviando) return;
    if (!v) setError(null);
    onAbiertoChange(v);
  };

  const confirmar = async (motivo: string) => {
    if (!venta) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await anularVentaEnServidor(venta.id, motivo);
      toastSuccess(avisoAnulacion(r.avisos, tCobro));
      setEnviando(false);
      onAbiertoChange(false);
      onAnulada?.(r);
    } catch (e) {
      setError(mensajeErrorCobro(e, tCobro, tCobro('anulacionFallida')));
      setEnviando(false);
    }
  };

  const consecuencias = [t('revierte.pagos'), t('revierte.inventario'), ...(venta?.facturada ? [t('revierte.notaCredito')] : []), t('revierte.comisiones'), t('revierte.asientos')];

  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={cambiar}
      titulo={venta?.numero ? t('tituloNumero', { numero: venta.numero }) : t('titulo')}
      descripcion={t('descripcion')}
      textoConfirmar={t('confirmar')}
      onConfirmar={confirmar}
      tituloConsecuencias={t('tituloRevierte')}
      consecuencias={consecuencias}
      motivosRapidos={[t('motivos.error'), t('motivos.cliente'), t('motivos.duplicada')]}
      etiquetaMotivo={t('motivo')}
      destructiva
      cargando={enviando}
      error={error}
      icono={Ban}
    />
  );
}
