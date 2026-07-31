'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  MapPin,
  Play,
  Square,
  AlertTriangle,
  CheckCircle,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransportEvent } from '@/lib/services/tripsService';

interface TripTimelineProps {
  events: TransportEvent[];
  isLoading: boolean;
  onAddEvent: () => void;
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  trip_created: {
    label: 'Viaje Creado',
    icon: <Plus className="h-4 w-4" />,
    color: 'bg-blue-500',
  },
  boarding_started: {
    label: 'Abordaje Iniciado',
    icon: <Clock className="h-4 w-4" />,
    color: 'bg-yellow-500',
  },
  departure: {
    label: 'Salida',
    icon: <Play className="h-4 w-4" />,
    color: 'bg-green-500',
  },
  stop_arrived: {
    label: 'Llegada a Parada',
    icon: <MapPin className="h-4 w-4" />,
    color: 'bg-purple-500',
  },
  stop_departed: {
    label: 'Salida de Parada',
    icon: <MapPin className="h-4 w-4" />,
    color: 'bg-indigo-500',
  },
  delay: {
    label: 'Retraso Reportado',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'bg-orange-500',
  },
  incident: {
    label: 'Incidente',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'bg-red-500',
  },
  arrival: {
    label: 'Llegada',
    icon: <Square className="h-4 w-4" />,
    color: 'bg-gray-500',
  },
  completed: {
    label: 'Viaje Completado',
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-green-600',
  },
};

export function TripTimeline({ events, isLoading, onAddEvent }: TripTimelineProps) {
  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Timeline de Eventos
        </h3>
        <Button size="sm" onClick={onAddEvent} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Evento
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="p-8 text-center">
          <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No hay eventos registrados para este viaje
          </p>
        </div>
      ) : (
        <div className="p-4">
          <div className="relative">
            {/* Línea vertical */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

            {/* Eventos */}
            <div className="space-y-6">
              {events.map((event, index) => {
                const config = EVENT_CONFIG[event.event_type] || {
                  label: event.event_type,
                  icon: <Clock className="h-4 w-4" />,
                  color: 'bg-gray-500',
                };

                return (
                  <div key={event.id} className="relative pl-10">
                    {/* Punto en la línea */}
                    <div
                      className={`absolute left-2 w-5 h-5 rounded-full ${config.color} flex items-center justify-center text-white`}
                    >
                      {config.icon}
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <Badge variant="outline" className="mb-2">
                            {config.label}
                          </Badge>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {format(new Date(event.event_time), "d 'de' MMMM, HH:mm", { locale: es })}
                          </p>
                        </div>
                        {event.sequence && (
                          <span className="text-xs text-gray-400">#{event.sequence}</span>
                        )}
                      </div>

                      {event.description && (
                        <p className="text-gray-700 dark:text-gray-300 text-sm mt-2">
                          {event.description}
                        </p>
                      )}

                      {event.transport_stops && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                          <MapPin className="h-4 w-4" />
                          <span>{event.transport_stops.name}</span>
                          {event.transport_stops.city && (
                            <span className="text-gray-400">({event.transport_stops.city})</span>
                          )}
                        </div>
                      )}

                      {event.location_text && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                          <MapPin className="h-4 w-4" />
                          <span>{event.location_text}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
