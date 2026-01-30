'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity,
  Bus,
  Package,
  MapPin,
  Clock,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface TransportEvent {
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

interface DashboardRecentEventsProps {
  events: TransportEvent[];
  isLoading?: boolean;
}

const eventTypeConfig: Record<string, { label: string; color: string }> = {
  'departure': { label: 'Salida', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  'arrival': { label: 'Llegada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  'stop': { label: 'Parada', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  'delay': { label: 'Retraso', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  'pickup': { label: 'Recogida', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  'delivery': { label: 'Entrega', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  'failed_delivery': { label: 'Entrega fallida', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  'incident': { label: 'Incidente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  'checkpoint': { label: 'Punto de control', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
};

const referenceTypeIcons: Record<string, React.ElementType> = {
  'trip': Bus,
  'shipment': Package,
};

export function DashboardRecentEvents({ events, isLoading }: DashboardRecentEventsProps) {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Últimos Eventos
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Últimos Eventos
          </CardTitle>
          <Link href="/app/transporte/tracking">
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todos
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <Activity className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">No hay eventos recientes</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {events.map((event) => {
                const Icon = referenceTypeIcons[event.reference_type] || Activity;
                const config = eventTypeConfig[event.event_type] || { 
                  label: event.event_type, 
                  color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' 
                };

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                      <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-gray-500 capitalize">
                          {event.reference_type === 'trip' ? 'Viaje' : 'Envío'}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {event.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {event.location_text && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {event.location_text}
                          </span>
                        )}
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(event.event_time), { 
                            addSuffix: true,
                            locale: es 
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
