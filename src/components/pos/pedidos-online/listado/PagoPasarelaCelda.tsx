'use client';

/**
 * Celda «Pago» de un pedido de pasarela sin pagar en el listado (diseño 2026-11-24, captura 04):
 * «Pago rechazado» (con «Wompi · vence 15:22» debajo), «Pago en proceso», «Esperando pago»
 * («Bold · vence 15:20») o «Venció sin pagar» («Bold · sin intentos» / «N intentos»). Antes todo
 * esto era «Pago fallido». El vencimiento y los intentos salen de `fn_web_orders_resumen_pago`,
 * por lotes (una llamada por página); la hora, en la zona de la organización.
 */
import { useTranslations } from 'next-intl';
import { StatusBadge, type TonoBadge } from '@/components/kit';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import { celdaPasarela, muestraCeldaPasarela, type ClaveCeldaPasarela } from '@/lib/pos/pedidosWeb/intentosPago';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { useResumenPago } from '@/components/pos/pedidos-online/pagos/resumenPagoLotes';

export { muestraCeldaPasarela };

const TONO: Record<ClaveCeldaPasarela, TonoBadge> = {
  rechazado: 'peligro',
  enProceso: 'informacion',
  esperando: 'advertencia',
  vencido: 'peligro',
};

export function PagoPasarelaCelda({ pedido, timezone }: { pedido: WebOrder; timezone: string }) {
  const t = useTranslations('pagosIntentos');
  const resumen = useResumenPago(pedido.id, pedido.updated_at);
  const celda = celdaPasarela(pedido, resumen);
  const pasarela = celda.pasarela ?? metodoDePago(pedido);
  let linea: string;
  if (celda.clave === 'vencido') {
    linea = celda.intentos === null
      ? pasarela
      : celda.intentos === 0
        ? t('lista.sinIntentos', { pasarela })
        : t('lista.nIntentos', { pasarela, n: celda.intentos });
  } else {
    linea = celda.venceAt ? t('lista.vence', { pasarela, hora: formatTimeInTz(celda.venceAt, timezone) }) : pasarela;
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <StatusBadge estado={`pago_${celda.clave}`} etiqueta={t(`lista.${celda.clave}`)} tono={TONO[celda.clave]} tamano="sm" />
      <span className="truncate text-xs text-fg-secondary tabular-nums">{linea}</span>
    </div>
  );
}
