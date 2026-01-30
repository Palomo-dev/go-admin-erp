'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Bus, 
  Package, 
  Ticket, 
  AlertTriangle,
  DollarSign,
  Users,
  Clock,
  AlertCircle
} from 'lucide-react';
import { TransportStats } from '@/lib/services/transportService';
import { formatCurrency } from '@/utils/Utils';

interface DashboardStatsProps {
  stats: TransportStats | null;
  isLoading?: boolean;
}

export function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const totalTrips = stats.trips.scheduled + stats.trips.in_transit + stats.trips.completed + stats.trips.cancelled;
  const totalShipments = stats.shipments.ready + stats.shipments.in_transit + stats.shipments.delivered + stats.shipments.failed;

  return (
    <div className="space-y-4">
      {/* Primera fila: KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Viajes */}
        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Viajes
              </CardTitle>
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Bus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {totalTrips}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Programados</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  {stats.trips.scheduled}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">En ruta</span>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                  {stats.trips.in_transit}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Completados</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  {stats.trips.completed}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Cancelados</span>
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {stats.trips.cancelled}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Boletos */}
        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Boletos
              </CardTitle>
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Ticket className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {stats.tickets.sold_today}
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Ingresos
                </span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(stats.tickets.revenue_today)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Ocupación
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${stats.tickets.occupancy_avg}%` }}
                    />
                  </div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {stats.tickets.occupancy_avg}%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Envíos */}
        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Envíos
              </CardTitle>
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {totalShipments}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Listos</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  {stats.shipments.ready}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">En tránsito</span>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                  {stats.shipments.in_transit}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Entregados</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  {stats.shipments.delivered}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Fallidos</span>
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {stats.shipments.failed}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Incidentes */}
        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Incidentes
              </CardTitle>
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {stats.incidents.open}
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Críticos
                </span>
                <Badge variant="destructive" className="text-xs">
                  {stats.incidents.critical}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  SLA vencido
                </span>
                <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                  {stats.incidents.sla_breached}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
