'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Send, CheckCheck, AlertTriangle } from 'lucide-react';
import type { WhatsAppStats } from '@/lib/services/whatsappChannelService';

interface WhatsAppStatsCardProps {
  stats: WhatsAppStats;
}

export default function WhatsAppStatsCard({ stats }: WhatsAppStatsCardProps) {
  const statItems = [
    {
      label: 'Total Mensajes',
      value: stats.totalMessages.toLocaleString(),
      icon: MessageSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      label: 'Enviados Hoy',
      value: stats.sentToday.toLocaleString(),
      icon: Send,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      label: 'Tasa de Entrega',
      value: `${stats.deliveredRate}%`,
      icon: CheckCheck,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    {
      label: 'Fallidos',
      value: stats.failedCount.toLocaleString(),
      icon: AlertTriangle,
      color: stats.failedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400',
      bgColor: stats.failedCount > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-900/30'
    }
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 dark:text-white">
          Estadísticas del Canal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900"
            >
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {item.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
