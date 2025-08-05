/**
 * Componente para mostrar estadísticas de triggers
 */

'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { TriggerStats as TriggerStatsType } from '@/types/eventTrigger';

export interface TriggerStatsProps {
  stats: TriggerStatsType;
  className?: string;
}

export function TriggerStats({ stats, className }: TriggerStatsProps) {
  // Configuración de canales para display
  const channelConfig = {
    email: { label: 'Email', icon: '📧', color: 'bg-blue-100 text-blue-800' },
    whatsapp: { label: 'WhatsApp', icon: '📱', color: 'bg-green-100 text-green-800' },
    webhook: { label: 'Webhook', icon: '🔗', color: 'bg-purple-100 text-purple-800' },
    push: { label: 'Push', icon: '🔔', color: 'bg-orange-100 text-orange-800' },
    sms: { label: 'SMS', icon: '💬', color: 'bg-yellow-100 text-yellow-800' }
  };

  // Top 3 eventos más utilizados
  const topEvents = Object.entries(stats.by_event_code || {})
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 3);

  // Top 3 prioridades
  const topPriorities = Object.entries(stats.by_priority || {})
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 3);

  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
      {/* Totales */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Triggers</CardTitle>
          <div className="text-2xl">🎯</div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
              {stats.active} activos
            </span>
            {stats.inactive > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                {stats.inactive} inactivos
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Estado de activación */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Estado</CardTitle>
          <div className="text-2xl">⚡</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Activos</span>
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                {stats.active}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Inactivos</span>
              <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                {stats.inactive}
              </Badge>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all" 
                style={{ 
                  width: stats.total > 0 ? `${(stats.active / stats.total) * 100}%` : '0%' 
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canales más utilizados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Canales</CardTitle>
          <div className="text-2xl">📡</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(stats.by_channel)
              .filter(([, count]) => count > 0)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 3)
              .map(([channel, count]) => {
                const config = channelConfig[channel as keyof typeof channelConfig];
                return (
                  <div key={channel} className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <span>{config?.icon}</span>
                      <span className="text-sm">{config?.label}</span>
                    </div>
                    <Badge variant="outline" className={config?.color}>
                      {count}
                    </Badge>
                  </div>
                );
              })}
            {Object.values(stats.by_channel || {}).every(count => count === 0) && (
              <p className="text-sm text-muted-foreground">No hay canales configurados</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Eventos más utilizados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Eventos</CardTitle>
          <div className="text-2xl">📋</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {topEvents.length > 0 ? (
              topEvents.map(([event, count]) => (
                <div key={event} className="flex justify-between items-center">
                  <span className="text-sm truncate">{event}</span>
                  <Badge variant="outline">
                    {count as number}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No hay eventos configurados</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Distribución por prioridades */}
      {topPriorities.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-lg">Distribución por Prioridades</CardTitle>
            <CardDescription>
              Cantidad de triggers por nivel de prioridad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {topPriorities.map(([priority, count]) => (
                <div key={priority} className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {count}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Prioridad {priority}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all" 
                      style={{ 
                        width: stats.total > 0 ? `${(count / stats.total) * 100}%` : '0%' 
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TriggerStats;
