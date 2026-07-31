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
  created: 'bg-gray-100 text-gray-800 border-gray-200',
  received: 'bg-blue-100 text-blue-800 border-blue-200',
  picked: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  dispatched: 'bg-purple-100 text-purple-800 border-purple-200',
  in_transit: 'bg-purple-100 text-purple-800 border-purple-200',
  departed: 'bg-purple-100 text-purple-800 border-purple-200',
  arrived: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  failed_delivery: 'bg-red-100 text-red-800 border-red-200',
  returned: 'bg-orange-100 text-orange-800 border-orange-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  delayed: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  incident: 'bg-red-100 text-red-800 border-red-200',
  note: 'bg-gray-100 text-gray-700 border-gray-200',
  default: 'bg-gray-100 text-gray-700 border-gray-200',
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
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Cargando eventos...</span>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Clock className="h-12 w-12 mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sin eventos</h3>
        <p className="text-gray-500 mt-2">No hay eventos que coincidan con los filtros aplicados</p>
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
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                <Icon className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* Reference Type Badge */}
                  <Badge variant="outline" className={event.reference_type === 'trip' ? 'border-purple-300 text-purple-700' : 'border-green-300 text-green-700'}>
                    {event.reference_type === 'trip' ? (
                      <><Truck className="h-3 w-3 mr-1" /> Viaje</>
                    ) : (
                      <><Package className="h-3 w-3 mr-1" /> Envío</>
                    )}
                  </Badge>

                  {/* Reference Code */}
                  {event.reference_data?.code && (
                    <span className="font-mono font-medium text-blue-600">
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
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.location_text || `${event.transport_stops?.name}, ${event.transport_stops?.city}`}
                  </p>
                )}

                {/* External ID */}
                {event.external_event_id && (
                  <p className="text-xs text-gray-400 mt-1">
                    ID Externo: {event.external_event_id}
                  </p>
                )}
              </div>

              {/* Time */}
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {format(new Date(event.event_time), 'HH:mm', { locale: es })}
                </p>
                <p className="text-xs text-gray-500">
                  {format(new Date(event.event_time), 'd MMM', { locale: es })}
                </p>
                <p className="text-xs text-gray-400 mt-1">
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
