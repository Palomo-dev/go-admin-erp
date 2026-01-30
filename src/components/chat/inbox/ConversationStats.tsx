'use client';

import React from 'react';
import { MessageSquare, Clock, CheckCircle2, UserX, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ConversationStats as Stats } from '@/lib/services/conversationsService';

interface ConversationStatsProps {
  stats: Stats;
  loading?: boolean;
}

export default function ConversationStats({ stats, loading }: ConversationStatsProps) {
  const items = [
    {
      label: 'Abiertas',
      value: stats.open,
      icon: MessageSquare,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      label: 'Pendientes',
      value: stats.pending,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20'
    },
    {
      label: 'Cerradas',
      value: stats.closed,
      icon: CheckCircle2,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-gray-900/20'
    },
    {
      label: 'Sin Asignar',
      value: stats.unassigned,
      icon: UserX,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20'
    },
    {
      label: 'Fuera de SLA',
      value: stats.out_of_sla,
      icon: AlertCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20'
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${item.bgColor}`}>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {item.value}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {item.label}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
