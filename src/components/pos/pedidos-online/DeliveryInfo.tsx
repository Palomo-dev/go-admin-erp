'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Truck, Store, Bike, Navigation } from 'lucide-react';
import type { DeliveryType } from '@/lib/services/webOrdersService';

interface DeliveryAddress {
  address?: string;
  city?: string;
  neighborhood?: string;
  instructions?: string;
  lat?: number;
  lng?: number;
}

interface DeliveryInfoProps {
  deliveryType: DeliveryType;
  deliveryPartner?: string;
  deliveryAddress?: DeliveryAddress;
  scheduledAt?: string;
  estimatedReadyAt?: string;
  estimatedDeliveryAt?: string;
  variant?: 'card' | 'inline';
}

const DELIVERY_TYPE_CONFIG = {
  pickup: { label: 'Retiro en tienda', icon: Store, color: 'text-blue-600 dark:text-blue-400' },
  delivery_own: { label: 'Delivery propio', icon: Bike, color: 'text-green-600 dark:text-green-400' },
  delivery_third_party: { label: 'Delivery terceros', icon: Truck, color: 'text-purple-600 dark:text-purple-400' },
};

export function DeliveryInfo({
  deliveryType,
  deliveryPartner,
  deliveryAddress,
  scheduledAt,
  estimatedReadyAt,
  estimatedDeliveryAt,
  variant = 'inline',
}: DeliveryInfoProps) {
  const config = DELIVERY_TYPE_CONFIG[deliveryType];
  const Icon = config.icon;

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

  if (variant === 'card') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
            <Truck className="h-4 w-4" />
            Entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <span className="font-medium dark:text-gray-100">{config.label}</span>
            {deliveryPartner && (
              <Badge variant="outline" className="text-xs dark:text-gray-100 dark:border-gray-600">
                {deliveryPartner}
              </Badge>
            )}
          </div>

          {deliveryType !== 'pickup' && deliveryAddress?.address && (
            <div className="space-y-1">
              <p className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground dark:text-gray-400" />
                <span className="dark:text-gray-200">{deliveryAddress.address}</span>
              </p>
              {deliveryAddress.neighborhood && (
                <p className="text-sm text-muted-foreground ml-6">
                  {deliveryAddress.neighborhood}
                  {deliveryAddress.city && `, ${deliveryAddress.city}`}
                </p>
              )}
              {deliveryAddress.instructions && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 ml-6">
                  📝 {deliveryAddress.instructions}
                </p>
              )}
              {deliveryAddress.lat && deliveryAddress.lng && (
                <a
                  href={`https://maps.google.com/?q=${deliveryAddress.lat},${deliveryAddress.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline ml-6"
                >
                  <Navigation className="h-3 w-3" />
                  Ver en mapa
                </a>
              )}
            </div>
          )}

          {scheduledAt && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
              <span className="dark:text-gray-200">Programado: {formatDateTime(scheduledAt)}</span>
            </div>
          )}

          {estimatedReadyAt && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <Clock className="h-4 w-4" />
              <span className="dark:text-gray-200">Listo aprox: {formatTime(estimatedReadyAt)}</span>
            </div>
          )}

          {estimatedDeliveryAt && deliveryType !== 'pickup' && (
            <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
              <Truck className="h-4 w-4" />
              <span className="dark:text-gray-200">Entrega aprox: {formatTime(estimatedDeliveryAt)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
      <Icon className={`h-4 w-4 ${config.color}`} />
      <span className="text-sm font-medium dark:text-gray-100">{config.label}</span>
      {deliveryPartner && (
        <Badge variant="outline" className="ml-auto text-xs dark:text-gray-100 dark:border-gray-600">
          {deliveryPartner}
        </Badge>
      )}
    </div>
  );
}
