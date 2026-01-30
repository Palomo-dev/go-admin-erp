'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Car, ParkingCircle, Clock, CheckCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface OccupancyStatsProps {
  totalSpaces: number;
  occupiedSpaces: number;
  freeSpaces: number;
  reservedSpaces: number;
  occupancyRate: number;
}

export function OccupancyStats({
  totalSpaces,
  occupiedSpaces,
  freeSpaces,
  reservedSpaces,
  occupancyRate,
}: OccupancyStatsProps) {
  const getOccupancyColor = (rate: number) => {
    if (rate >= 90) return 'text-red-600 dark:text-red-400';
    if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 90) return 'bg-red-500';
    if (rate >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <ParkingCircle className="h-5 w-5 text-blue-600" />
          Ocupación Actual
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Porcentaje de ocupación */}
          <div className="text-center">
            <span className={cn('text-4xl font-bold', getOccupancyColor(occupancyRate))}>
              {occupancyRate}%
            </span>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              de ocupación
            </p>
          </div>

          {/* Barra de progreso */}
          <div className="space-y-2">
            <Progress 
              value={occupancyRate} 
              className="h-3 bg-gray-200 dark:bg-gray-700"
            />
            <div className={cn('h-3 rounded-full transition-all', getProgressColor(occupancyRate))} 
                 style={{ width: `${occupancyRate}%`, marginTop: '-12px' }} />
          </div>

          {/* Desglose */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{freeSpaces}</p>
                <p className="text-xs text-green-600 dark:text-green-500">Libres</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <Car className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{occupiedSpaces}</p>
                <p className="text-xs text-red-600 dark:text-red-500">Ocupados</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{reservedSpaces}</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-500">Reservados</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <ParkingCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{totalSpaces}</p>
                <p className="text-xs text-blue-600 dark:text-blue-500">Total</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
