'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import {
  BarChart3,
  Clock,
  Layers,
  Users,
  GitBranch,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';
import {
  SOURCE_TABLE_LABELS,
  SOURCE_TABLE_COLORS,
  ACTION_LABELS,
} from '@/lib/services/timelineService';

interface CorrelationSummaryProps {
  events: TimelineEvent[];
}

export function CorrelationSummary({ events }: CorrelationSummaryProps) {
  // Ordenar eventos por tiempo
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );

  // Estadísticas
  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  
  const duration = firstEvent && lastEvent
    ? formatDistanceStrict(
        new Date(firstEvent.event_time),
        new Date(lastEvent.event_time),
        { locale: es }
      )
    : null;

  // Contar por módulo/tabla
  const modulesCounts = events.reduce((acc, e) => {
    const key = e.source_table;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Contar por acción
  const actionsCounts = events.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Actores únicos
  const uniqueActors = new Set(events.map(e => e.actor_id).filter(Boolean)).size;

  // Entidades afectadas
  const entitiesSet = new Set(events.map(e => `${e.entity_type}:${e.entity_id}`));
  const uniqueEntities = entitiesSet.size;

  // Flujo simplificado (módulos en orden)
  const flowModules = sortedEvents.reduce((acc, e) => {
    const label = SOURCE_TABLE_LABELS[e.source_table] || e.source_table;
    if (acc.length === 0 || acc[acc.length - 1] !== label) {
      acc.push(label);
    }
    return acc;
  }, [] as string[]);

  return (
    <div className="space-y-4">
      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Layers className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{events.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pasos totales</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {duration || 'Instantáneo'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Duración</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{uniqueActors}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Actores</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <GitBranch className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{uniqueEntities}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Entidades</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flujo de la operación */}
      {flowModules.length > 1 && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Flujo de la Operación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {flowModules.map((module, idx) => (
                <React.Fragment key={idx}>
                  <Badge 
                    variant="secondary"
                    className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {module}
                  </Badge>
                  {idx < flowModules.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desglose por módulo y acción */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por módulo */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Por Módulo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(modulesCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([module, count]) => (
                  <div key={module} className="flex items-center justify-between">
                    <Badge 
                      variant="secondary"
                      className={cn('text-xs', SOURCE_TABLE_COLORS[module])}
                    >
                      {SOURCE_TABLE_LABELS[module] || module}
                    </Badge>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Por acción */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Por Acción
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(actionsCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([action, count]) => (
                  <div key={action} className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs border-gray-300 dark:border-gray-600">
                      {ACTION_LABELS[action] || action}
                    </Badge>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
