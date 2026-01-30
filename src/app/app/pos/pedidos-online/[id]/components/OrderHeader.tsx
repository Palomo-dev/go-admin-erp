'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/utils/Utils';
import { StatusBadge, PaymentStatusBadge } from '@/components/pos/pedidos-online';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderHeaderProps {
  order: WebOrder;
}

export function OrderHeader({ order }: OrderHeaderProps) {
  const router = useRouter();

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <StatusBadge status={order.status} size="lg" />
          </div>
          <p className="text-muted-foreground">
            {formatDateTime(order.created_at)}
          </p>
        </div>
      </div>
      <PaymentStatusBadge status={order.payment_status} />
    </div>
  );
}
