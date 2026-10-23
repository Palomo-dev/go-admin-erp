'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Receipt } from 'lucide-react';
import { OrderItemsList, OrderTotals } from '@/components/pos/pedidos-online';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';

interface OrderProductsCardProps {
  order: WebOrder;
  /** `pos.promotions.remove` o administrador. Sin esto, la acción no se muestra. */
  puedeQuitarPromocion?: boolean;
  onCambio?: () => void;
}

export function OrderProductsCard({ order, puedeQuitarPromocion = false, onCambio }: OrderProductsCardProps) {
  const t = useTranslations('pedidoWeb');
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const yaPagado = order.payment_status === 'paid';

  const cambiar = async (itemId: string, excluded: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/pos/pedidos-web/${order.id}/promocion-linea`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, excluded }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok) {
        const clave = data.code === 'pedido_ya_pagado'
          ? 'promocionLinea.yaPagado'
          : data.code === 'sin_permiso'
            ? 'promocionLinea.sinPermiso'
            : data.code === 'lineas_venta_no_coinciden'
              ? 'promocionLinea.lineasDistintas'
              : 'promocionLinea.error';
        toast({ title: t('promocionLinea.error'), description: t(clave), variant: 'destructive' });
        return;
      }
      onCambio?.();
    } catch {
      toast({ title: t('promocionLinea.error'), description: t('promocionLinea.error'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4" aria-hidden="true" strokeWidth={1.5} />
          {t('orderProductsCard.productos', { n: order.items?.length || 0 })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {yaPagado && (
          <p className="mb-3 rounded-lg border border-line bg-subtle px-3 py-2 text-[13px] text-fg-secondary">
            {t('promocionLinea.yaPagado')}
          </p>
        )}
        <OrderItemsList
          items={order.items || []}
          showStatus
          puedeQuitarPromocion={puedeQuitarPromocion && !yaPagado && !ocupado}
          onQuitarPromocion={(id) => void cambiar(id, true)}
          onRestaurarPromocion={(id) => void cambiar(id, false)}
        />
        <Separator className="my-3" />
        <OrderTotals
          subtotal={order.subtotal}
          taxTotal={order.tax_total}
          discountTotal={order.discount_total}
          deliveryFee={order.delivery_fee}
          tipAmount={order.tip_amount}
          total={order.total}
        />
      </CardContent>
    </Card>
  );
}
