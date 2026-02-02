'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Link2,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  XCircle,
  Clock,
} from 'lucide-react';

export interface ConnectionsStatsData {
  total: number;
  connected: number;
  error: number;
  paused: number;
  draft: number;
  revoked: number;
}

interface ConnectionsStatsProps {
  stats: ConnectionsStatsData;
  loading?: boolean;
}

const statCards = [
  {
    key: 'total',
    label: 'Total',
    icon: Link2,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    key: 'connected',
    label: 'Conectadas',
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  {
    key: 'error',
    label: 'Con Error',
    icon: AlertTriangle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  {
    key: 'paused',
    label: 'Pausadas',
    icon: PauseCircle,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  {
    key: 'draft',
    label: 'Borrador',
    icon: Clock,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  {
    key: 'revoked',
    label: 'Revocadas',
    icon: XCircle,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
];

export function ConnectionsStats({ stats, loading = false }: ConnectionsStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card key={card.key} className="p-4 dark:bg-gray-800 dark:border-gray-700">
            <Skeleton className="h-10 w-10 rounded-lg mb-3" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-4 w-20" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key as keyof ConnectionsStatsData] || 0;

        return (
          <Card
            key={card.key}
            className="p-4 dark:bg-gray-800 dark:border-gray-700 hover:shadow-md transition-shadow"
          >
            <div className={`p-2 rounded-lg ${card.bgColor} w-fit mb-3`}>
              <Icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {card.label}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

export default ConnectionsStats;
