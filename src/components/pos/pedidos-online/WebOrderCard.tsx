'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  MapPin, 
  Phone, 
  User, 
  Store, 
  Truck, 
  Bike,
  CheckCircle,
  XCircle,
  ChefHat,
  Package,
  Eye
} from 'lucide-react';
import type { WebOrder, WebOrderStatus, DeliveryType } from '@/lib/services/webOrdersService';

interface WebOrderCardProps {
  order: WebOrder;
  onConfirm?: (orderId: string) => void;
  onReject?: (orderId: string) => void;
  onViewDetails?: (orderId: string) => void;
  onUpdateStatus?: (orderId: string, status: WebOrderStatus) => void;
}

const STATUS_CONFIG: Record<WebOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: <Clock className="h-3 w-3" /> },
  confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: <CheckCircle className="h-3 w-3" /> },
  preparing: { label: 'Preparando', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', icon: <ChefHat className="h-3 w-3" /> },
  ready: { label: 'Listo', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: <Package className="h-3 w-3" /> },
  in_delivery: { label: 'En camino', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: <Truck className="h-3 w-3" /> },
  delivered: { label: 'Entregado', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: <XCircle className="h-3 w-3" /> },
  rejected: { label: 'Rechazado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', icon: <XCircle className="h-3 w-3" /> },
};

const DELIVERY_TYPE_CONFIG: Record<DeliveryType, { label: string; icon: React.ReactNode }> = {
  pickup: { label: 'Retiro en tienda', icon: <Store className="h-4 w-4" /> },
  delivery_own: { label: 'Delivery propio', icon: <Bike className="h-4 w-4" /> },
  delivery_third_party: { label: 'Delivery tercero', icon: <Truck className="h-4 w-4" /> },
};

export function WebOrderCard({ 
  order, 
  onConfirm, 
  onReject, 
  onViewDetails,
  onUpdateStatus 
}: WebOrderCardProps) {
  const statusConfig = STATUS_CONFIG[order.status];
  const deliveryConfig = DELIVERY_TYPE_CONFIG[order.delivery_type];
  
  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('es-CO', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    
    if (isToday) {
      return `Hoy ${formatTime(date)}`;
    }
    return d.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeSinceOrder = () => {
    const minutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}min`;
  };

  const isPending = order.status === 'pending';
  const isUrgent = isPending && (Date.now() - new Date(order.created_at).getTime()) > 10 * 60000; // 10 min

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${isUrgent ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{order.order_number}</span>
              {isUrgent && (
                <Badge variant="destructive" className="text-xs">
                  ¡Urgente!
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(order.created_at)} • {getTimeSinceOrder()}
            </p>
          </div>
          <Badge className={`${statusConfig.color} flex items-center gap-1`}>
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        </div>

        {/* Cliente */}
        <div className="space-y-1 mb-3">
          <p className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{order.customer_name || order.customer?.full_name || 'Cliente anónimo'}</span>
          </p>
          {(order.customer_phone || order.customer?.phone) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              {order.customer_phone || order.customer?.phone}
            </p>
          )}
        </div>

        {/* Tipo de entrega */}
        <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded-lg">
          {deliveryConfig.icon}
          <span className="text-sm font-medium">{deliveryConfig.label}</span>
          {order.delivery_partner && (
            <Badge variant="outline" className="ml-auto text-xs">
              {order.delivery_partner}
            </Badge>
          )}
        </div>

        {/* Dirección (si es delivery) */}
        {order.delivery_type !== 'pickup' && order.delivery_address?.address && (
          <div className="flex items-start gap-2 mb-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{order.delivery_address.address}</span>
          </div>
        )}

        {/* Items resumen */}
        <div className="border-t pt-3 mb-3">
          <p className="text-sm text-muted-foreground mb-1">
            {order.items?.length || 0} producto(s)
          </p>
          <div className="text-sm space-y-1 max-h-20 overflow-y-auto">
            {order.items?.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="truncate">{item.quantity}x {item.product_name}</span>
                <span className="text-muted-foreground">${item.total.toLocaleString()}</span>
              </div>
            ))}
            {(order.items?.length || 0) > 3 && (
              <p className="text-xs text-muted-foreground">+{order.items!.length - 3} más...</p>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between border-t pt-3 mb-3">
          <span className="font-medium">Total</span>
          <span className="text-lg font-bold text-primary">${order.total.toLocaleString()}</span>
        </div>

        {/* Notas del cliente */}
        {order.customer_notes && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded text-sm mb-3">
            <span className="font-medium">Nota: </span>
            {order.customer_notes}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          {isPending && (
            <>
              <Button 
                size="sm" 
                className="flex-1"
                onClick={() => onConfirm?.(order.id)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirmar
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => onReject?.(order.id)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}
          
          {order.status === 'confirmed' && (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'preparing')}
            >
              <ChefHat className="h-4 w-4 mr-1" />
              Iniciar preparación
            </Button>
          )}

          {order.status === 'preparing' && (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'ready')}
            >
              <Package className="h-4 w-4 mr-1" />
              Marcar listo
            </Button>
          )}

          {order.status === 'ready' && order.delivery_type !== 'pickup' && (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'in_delivery')}
            >
              <Truck className="h-4 w-4 mr-1" />
              Enviar a domicilio
            </Button>
          )}

          {(order.status === 'ready' && order.delivery_type === 'pickup') || order.status === 'in_delivery' ? (
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus?.(order.id, 'delivered')}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Marcar entregado
            </Button>
          ) : null}

          <Button 
            size="sm" 
            variant="outline"
            onClick={() => onViewDetails?.(order.id)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
