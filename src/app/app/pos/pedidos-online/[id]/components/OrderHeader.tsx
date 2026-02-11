'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, CalendarClock, Coins, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <StatusBadge status={order.status} size="lg" />
            {order.is_scheduled && (
              <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Programado
              </Badge>
            )}
            {order.coupon_code && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Cupón: {order.coupon_code}
              </Badge>
            )}
            {order.tip_amount > 0 && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex items-center gap-1">
                <Coins className="h-3 w-3" />
                Propina: ${order.tip_amount.toLocaleString()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
            <span>{formatDateTime(order.created_at)}</span>
            {order.is_scheduled && order.scheduled_at && (
              <span className="text-sm text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Para: {formatDateTime(order.scheduled_at)}
              </span>
            )}
            {order.sale_id && (
              <Link
                href={`/app/pos/ventas/${order.sale_id}`}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ExternalLink className="h-3 w-3" />
                Ver venta POS
              </Link>
            )}
          </div>
        </div>
      </div>
      <PaymentStatusBadge status={order.payment_status} />
    </div>
  );
}
