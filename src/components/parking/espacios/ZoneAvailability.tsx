'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { MapPin } from 'lucide-react';
import { ParkingZone, SpaceStats } from './types';

interface ZoneAvailabilityProps {
  zones: ParkingZone[];
  stats: SpaceStats;
  isLoading: boolean;
}

export function ZoneAvailability({ zones, stats, isLoading }: ZoneAvailabilityProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Disponibilidad por Zona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const zoneData = zones.map((zone) => {
    const zoneStats = stats.byZone[zone.id] || { total: 0, occupied: 0 };
    const available = zoneStats.total - zoneStats.occupied;
    const percentage = zoneStats.total > 0 
      ? Math.round((zoneStats.occupied / zoneStats.total) * 100) 
      : 0;

    return {
      ...zone,
      total: zoneStats.total,
      occupied: zoneStats.occupied,
      available,
      percentage,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Disponibilidad por Zona
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {zoneData.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No hay zonas configuradas
          </p>
        ) : (
          zoneData.map((zone) => (
            <div key={zone.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {zone.name}
                  </span>
                  {zone.is_vip && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                      VIP
                    </span>
                  )}
                  {zone.is_covered && (
                    <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">
                      Cubierto
                    </span>
                  )}
                </div>
                <span className="text-gray-500 dark:text-gray-400">
                  {zone.available}/{zone.total} disponibles
                </span>
              </div>
              <Progress 
                value={zone.percentage} 
                className="h-2"
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
