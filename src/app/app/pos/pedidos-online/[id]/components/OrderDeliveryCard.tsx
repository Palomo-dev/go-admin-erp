'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Truck, Store, Bike, Navigation, UserPlus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { DeliveryTrackingCard } from '@/components/pos/pedidos-online';
import type { WebOrder, DeliveryType } from '@/lib/services/webOrdersService';

interface OrderDeliveryCardProps {
  order: WebOrder;
  onAssignDelivery?: () => void;
  showTracking?: boolean;
}

const DELIVERY_TYPE_CONFIG: Record<DeliveryType, { 
  label: string; 
  icon: typeof Store;
  color: string;
}> = {
  pickup: { 
    label: 'Retiro en tienda', 
    icon: Store, 
    color: 'text-blue-600' 
  },
  delivery_own: { 
    label: 'Delivery propio', 
    icon: Bike, 
    color: 'text-green-600' 
  },
  delivery_third_party: { 
    label: 'Delivery terceros', 
    icon: Truck, 
    color: 'text-purple-600' 
  },
};

export function OrderDeliveryCard({ order, onAssignDelivery, showTracking = true }: OrderDeliveryCardProps) {
  const config = DELIVERY_TYPE_CONFIG[order.delivery_type];
  const Icon = config.icon;
  const address = order.delivery_address;
  const isOwnDelivery = order.delivery_type === 'delivery_own';
  const canAssignDelivery = isOwnDelivery && ['confirmed', 'preparing', 'ready'].includes(order.status);
  const shouldShowTracking = isOwnDelivery && showTracking && ['in_delivery', 'delivered'].includes(order.status);

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const baseCard = (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tipo de entrega */}
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", config.color)} />
          <span className="font-medium">{config.label}</span>
          {order.delivery_partner && (
            <Badge variant="outline" className="text-xs ml-auto">
              {order.delivery_partner}
            </Badge>
          )}
        </div>

        {/* Dirección de entrega */}
        {order.delivery_type !== 'pickup' && address?.address && (
          <div className="space-y-1">
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <span>{address.address}</span>
            </p>
            {address.neighborhood && (
              <p className="text-sm text-muted-foreground ml-6">
                {address.neighborhood}
                {address.city && `, ${address.city}`}
              </p>
            )}
            {address.instructions && (
              <p className="text-sm text-yellow-600 ml-6">
                📝 {address.instructions}
              </p>
            )}
            {address.lat && address.lng && (
              <a
                href={`https://maps.google.com/?q=${address.lat},${address.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-1 text-sm ml-6",
                  "text-blue-600 hover:underline"
                )}
              >
                <Navigation className="h-3 w-3" />
                Ver en mapa
              </a>
            )}
          </div>
        )}

        {/* Tiempos estimados */}
        {order.scheduled_at && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>Programado: {formatDateTime(order.scheduled_at)}</span>
          </div>
        )}

        {order.estimated_ready_at && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Clock className="h-4 w-4" />
            <span>Listo aprox: {formatTime(order.estimated_ready_at)}</span>
          </div>
        )}

        {order.estimated_delivery_at && order.delivery_type !== 'pickup' && (
          <div className="flex items-center gap-2 text-sm text-purple-600">
            <Truck className="h-4 w-4" />
            <span>Entrega aprox: {formatTime(order.estimated_delivery_at)}</span>
          </div>
        )}

        {/* Botón para asignar delivery propio */}
        {canAssignDelivery && onAssignDelivery && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={onAssignDelivery}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Asignar Conductor
          </Button>
        )}
      </CardContent>
    </Card>
  );

  // Si es delivery propio y está en tránsito o entregado, mostrar tracking
  if (shouldShowTracking) {
    return (
      <div className="space-y-4">
        {baseCard}
        <DeliveryTrackingCard
          webOrderId={order.id}
          onAssignClick={onAssignDelivery}
        />
      </div>
    );
  }

  return baseCard;
}
