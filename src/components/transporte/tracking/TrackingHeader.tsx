'use client';

import { Card } from '@/components/ui/card';
import { Activity, Truck, Package, Clock, AlertTriangle } from 'lucide-react';

interface TrackingStats {
  totalEvents: number;
  tripEvents: number;
  shipmentEvents: number;
  todayEvents: number;
  stoppedItems: number;
}

interface TrackingHeaderProps {
  stats: TrackingStats;
  isLoading: boolean;
}

export function TrackingHeader({ stats, isLoading }: TrackingHeaderProps) {
  const statCards = [
    { label: 'Eventos Hoy', value: stats.todayEvents, icon: Clock, color: 'text-blue-600 bg-blue-100' },
    { label: 'Viajes', value: stats.tripEvents, icon: Truck, color: 'text-purple-600 bg-purple-100' },
    { label: 'Envíos', value: stats.shipmentEvents, icon: Package, color: 'text-green-600 bg-green-100' },
    { label: 'Detenidos', value: stats.stoppedItems, icon: AlertTriangle, color: 'text-orange-600 bg-orange-100' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Activity className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Centro de Tracking</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Monitoreo unificado de viajes y envíos en tiempo real
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? '-' : stat.value}
                </p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
