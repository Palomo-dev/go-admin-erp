'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { 
  Activity,
  TrendingUp,
  Calendar,
  Clock
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ACTIVITY_TYPE_CONFIG, ActivityType } from '@/types/activity';
import { ActividadIcon } from './ActividadIcon';

interface ActividadesStatsProps {
  stats: {
    total: number;
    byType: Record<string, number>;
    today: number;
    thisWeek: number;
    thisMonth: number;
  } | null;
  loading: boolean;
  className?: string;
}

export function ActividadesStats({ 
  stats, 
  loading, 
  className 
}: ActividadesStatsProps) {
  if (loading) {
    return (
      <Card className={cn("p-6", className)}>
        <div className="flex items-center justify-center">
          <LoadingSpinner />
          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
            Cargando estadísticas...
          </span>
        </div>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const topActivityTypes = Object.entries(stats.byType)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 4);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Estadísticas generales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.total}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.today}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Hoy
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.thisWeek}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Esta semana
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <Calendar className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.thisMonth}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Este mes
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Actividades por tipo */}
      {topActivityTypes.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">
            Actividades por tipo
          </h3>
          
          <div className="space-y-3">
            {topActivityTypes.map(([type, count]) => {
              const config = ACTIVITY_TYPE_CONFIG[type as ActivityType];
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              
              return (
                <div key={type} className="flex items-center gap-3">
                  <ActividadIcon 
                    type={type as ActivityType}
                    variant="minimal"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {config?.label || type}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {count}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className={cn(
                          "h-2 rounded-full transition-all duration-300",
                          config?.bgColor || "bg-gray-400"
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
