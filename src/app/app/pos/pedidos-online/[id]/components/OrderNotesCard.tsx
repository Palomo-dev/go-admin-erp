'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderNotesCardProps {
  order: WebOrder;
}

export function OrderNotesCard({ order }: OrderNotesCardProps) {
  if (!order.customer_notes && !order.internal_notes) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Notas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {order.customer_notes && (
          <div className={cn(
            "p-3 rounded-lg",
            "bg-yellow-50 dark:bg-yellow-900/20"
          )}>
            <p className="text-sm font-medium mb-1">Nota del cliente:</p>
            <p className="text-sm">{order.customer_notes}</p>
          </div>
        )}
        {order.internal_notes && (
          <div className={cn(
            "p-3 rounded-lg",
            "bg-muted"
          )}>
            <p className="text-sm font-medium mb-1">Notas internas:</p>
            <p className="text-sm">{order.internal_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
