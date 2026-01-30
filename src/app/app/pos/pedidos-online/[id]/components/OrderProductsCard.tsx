'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Receipt } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { OrderItemsList, OrderTotals } from '@/components/pos/pedidos-online';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderProductsCardProps {
  order: WebOrder;
}

export function OrderProductsCard({ order }: OrderProductsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Productos ({order.items?.length || 0})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrderItemsList items={order.items || []} showStatus />
        <Separator className="my-4" />
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
