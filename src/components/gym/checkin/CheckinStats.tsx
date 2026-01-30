'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  LogIn, 
  XCircle, 
  Hand, 
  QrCode, 
  Users, 
  AlertTriangle,
  Clock
} from 'lucide-react';
import type { CheckinStats as CheckinStatsType } from '@/lib/services/gymCheckinService';

interface CheckinStatsProps {
  stats: CheckinStatsType;
  isLoading?: boolean;
}

export function CheckinStats({ stats, isLoading }: CheckinStatsProps) {
  const statItems = [
    {
      label: 'Total',
      value: stats.total,
      icon: Clock,
      color: 'blue',
    },
    {
      label: 'Accesos',
      value: stats.granted,
      icon: LogIn,
      color: 'green',
    },
    {
      label: 'Denegados',
      value: stats.denied,
      icon: XCircle,
      color: 'red',
    },
    {
      label: 'Manuales',
      value: stats.manual,
      icon: Hand,
      color: 'orange',
    },
    {
      label: 'Por QR',
      value: stats.qr,
      icon: QrCode,
      color: 'purple',
    },
    {
      label: 'Miembros únicos',
      value: stats.uniqueMembers,
      icon: Users,
      color: 'indigo',
    },
  ];

  const colorClasses: Record<string, { bg: string; icon: string; text: string }> = {
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      icon: 'text-blue-600 dark:text-blue-400',
      text: 'text-blue-600 dark:text-blue-400',
    },
    green: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      icon: 'text-green-600 dark:text-green-400',
      text: 'text-green-600 dark:text-green-400',
    },
    red: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      icon: 'text-red-600 dark:text-red-400',
      text: 'text-red-600 dark:text-red-400',
    },
    orange: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      icon: 'text-orange-600 dark:text-orange-400',
      text: 'text-orange-600 dark:text-orange-400',
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      icon: 'text-purple-600 dark:text-purple-400',
      text: 'text-purple-600 dark:text-purple-400',
    },
    indigo: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      icon: 'text-indigo-600 dark:text-indigo-400',
      text: 'text-indigo-600 dark:text-indigo-400',
    },
    yellow: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      icon: 'text-yellow-600 dark:text-yellow-400',
      text: 'text-yellow-600 dark:text-yellow-400',
    },
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <div className="animate-pulse flex items-center gap-3">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="space-y-2">
                  <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statItems.map((item) => {
        const colors = colorClasses[item.color];
        const Icon = item.icon;
        
        return (
          <Card 
            key={item.label} 
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div>
                  <div className={`text-2xl font-bold ${colors.text}`}>
                    {item.value}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.label}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Alertas especiales */}
      {(stats.expiringToday > 0 || stats.expiredAccess > 0) && (
        <>
          {stats.expiringToday > 0 && (
            <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {stats.expiringToday}
                    </div>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Vencen hoy
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default CheckinStats;
