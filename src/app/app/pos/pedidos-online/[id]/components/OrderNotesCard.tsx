'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { notasInternasVisibles } from '@/components/pos/pedidos-online/notasPedido';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderNotesCardProps {
  order: WebOrder;
  /** Comanda de cocina del pedido (`kitchen_tickets.id`), si ya salió. */
  comandaId?: number | null;
}

export function OrderNotesCard({ order, comandaId = null }: OrderNotesCardProps) {
  const t = useTranslations('pedidoWeb');
  const notasInternas = notasInternasVisibles(order.internal_notes);
  // «Para cocina» (Figma 1981:175699): las notas de línea que salen en la comanda.
  const paraCocina = (order.items ?? [])
    .filter((item) => item.notes?.trim())
    .map((item) => `${item.product_name}: ${item.notes?.trim()}`);

  if (!order.customer_notes && !notasInternas && paraCocina.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-gray-100">
          <FileText className="h-5 w-5 dark:text-gray-300" />
          Notas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {order.customer_notes && (
          <div className={cn(
            "p-3 rounded-lg",
            "bg-yellow-50 dark:bg-yellow-900/20"
          )}>
            <p className="text-sm font-medium mb-1 dark:text-yellow-200">Nota del cliente:</p>
            <p className="text-sm dark:text-yellow-100">{order.customer_notes}</p>
          </div>
        )}
        {paraCocina.length > 0 && (
          <div className="rounded-lg bg-subtle p-3 text-sm text-fg">
            <p className="font-medium mb-1">
              {comandaId ? t('notas.paraCocinaComanda', { comanda: comandaId }) : t('notas.paraCocina')}
            </p>
            {paraCocina.map((linea) => (
              <p key={linea}>{linea}</p>
            ))}
          </div>
        )}
        {notasInternas && (
          <div className={cn(
            "p-3 rounded-lg",
            "bg-muted"
          )}>
            <p className="text-sm font-medium mb-1 dark:text-gray-100">Notas internas:</p>
            <p className="text-sm whitespace-pre-line dark:text-gray-200">{notasInternas}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
