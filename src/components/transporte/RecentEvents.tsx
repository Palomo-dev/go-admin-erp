'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Package, 
  Bus, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Event {
  id: string;
  reference_type: string;
  reference_id: string;
  event_type: string;
  event_time: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  description?: string;
}

interface RecentEventsProps {
  events: Event[];
  isLoading?: boolean;
}

const eventTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  departure: { icon: Bus, color: 'bg-blue-100 text-blue-600', label: 'Salida' },
  arrival: { icon: MapPin, color: 'bg-green-100 text-green-600', label: 'Llegada' },
  pickup: { icon: Package, color: 'bg-purple-100 text-purple-600', label: 'Recogida' },
  delivery: { icon: CheckCircle2, color: 'bg-green-100 text-green-600', label: 'Entrega' },
  delay: { icon: Clock, color: 'bg-yellow-100 text-yellow-600', label: 'Retraso' },
  incident: { icon: AlertCircle, color: 'bg-red-100 text-red-600', label: 'Incidente' },
  dispatch: { icon: Truck, color: 'bg-blue-100 text-blue-600', label: 'Despacho' },
};

export function RecentEvents({ events, isLoading }: RecentEventsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Eventos Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Eventos Recientes</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            No hay eventos recientes
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const config = eventTypeConfig[event.event_type] || {
                icon: MapPin,
                color: 'bg-gray-100 text-gray-600',
                label: event.event_type,
              };
              const Icon = config.icon;

              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className={`p-2 rounded-full ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {event.reference_type === 'trip' ? 'Viaje' : 'Envío'}
                      </Badge>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {config.label}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {event.description}
                      </p>
                    )}
                    {event.location_text && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location_text}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(event.event_time), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
