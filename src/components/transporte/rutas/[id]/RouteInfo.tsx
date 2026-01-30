'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Clock, DollarSign, Truck, Route as RouteIcon } from 'lucide-react';
import { TransportRoute } from '@/lib/services/transportRoutesService';

interface RouteInfoProps {
  route: TransportRoute;
}

export function RouteInfo({ route }: RouteInfoProps) {
  const formatDuration = (minutes?: number) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Distancia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {route.estimated_distance_km ? `${route.estimated_distance_km.toFixed(1)} km` : '-'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Duración
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatDuration(route.estimated_duration_minutes)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Tarifa Base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {route.base_fare ? `$${route.base_fare.toLocaleString()}` : '-'}
          </p>
          {route.base_shipping_fee && route.base_shipping_fee > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Envío: ${route.base_shipping_fee.toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <RouteIcon className="h-4 w-4" />
            Paradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {route.route_stops?.length || 0}
          </p>
          {route.transport_carriers && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {route.transport_carriers.name}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
