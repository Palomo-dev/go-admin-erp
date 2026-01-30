'use client';

import { Phone, Mail, MessageSquare, CheckCircle, XCircle, Users } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface IdentidadesStatsProps {
  stats: {
    total: number;
    phone: number;
    email: number;
    whatsapp: number;
    verified: number;
    unverified: number;
  };
  loading?: boolean;
}

export function IdentidadesStats({ stats, loading }: IdentidadesStatsProps) {
  const statCards = [
    {
      label: 'Total',
      value: stats.total,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      label: 'Teléfono',
      value: stats.phone,
      icon: Phone,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      label: 'Email',
      value: stats.email,
      icon: Mail,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      label: 'WhatsApp',
      value: stats.whatsapp,
      icon: MessageSquare,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20'
    },
    {
      label: 'Verificados',
      value: stats.verified,
      icon: CheckCircle,
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20'
    },
    {
      label: 'Sin verificar',
      value: stats.unverified,
      icon: XCircle,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20'
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('p-1.5 rounded-lg', stat.bgColor)}>
                <Icon className={cn('h-4 w-4', stat.color)} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stat.value.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {stat.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
