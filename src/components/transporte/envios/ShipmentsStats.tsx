'use client';

import { Card } from '@/components/ui/card';
import { Package, CheckCircle, Truck, XCircle, Clock, DollarSign } from 'lucide-react';

interface ShipmentsStatsProps {
  stats: {
    total: number;
    pending: number;
    received: number;
    inTransit: number;
    delivered: number;
    cancelled: number;
    revenue: number;
  };
}

export function ShipmentsStats({ stats }: ShipmentsStatsProps) {
  const statCards = [
    {
      title: 'Total Hoy',
      value: stats.total,
      icon: <Package className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Pendientes',
      value: stats.pending,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      title: 'En Tránsito',
      value: stats.inTransit,
      icon: <Truck className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Entregados',
      value: stats.delivered,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Cancelados',
      value: stats.cancelled,
      icon: <XCircle className="h-5 w-5" />,
      color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    },
    {
      title: 'Ingresos Hoy',
      value: new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
      }).format(stats.revenue),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.title} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.color}`}>{stat.icon}</div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{stat.title}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
