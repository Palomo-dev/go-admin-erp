'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';
import { OrderTimeline } from '@/components/pos/pedidos-online';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderTimelineCardProps {
  order: WebOrder;
}

export function OrderTimelineCard({ order }: OrderTimelineCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Historial del pedido
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrderTimeline order={order} />
      </CardContent>
    </Card>
  );
}
