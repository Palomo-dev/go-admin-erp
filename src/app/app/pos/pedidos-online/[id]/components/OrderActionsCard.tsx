'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { OrderActions } from '@/components/pos/pedidos-online';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderActionsCardProps {
  order: WebOrder;
  onConfirm: () => void;
  onReject: () => void;
  onStartPreparing: () => void;
  onMarkReady: () => void;
  onStartDelivery: () => void;
  onMarkDelivered: () => void;
  onCancel: () => void;
  onConvertToSale: () => void;
  onPrint?: () => void;
  isLoading?: boolean;
}

export function OrderActionsCard({
  order,
  onConfirm,
  onReject,
  onStartPreparing,
  onMarkReady,
  onStartDelivery,
  onMarkDelivered,
  onCancel,
  onConvertToSale,
  onPrint,
  isLoading = false,
}: OrderActionsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Acciones
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrderActions
          order={order}
          onConfirm={onConfirm}
          onReject={onReject}
          onStartPreparing={onStartPreparing}
          onMarkReady={onMarkReady}
          onStartDelivery={onStartDelivery}
          onMarkDelivered={onMarkDelivered}
          onCancel={onCancel}
          onConvertToSale={onConvertToSale}
          onPrint={onPrint}
          isLoading={isLoading}
        />
      </CardContent>
    </Card>
  );
}
