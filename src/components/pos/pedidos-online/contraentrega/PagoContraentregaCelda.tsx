'use client';

/**
 * Celda «Pago» de un pedido contraentrega en el listado (Figma 3014:194407, pantalla 04):
 * insignia «Contraentrega» con «Cobrar $ X» debajo, o «Anticipo vence HH:MM» mientras el anticipo
 * está pendiente. La hora va en la zona de la organización.
 */
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { cobrarAlEntregar, esPedidoContraentrega, estadoAnticipo, type PedidoContraentrega } from '@/lib/pos/pedidosWeb/contraentregaPedido';

const CERRADOS = new Set(['cancelled', 'rejected', 'refunded', 'expired']);

/** ¿La celda de pago de este pedido es la de contraentrega? (sin pagar del todo y abierto). */
export function muestraCeldaContraentrega(o: PedidoContraentrega): boolean {
  return esPedidoContraentrega(o) && o.payment_status !== 'paid' && !CERRADOS.has(o.status ?? '');
}

export function PagoContraentregaCelda({
  pedido,
  timezone,
  formatear,
}: {
  pedido: PedidoContraentrega;
  timezone: string;
  formatear: (n: number) => string;
}) {
  const t = useTranslations('contraentregaPedidos');
  const estado = estadoAnticipo(pedido);
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <StatusBadge estado="cod" etiqueta={t('lista.insignia')} tono="informacion" tamano="sm" />
      {estado === 'pendiente' && pedido.advance_due_at ? (
        <span className="truncate text-xs text-warning-text">
          {t('lista.anticipoVence', { hora: formatTimeInTz(pedido.advance_due_at, timezone) })}
        </span>
      ) : (
        <span className="truncate text-xs text-fg-secondary">{t('lista.cobrar', { valor: formatear(cobrarAlEntregar(pedido)) })}</span>
      )}
    </div>
  );
}
