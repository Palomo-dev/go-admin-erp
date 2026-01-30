'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface HourlyStats {
  hour: number;
  entries: number;
  exits: number;
}

interface HourlyChartProps {
  data: HourlyStats[];
}

export function HourlyChart({ data }: HourlyChartProps) {
  const maxValue = Math.max(...data.map(d => Math.max(d.entries, d.exits)), 1);
  
  // Solo mostrar horas con actividad o horas laborales (6am - 10pm)
  const relevantHours = data.filter(d => d.hour >= 6 && d.hour <= 22);

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // Encontrar hora pico
  const peakHour = data.reduce((max, current) => 
    current.entries > max.entries ? current : max
  , data[0]);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Horas Pico
          </CardTitle>
          {peakHour && peakHour.entries > 0 && (
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Hora pico</p>
              <p className="font-semibold text-blue-600">{formatHour(peakHour.hour)}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Leyenda */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-gray-600 dark:text-gray-400">Entradas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-gray-600 dark:text-gray-400">Salidas</span>
          </div>
        </div>

        {/* Gráfico de barras simple */}
        <div className="space-y-2">
          {relevantHours.map((hourData) => (
            <div key={hourData.hour} className="flex items-center gap-2">
              <span className="w-12 text-xs text-gray-500 dark:text-gray-400 text-right">
                {formatHour(hourData.hour)}
              </span>
              <div className="flex-1 flex gap-1">
                {/* Barra de entradas */}
                <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className={cn(
                      'h-full bg-blue-500 rounded transition-all duration-300',
                      hourData.hour === peakHour?.hour && 'bg-blue-600'
                    )}
                    style={{ width: `${(hourData.entries / maxValue) * 100}%` }}
                  />
                </div>
                {/* Barra de salidas */}
                <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded transition-all duration-300"
                    style={{ width: `${(hourData.exits / maxValue) * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-16 flex gap-1 text-xs">
                <span className="text-blue-600 dark:text-blue-400 w-7 text-right">{hourData.entries}</span>
                <span className="text-gray-400">/</span>
                <span className="text-green-600 dark:text-green-400 w-7">{hourData.exits}</span>
              </div>
            </div>
          ))}
        </div>

        {relevantHours.every(h => h.entries === 0 && h.exits === 0) && (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin movimientos hoy</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
