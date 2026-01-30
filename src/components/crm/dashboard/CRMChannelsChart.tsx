'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { MessagesByChannel } from './types';
import {
  MessageSquare,
  Mail,
  Phone,
  Globe,
  MessageCircle,
} from 'lucide-react';

interface CRMChannelsChartProps {
  data: MessagesByChannel[];
  isLoading: boolean;
}

function getChannelIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'whatsapp':
      return <MessageCircle className="h-5 w-5" />;
    case 'email':
      return <Mail className="h-5 w-5" />;
    case 'phone':
    case 'call':
      return <Phone className="h-5 w-5" />;
    case 'website':
    case 'webchat':
      return <Globe className="h-5 w-5" />;
    default:
      return <MessageSquare className="h-5 w-5" />;
  }
}

function getChannelColor(type: string): string {
  switch (type?.toLowerCase()) {
    case 'whatsapp':
      return 'bg-green-500';
    case 'email':
      return 'bg-blue-500';
    case 'phone':
    case 'call':
      return 'bg-purple-500';
    case 'website':
    case 'webchat':
      return 'bg-orange-500';
    default:
      return 'bg-gray-500';
  }
}

export function CRMChannelsChart({ data, isLoading }: CRMChannelsChartProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalMessages = data.reduce((sum, c) => sum + c.count, 0);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
          Mensajes por Canal
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No hay canales configurados
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((channel) => (
              <div key={channel.channelId} className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg text-white',
                  getChannelColor(channel.channelType)
                )}>
                  {getChannelIcon(channel.channelType)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {channel.channelName}
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {channel.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-300', getChannelColor(channel.channelType))}
                      style={{ width: `${channel.percentage}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                  {channel.percentage.toFixed(0)}%
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {totalMessages.toLocaleString()} mensajes
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
