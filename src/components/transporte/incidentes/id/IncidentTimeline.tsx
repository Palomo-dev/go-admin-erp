'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Plus,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  User,
  MapPin,
  FileText,
  Settings,
} from 'lucide-react';
import { TransportEvent } from '@/lib/services/incidentsService';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface IncidentTimelineProps {
  events: TransportEvent[];
  isLoading: boolean;
  onAddEvent: () => void;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  created: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Creado',
    color: 'bg-blue-500',
  },
  status_change: {
    icon: <Settings className="h-4 w-4" />,
    label: 'Cambio de estado',
    color: 'bg-purple-500',
  },
  assigned: {
    icon: <User className="h-4 w-4" />,
    label: 'Asignación',
    color: 'bg-indigo-500',
  },
  note: {
    icon: <MessageSquare className="h-4 w-4" />,
    label: 'Nota',
    color: 'bg-gray-500',
  },
  update: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Actualización',
    color: 'bg-yellow-500',
  },
  location: {
    icon: <MapPin className="h-4 w-4" />,
    label: 'Ubicación',
    color: 'bg-green-500',
  },
  escalation: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Escalamiento',
    color: 'bg-red-500',
  },
  resolution: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Resolución',
    color: 'bg-green-600',
  },
  evidence: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Evidencia',
    color: 'bg-orange-500',
  },
  default: {
    icon: <Clock className="h-4 w-4" />,
    label: 'Evento',
    color: 'bg-gray-400',
  },
};

export function IncidentTimeline({ events, isLoading, onAddEvent }: IncidentTimelineProps) {
  const getEventConfig = (eventType: string) => {
    return EVENT_TYPE_CONFIG[eventType] || EVENT_TYPE_CONFIG.default;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Bitácora del Incidente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          Bitácora del Incidente
        </CardTitle>
        <Button size="sm" onClick={onAddEvent} className="gap-2">
          <Plus className="h-4 w-4" />
          Agregar entrada
        </Button>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay eventos registrados</p>
            <p className="text-sm mt-1">Agrega el primer evento a la bitácora</p>
          </div>
        ) : (
          <div className="relative">
            {/* Línea vertical */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-6">
              {events.map((event, index) => {
                const config = getEventConfig(event.event_type);
                
                return (
                  <div key={event.id} className="relative pl-10">
                    {/* Indicador */}
                    <div
                      className={`absolute left-2 w-5 h-5 rounded-full ${config.color} flex items-center justify-center text-white`}
                    >
                      {config.icon}
                    </div>

                    {/* Contenido */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="outline">{config.label}</Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(event.event_time), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({formatDistanceToNow(new Date(event.event_time), { addSuffix: true, locale: es })})
                        </span>
                      </div>

                      {event.description && (
                        <p className="text-gray-700 dark:text-gray-300 mb-2">
                          {event.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        {event.actor_type && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {event.actor_type}
                          </span>
                        )}
                        {event.location_text && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location_text}
                          </span>
                        )}
                        {event.source && event.source !== 'internal' && (
                          <span className="text-blue-600">Fuente: {event.source}</span>
                        )}
                      </div>

                      {/* Payload adicional */}
                      {event.payload && Object.keys(event.payload).length > 0 && (
                        <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
                          <details>
                            <summary className="cursor-pointer text-gray-600 dark:text-gray-400">
                              Ver datos adicionales
                            </summary>
                            <pre className="mt-2 overflow-x-auto">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
