'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, Building, Home, Plane, Briefcase, Phone, Mail, UserPlus } from 'lucide-react';
import type { Channel, ChannelStats } from '@/lib/services/channelsService';

interface ChannelsListProps {
  channels: Channel[];
  stats: ChannelStats[];
}

const ICON_MAP: Record<string, any> = {
  Globe,
  Building,
  Home,
  Plane,
  Briefcase,
  Phone,
  Mail,
  UserPlus,
};

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
};

export function ChannelsList({ channels, stats }: ChannelsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {channels.map((channel) => {
        const Icon = ICON_MAP[channel.icon] || Globe;
        const channelStat = stats.find(s => s.channel === channel.id);
        const colorClass = COLOR_MAP[channel.color] || COLOR_MAP.gray;

        return (
          <Card key={channel.id} className="p-5 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-lg ${colorClass.split(' ')[0].replace('text', 'bg')}/20`}>
                <Icon className={`h-6 w-6 ${colorClass.split('dark:')[0]}`} />
              </div>
              {channel.active && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Activo
                </Badge>
              )}
            </div>

            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {channel.name}
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Comisión:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {channel.commission}%
                </span>
              </div>

              {channelStat && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Reservas:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {channelStat.total_reservations}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Ingresos:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      ${channelStat.total_revenue.toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
