'use client';

/**
 * Listado de Pedidos online con «Anticipo pagado · vencido» (Figma «05 POS y ventas» › 01, 01b, 02):
 * - `PagoVencidoCelda`: la celda «Pago» con la insignia roja «Pagado · vencido» y «Devolver o
 *   reactivar» debajo.
 * - `AvisoAnticiposVencidos`: el aviso rojo arriba de la tabla (uno: con su número, cliente, monto y
 *   minutos tarde; varios: cuántos), con «Ver pedido».
 * Las horas van en la zona de la organización y los montos en su moneda.
 */
import { useTranslations } from 'next-intl';
import { AvisoTonal, StatusBadge } from '@/components/kit';
import { anticipoPagadoVencido, type PedidoAnticipoVencido } from '@/lib/pos/pedidosWeb/anticipoVencido';
import type { PedidoAnticipoVencidoFila } from '@/lib/services/anticipoVencidoCliente';

export function muestraCeldaAnticipoVencido(o: PedidoAnticipoVencido): boolean {
  return anticipoPagadoVencido(o);
}

export function PagoVencidoCelda() {
  const t = useTranslations('anticipoVencido');
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <StatusBadge estado="anticipo_pagado_vencido" etiqueta={t('lista.insignia')} tono="peligro" tamano="sm" />
      <span className="truncate text-xs text-danger-text">{t('lista.detalle')}</span>
    </div>
  );
}

export function AvisoAnticiposVencidos({
  pedidos,
  formatear,
  onVer,
}: {
  pedidos: readonly PedidoAnticipoVencidoFila[];
  formatear: (n: number) => string;
  onVer: (orderId: string) => void;
}) {
  const t = useTranslations('anticipoVencido');
  if (pedidos.length === 0) return null;
  const p = pedidos[0];
  const titulo = pedidos.length === 1
    ? t('lista.aviso', {
        numero: p.order_number,
        cliente: p.customer_name?.trim() || t('lista.cliente'),
        monto: formatear(Number(p.advance_amount) || 0),
      })
    : t('lista.avisoVarios', { n: pedidos.length });
  return (
    <AvisoTonal
      tono="peligro"
      rol="alert"
      titulo={titulo}
      accion={{ etiqueta: t('lista.verPedido'), onClick: () => onVer(p.id) }}
    />
  );
}
