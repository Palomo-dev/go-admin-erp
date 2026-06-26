'use client';

import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  XCircle, 
  Timer, 
  Package, 
  Truck, 
  Printer,
  Receipt,
  Loader2,
  DollarSign,
} from 'lucide-react';
import type { WebOrder, WebOrderStatus } from '@/lib/services/webOrdersService';

interface OrderActionsProps {
  order: WebOrder;
  onConfirm?: () => void;
  onReject?: () => void;
  onStartPreparing?: () => void;
  onMarkReady?: () => void;
  onStartDelivery?: () => void;
  onMarkDelivered?: () => void;
  onCancel?: () => void;
  onConvertToSale?: () => void;
  onPrint?: () => void;
  onMarkAsPaid?: () => void;
  isLoading?: boolean;
  variant?: 'full' | 'compact';
}

export function OrderActions({
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
  isLoading = false,
  variant = 'full',
}: OrderActionsProps) {
  const isPending = order.status === 'pending';
  const isConfirmed = order.status === 'confirmed';
  const isPreparing = order.status === 'preparing';
  const isReady = order.status === 'ready';
  const isInDelivery = order.status === 'in_delivery';
  const isDelivered = order.status === 'delivered';
  const isPickup = order.delivery_type === 'pickup';
  const canCancel = ['pending', 'confirmed'].includes(order.status);
  const canConvertToSale = isDelivered && !order.sale_id;

  if (variant === 'compact') {
    return (
      <div className="flex gap-2">
        {isPending && (
          <>
            <Button size="sm" onClick={onConfirm} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject} disabled={isLoading}>
              <XCircle className="h-4 w-4" />
            </Button>
          </>
        )}
        {isConfirmed && (
          <Button size="sm" onClick={onStartPreparing} disabled={isLoading}>
            <ChefHat className="h-4 w-4" />
          </Button>
        )}
        {isPreparing && (
          <Button size="sm" onClick={onMarkReady} disabled={isLoading}>
            <Package className="h-4 w-4" />
          </Button>
        )}
        {isReady && !isPickup && (
          <Button size="sm" onClick={onStartDelivery} disabled={isLoading}>
            <Truck className="h-4 w-4" />
          </Button>
        )}
        {((isReady && isPickup) || isInDelivery) && (
          <Button size="sm" onClick={onMarkDelivered} disabled={isLoading}>
            <CheckCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Acciones principales según estado */}
      {isPending && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Confirmar pedido
          </Button>
          <Button variant="destructive" onClick={onReject} disabled={isLoading}>
            <XCircle className="h-4 w-4 mr-2" />
            Rechazar
          </Button>
        </div>
      )}

      {isConfirmed && (
        <Button className="w-full" onClick={onStartPreparing} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Timer className="h-4 w-4 mr-2" />
          )}
          Iniciar preparación
        </Button>
      )}

      {isPreparing && (
        <Button className="w-full" onClick={onMarkReady} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Package className="h-4 w-4 mr-2" />
          )}
          Marcar como listo
        </Button>
      )}

      {isReady && !isPickup && (
        <Button className="w-full" onClick={onStartDelivery} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Truck className="h-4 w-4 mr-2" />
          )}
          Enviar a domicilio
        </Button>
      )}

      {((isReady && isPickup) || isInDelivery) && (
        <Button className="w-full" onClick={onMarkDelivered} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Marcar como entregado
        </Button>
      )}

      {/* Marcar como pagado (si no está pagado) */}
      {order.payment_status !== 'paid' && onMarkAsPaid && !isPending && (
        <Button
          variant="outline"
          className="w-full border-green-600 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
          onClick={onMarkAsPaid}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <DollarSign className="h-4 w-4 mr-2" />
          )}
          Marcar como pagado
        </Button>
      )}

      {/* Acción para convertir a venta */}
      {canConvertToSale && (
        <Button 
          variant="secondary" 
          className="w-full" 
          onClick={onConvertToSale} 
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Receipt className="h-4 w-4 mr-2" />
          )}
          Crear venta
        </Button>
      )}

      {/* Acciones secundarias */}
      <div className="flex gap-2">
        {onPrint && (
          <Button variant="outline" className="flex-1 dark:border-gray-600" onClick={onPrint}>
            <Printer className="h-4 w-4 mr-2 dark:text-gray-300" />
            Imprimir
          </Button>
        )}
        {canCancel && onCancel && (
          <Button variant="outline" className="flex-1 text-red-600 dark:text-red-400 dark:border-gray-600" onClick={onCancel}>
            <XCircle className="h-4 w-4 mr-2 dark:text-red-400" />
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
