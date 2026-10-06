'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { OrderTimeline } from '@/components/pos/pedidos-online';
import { ChipsAvisos, useAvisosPedido } from '@/components/pos/pedidos-online/avisos/AvisosPedidoPanel';
import type { AvisoDePedido } from '@/components/pos/pedidos-online/avisos/avisosClienteApi';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderTimelineCardProps {
  order: WebOrder;
  /** Zona horaria de la organización. */
  timezone: string;
}

/**
 * «Historial del pedido» (Figma 1981:175699): cada paso con su hora en la zona
 * de la organización y, debajo, los avisos al cliente que disparó (465:85608)
 * con «Reenviar» cuando fallaron.
 */
export function OrderTimelineCard({ order, timezone }: OrderTimelineCardProps) {
  const t = useTranslations('posAvisosCliente.historial');
  const { avisos, reenviando, reenviar } = useAvisosPedido(order.id, `${order.status}-${order.updated_at ?? ''}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-5" strokeWidth={1.5} aria-hidden="true" />
          {t('historialPedido')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrderTimeline<AvisoDePedido>
          order={order}
          timezone={timezone}
          avisos={avisos}
          renderAvisos={(lista) => <ChipsAvisos avisos={lista} timezone={timezone} reenviando={reenviando} onReenviar={(c) => void reenviar(c)} />}
        />
      </CardContent>
    </Card>
  );
}
