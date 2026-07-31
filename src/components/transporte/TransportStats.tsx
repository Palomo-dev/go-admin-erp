'use client';

import { Card, CardContent } from '@/components/ui/card';
import { 
  Bus, 
  Package, 
  Ticket, 
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp
} from 'lucide-react';
import { TransportStats as Stats } from '@/lib/services/transportService';
import { formatCurrency } from '@/utils/Utils';

interface TransportStatsProps {
  stats: Stats | null;
  isLoading?: boolean;
}

export function TransportStats({ stats, isLoading }: TransportStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: 'Viajes',
      icon: Bus,
      color: 'blue',
      items: [
        { label: 'Programados', value: stats.trips.scheduled, color: 'text-blue-600' },
        { label: 'En ruta', value: stats.trips.in_transit, color: 'text-yellow-600' },
        { label: 'Completados', value: stats.trips.completed, color: 'text-green-600' },
        { label: 'Cancelados', value: stats.trips.cancelled, color: 'text-red-600' },
      ]
    },
    {
      title: 'Envíos',
      icon: Package,
      color: 'purple',
      items: [
        { label: 'Listos', value: stats.shipments.ready, color: 'text-blue-600' },
        { label: 'En tránsito', value: stats.shipments.in_transit, color: 'text-yellow-600' },
        { label: 'Entregados', value: stats.shipments.delivered, color: 'text-green-600' },
        { label: 'Fallidos', value: stats.shipments.failed, color: 'text-red-600' },
      ]
    },
    {
      title: 'Boletos',
      icon: Ticket,
      color: 'green',
      items: [
        { label: 'Vendidos', value: stats.tickets.sold_today, color: 'text-blue-600' },
        { label: 'Ingresos', value: formatCurrency(stats.tickets.revenue_today), color: 'text-green-600', isText: true },
        { label: 'Ocupación', value: `${stats.tickets.occupancy_avg}%`, color: 'text-purple-600', isText: true },
      ]
    },
    {
      title: 'Incidentes',
      icon: AlertTriangle,
      color: 'red',
      items: [
        { label: 'Abiertos', value: stats.incidents.open, color: 'text-yellow-600' },
        { label: 'Críticos', value: stats.incidents.critical, color: 'text-red-600' },
        { label: 'SLA vencido', value: stats.incidents.sla_breached, color: 'text-orange-600' },
      ]
    },
  ];

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((card) => (
        <Card key={card.title} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${colorClasses[card.color]}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {card.title}
              </h3>
            </div>
            <div className="space-y-2">
              {card.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                  <span className={`font-medium ${item.color}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
