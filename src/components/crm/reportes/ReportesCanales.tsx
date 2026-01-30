'use client';

import { MessageSquare, Mail, Globe, Phone } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { ChannelMetrics } from './types';

interface ReportesCanalesProps {
  metrics: ChannelMetrics[];
  loading?: boolean;
}

const getChannelIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'whatsapp':
      return Phone;
    case 'email':
      return Mail;
    case 'website':
      return Globe;
    default:
      return MessageSquare;
  }
};

const getChannelColor = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'whatsapp':
      return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    case 'email':
      return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
    case 'website':
      return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
  }
};

export function ReportesCanales({ metrics, loading }: ReportesCanalesProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Volumen por Canal
        </h3>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalConversations = metrics.reduce((acc, m) => acc + m.totalConversations, 0);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Volumen por Canal
      </h3>

      {metrics.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No hay datos de canales disponibles
        </p>
      ) : (
        <div className="space-y-4">
          {metrics.map((channel) => {
            const Icon = getChannelIcon(channel.channelType);
            const colorClass = getChannelColor(channel.channelType);
            const percentage = totalConversations > 0 
              ? Math.round(channel.totalConversations / totalConversations * 100) 
              : 0;

            return (
              <div key={channel.channelId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg', colorClass.split(' ').slice(2).join(' '))}>
                      <Icon className={cn('h-4 w-4', colorClass.split(' ').slice(0, 2).join(' '))} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {channel.channelName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {channel.channelType}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {channel.totalConversations.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {channel.totalMessages.toLocaleString()} mensajes
                    </p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      channel.channelType === 'whatsapp' && 'bg-green-500',
                      channel.channelType === 'email' && 'bg-blue-500',
                      channel.channelType === 'website' && 'bg-purple-500',
                      !['whatsapp', 'email', 'website'].includes(channel.channelType) && 'bg-gray-500'
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{percentage}% del total</span>
                  <span>~{channel.avgMessagesPerConversation} msg/conv</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
