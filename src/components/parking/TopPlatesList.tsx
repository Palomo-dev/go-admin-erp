'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Car, Clock } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface TopPlate {
  vehicle_plate: string;
  visit_count: number;
  last_visit: string;
}

interface TopPlatesListProps {
  plates: TopPlate[];
}

export function TopPlatesList({ plates }: TopPlatesListProps) {
  const formatLastVisit = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  };

  const getMedalColor = (index: number) => {
    switch (index) {
      case 0: return 'text-yellow-500';
      case 1: return 'text-gray-400';
      case 2: return 'text-orange-600';
      default: return 'text-gray-400';
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Placas Frecuentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {plates.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <Car className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin datos de visitas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plates.map((plate, index) => (
              <div
                key={plate.vehicle_plate}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  index < 3
                    ? 'bg-gradient-to-r from-yellow-50 to-transparent dark:from-yellow-900/10 border-yellow-200 dark:border-yellow-800/50'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                    index < 3 ? 'bg-white dark:bg-gray-800 shadow' : 'bg-gray-200 dark:bg-gray-600'
                  )}>
                    {index < 3 ? (
                      <Trophy className={cn('h-4 w-4', getMedalColor(index))} />
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">{index + 1}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {plate.vehicle_plate}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      <span>{formatLastVisit(plate.last_visit)}</span>
                    </div>
                  </div>
                </div>

                <Badge 
                  variant={index < 3 ? 'default' : 'secondary'}
                  className={index < 3 ? 'bg-blue-600' : ''}
                >
                  {plate.visit_count} visitas
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
