'use client';

import { Card } from '@/components/ui/card';
import { Ticket, CheckCircle, UserCheck, XCircle, UserX, DollarSign } from 'lucide-react';

interface TicketsStatsProps {
  stats: {
    total: number;
    reserved: number;
    confirmed: number;
    boarded: number;
    cancelled: number;
    noShow: number;
    revenue: number;
  };
}

export function TicketsStats({ stats }: TicketsStatsProps) {
  const statCards = [
    {
      title: 'Total Hoy',
      value: stats.total,
      icon: <Ticket className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Reservados',
      value: stats.reserved,
      icon: <Ticket className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      title: 'Confirmados',
      value: stats.confirmed,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Abordados',
      value: stats.boarded,
      icon: <UserCheck className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
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
