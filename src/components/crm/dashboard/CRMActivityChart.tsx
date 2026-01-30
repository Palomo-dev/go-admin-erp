'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { ActivityByDay } from './types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CRMActivityChartProps {
  data: ActivityByDay[];
  isLoading: boolean;
}

function ActivityBar({ day, maxValue }: { day: ActivityByDay; maxValue: number }) {
  const total = day.conversations + day.messages + day.opportunities + day.activities;
  const heightPercent = maxValue > 0 ? (total / maxValue) * 100 : 0;

  // Proporciones de cada tipo
  const conversationsHeight = total > 0 ? (day.conversations / total) * heightPercent : 0;
  const messagesHeight = total > 0 ? (day.messages / total) * heightPercent : 0;
  const opportunitiesHeight = total > 0 ? (day.opportunities / total) * heightPercent : 0;
  const activitiesHeight = total > 0 ? (day.activities / total) * heightPercent : 0;

  const formattedDate = format(parseISO(day.date), 'EEE', { locale: es });

  return (
    <div className="flex flex-col items-center gap-1 group">
      <div className="relative h-32 w-8 flex flex-col-reverse rounded-t overflow-hidden bg-gray-100 dark:bg-gray-700">
        {/* Conversaciones - Azul */}
        <div
          className="w-full bg-blue-500 transition-all duration-300"
          style={{ height: `${conversationsHeight}%` }}
        />
        {/* Mensajes - Verde */}
        <div
          className="w-full bg-green-500 transition-all duration-300"
          style={{ height: `${messagesHeight}%` }}
        />
        {/* Oportunidades - Naranja */}
        <div
          className="w-full bg-orange-500 transition-all duration-300"
          style={{ height: `${opportunitiesHeight}%` }}
        />
        {/* Actividades - Morado */}
        <div
          className="w-full bg-purple-500 transition-all duration-300"
          style={{ height: `${activitiesHeight}%` }}
        />
        
        {/* Tooltip */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs p-2 rounded whitespace-nowrap z-10 shadow-lg">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Conv: {day.conversations}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Msg: {day.messages}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span>Oport: {day.opportunities}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span>Act: {day.activities}</span>
          </div>
        </div>
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
        {formattedDate}
      </span>
    </div>
  );
}

export function CRMActivityChart({ data, isLoading }: CRMActivityChartProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-around gap-2">
            {[60, 80, 45, 90, 55, 70, 40].map((height, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Skeleton className="w-8" style={{ height: `${height}px` }} />
                <Skeleton className="h-3 w-6" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(
    ...data.map(d => d.conversations + d.messages + d.opportunities + d.activities),
    1
  );

  // Limitar a los últimos 14 días para evitar overflow
  const displayData = data.slice(-14);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Actividad por Día
          </CardTitle>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-500 dark:text-gray-400">Conv.</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500 dark:text-gray-400">Msg.</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-gray-500 dark:text-gray-400">Oport.</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-gray-500 dark:text-gray-400">Act.</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {displayData.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No hay datos de actividad en el periodo seleccionado
          </div>
        ) : (
          <div className="flex items-end justify-around gap-1 overflow-x-auto">
            {displayData.map((day) => (
              <ActivityBar key={day.date} day={day} maxValue={maxValue} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
