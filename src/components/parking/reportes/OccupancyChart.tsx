'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import type { OccupancyByHour } from '@/lib/services/parkingReportService';

interface OccupancyChartProps {
  data: OccupancyByHour[];
  isLoading?: boolean;
}

export function OccupancyChart({ data, isLoading }: OccupancyChartProps) {
  const maxSessions = Math.max(...data.map((d) => d.sessions), 1);

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Ocupación por Hora
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : (
          <div className="h-64 flex items-end gap-1">
            {data.map((item) => {
              const height = (item.sessions / maxSessions) * 100;
              const isHighTraffic = item.sessions > maxSessions * 0.7;
              const isMediumTraffic = item.sessions > maxSessions * 0.4;

              return (
                <div
                  key={item.hour}
                  className="flex-1 flex flex-col items-center group"
                >
                  {/* Tooltip */}
                  <div className="hidden group-hover:block absolute -top-16 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded px-2 py-1 z-10 whitespace-nowrap">
                    <p className="font-semibold">{formatHour(item.hour)}</p>
                    <p>{item.sessions} sesiones</p>
                    <p>Prom: {item.avgDuration} min</p>
                  </div>

                  {/* Barra */}
                  <div
                    className={`w-full rounded-t transition-all duration-300 cursor-pointer ${
                      isHighTraffic
                        ? 'bg-blue-600 dark:bg-blue-500'
                        : isMediumTraffic
                        ? 'bg-blue-400 dark:bg-blue-600'
                        : 'bg-blue-200 dark:bg-blue-800'
                    } hover:opacity-80`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />

                  {/* Etiqueta hora */}
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 rotate-[-45deg] origin-left">
                    {item.hour % 3 === 0 ? formatHour(item.hour) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Leyenda */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-600 dark:bg-blue-500" />
            <span>Alto tráfico</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-400 dark:bg-blue-600" />
            <span>Medio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800" />
            <span>Bajo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default OccupancyChart;
