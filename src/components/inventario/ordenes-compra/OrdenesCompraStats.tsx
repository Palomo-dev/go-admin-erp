'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Send, Clock, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface OrdenesCompraStatsProps {
  stats: {
    total: number;
    draft: number;
    sent: number;
    partial: number;
    received: number;
    cancelled: number;
    totalAmount: number;
  };
}

export function OrdenesCompraStats({ stats }: OrdenesCompraStatsProps) {
  const statCards = [
    {
      title: 'Total Órdenes',
      value: stats.total,
      icon: FileText,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      title: 'Borradores',
      value: stats.draft,
      icon: FileText,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800'
    },
    {
      title: 'Enviadas',
      value: stats.sent,
      icon: Send,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30'
    },
    {
      title: 'Parciales',
      value: stats.partial,
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30'
    },
    {
      title: 'Recibidas',
      value: stats.received,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Total Monto',
      value: formatCurrency(stats.totalAmount),
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      isAmount: true
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat, index) => (
        <Card key={index} className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.title}</p>
                <p className={`text-lg font-bold ${stat.isAmount ? 'text-sm' : ''} text-gray-900 dark:text-white`}>
                  {stat.value}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default OrdenesCompraStats;
