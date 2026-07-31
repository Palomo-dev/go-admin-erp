'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Truck,
  Package,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Loader2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TrackingEvent } from '@/lib/services/trackingService';

interface TrackingFeedProps {
  events: TrackingEvent[];
  isLoading: boolean;
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  created: Package,
  received: Package,
  picked: Package,
  dispatched: Truck,
  in_transit: Truck,
  departed: Play,
  arrived: MapPin,
  out_for_delivery: Truck,
  delivered: CheckCircle,
  failed_delivery: XCircle,
  returned: RotateCcw,
  cancelled: XCircle,
  delayed: Pause,
  incident: AlertTriangle,
  note: Clock,
  default: Clock,
};

const EVENT_COLORS: Record<string, string> = {
  created: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700',
  received: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-800/30 dark:text-blue-100 dark:border-blue-700',
  picked: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-800/30 dark:text-indigo-100 dark:border-indigo-700',
  dispatched: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-800/30 dark:text-purple-100 dark:border-purple-700',
  in_transit: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-800/30 dark:text-purple-100 dark:border-purple-700',
  departed: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-800/30 dark:text-purple-100 dark:border-purple-700',
  arrived: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-800/30 dark:text-indigo-100 dark:border-indigo-700',
  out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-800/30 dark:text-orange-100 dark:border-orange-700',
  delivered: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-800/30 dark:text-green-100 dark:border-green-700',
  failed_delivery: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-800/30 dark:text-red-100 dark:border-red-700',
  returned: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-800/30 dark:text-orange-100 dark:border-orange-700',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  delayed: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-800/30 dark:text-yellow-100 dark:border-yellow-700',
  incident: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-800/30 dark:text-red-100 dark:border-red-700',
  note: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
  default: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
};

const EVENT_LABELS: Record<string, string> = {
  created: 'Creado',
  received: 'Recibido',
  picked: 'Preparado',
  dispatched: 'Despachado',
  in_transit: 'En Tránsito',
  departed: 'Partió',
  arrived: 'Llegó',
  out_for_delivery: 'En Reparto',
  delivered: 'Entregado',
  failed_delivery: 'Entrega Fallida',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
  delayed: 'Retrasado',
  incident: 'Incidente',
  note: 'Nota',
};

export function TrackingFeed({ events, isLoading }: TrackingFeedProps) {
  if (isLoading) {
    return (
      <Card className="p-4 sm:p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-300" />
        <span className="ml-3 text-gray-600 dark:text-gray-300">Cargando eventos...</span>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-4 sm:p-8 text-center">
        <Clock className="h-12 w-12 mx-auto text-gray-300 mb-4 dark:text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sin eventos</h3>
        <p className="text-gray-500 mt-2 dark:text-gray-400">No hay eventos que coincidan con los filtros aplicados</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const Icon = EVENT_ICONS[event.event_type] || EVENT_ICONS.default;
        const colorClass = EVENT_COLORS[event.event_type] || EVENT_COLORS.default;
        const label = EVENT_LABELS[event.event_type] || event.event_type;

        return (
          <Card key={event.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-2 sm:gap-4">
              {/* Icon */}
              <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                <Icon className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* Reference Type Badge */}
                  <Badge variant="outline" className={event.reference_type === 'trip' ? 'border-purple-300 text-purple-700 dark:border-purple-600 dark:text-purple-200' : 'border-green-300 text-green-700 dark:border-green-600 dark:text-green-200'}>
                    {event.reference_type === 'trip' ? (
                      <><Truck className="h-3 w-3 mr-1" /> Viaje</>
                    ) : (
                      <><Package className="h-3 w-3 mr-1" /> Envío</>
                    )}
                  </Badge>

                  {/* Reference Code */}
                  {event.reference_data?.code && (
                    <span className="font-mono font-medium text-blue-600 dark:text-blue-300">
                      {event.reference_data.code}
                    </span>
                  )}

                  {/* Event Type Badge */}
                  <Badge className={colorClass}>
                    {label}
                  </Badge>

                  {/* Status Badge */}
                  {event.reference_data?.status && (
                    <Badge variant="secondary" className="text-xs">
                      {event.reference_data.status}
                    </Badge>
                  )}
                </div>

                {/* Route Info */}
                {event.reference_data?.origin && event.reference_data?.destination && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <MapPin className="h-3 w-3 inline mr-1" />
                    {event.reference_data.origin} → {event.reference_data.destination}
                  </p>
                )}

                {/* Description */}
                {event.description && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                    {event.description}
                  </p>
                )}

                {/* Location */}
                {(event.location_text || event.transport_stops?.name) && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 dark:text-gray-400">
                    <MapPin className="h-3 w-3" />
                    {event.location_text || `${event.transport_stops?.name}, ${event.transport_stops?.city}`}
                  </p>
                )}

                {/* External ID */}
                {event.external_event_id && (
                  <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                    ID Externo: {event.external_event_id}
                  </p>
                )}
              </div>

              {/* Time */}
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {format(new Date(event.event_time), 'HH:mm', { locale: es })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(event.event_time), 'd MMM', { locale: es })}
                </p>
                <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                  {formatDistanceToNow(new Date(event.event_time), { addSuffix: true, locale: es })}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
