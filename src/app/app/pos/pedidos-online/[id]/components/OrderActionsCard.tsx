'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { OrderActions } from '@/components/pos/pedidos-online';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { useTranslations } from 'next-intl';

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
  onMarkAsPaid?: () => void;
  onCobrar?: (entregar: boolean) => void;
  sinCajaAbierta?: boolean;
  /** «Entra a Caja N · {sede} · abierta», bajo «Cobrar y entregar». */
  cajaEtiqueta?: string | null;
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
  onMarkAsPaid,
  onCobrar,
  sinCajaAbierta,
  cajaEtiqueta,
  isLoading = false,
}: OrderActionsCardProps) {
  const t = useTranslations('pedidoWeb');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="size-4" aria-hidden="true" strokeWidth={1.5} />
          {t('orderActionsCard.acciones')}
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
          onMarkAsPaid={onMarkAsPaid}
          onCobrar={onCobrar}
          sinCajaAbierta={sinCajaAbierta}
          cajaEtiqueta={cajaEtiqueta}
          isLoading={isLoading}
        />
      </CardContent>
    </Card>
  );
}
