'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Mail, MessageSquare, Smartphone, Bell, Globe, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { getTemplates } from '@/lib/services/templateService';
import type { NotificationTemplate, NotificationChannel } from '@/types/eventTrigger';

interface TemplateStatsProps {
  className?: string;
}

export function TemplateStats({ className }: TemplateStatsProps) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChannelStats = () => {
    const stats: Record<NotificationChannel, number> = {
      email: 0,
      whatsapp: 0,
      sms: 0,
      push: 0,
      webhook: 0,
    };

    templates.forEach(template => {
      if (stats[template.channel] !== undefined) {
        stats[template.channel]++;
      }
    });

    return stats;
  };

  const getChannelIcon = (channel: NotificationChannel) => {
    const icons = {
      email: Mail,
      whatsapp: MessageSquare,
      sms: Smartphone,
      push: Bell,
      webhook: Globe,
    };
    return icons[channel];
  };

  const getChannelColor = (channel: NotificationChannel) => {
    const colors = {
      email: 'text-blue-600 bg-blue-100',
      whatsapp: 'text-green-600 bg-green-100',
      sms: 'text-purple-600 bg-purple-100',
      push: 'text-orange-600 bg-orange-100',
      webhook: 'text-gray-600 bg-gray-100',
    };
    return colors[channel];
  };

  const channelStats = getChannelStats();
  const totalTemplates = templates.length;
  const mostUsedChannel = Object.entries(channelStats).reduce((max, [channel, count]) => 
    count > max.count ? { channel: channel as NotificationChannel, count } : max
  , { channel: 'email' as NotificationChannel, count: 0 });

  const averageVariables = templates.length > 0 
    ? Math.round(templates.reduce((sum, t) => sum + t.variables.length, 0) / templates.length)
    : 0;

  if (loading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {/* Total de plantillas */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-muted-foreground">Total Plantillas</p>
              <p className="text-xl font-bold">{totalTemplates}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canal más usado */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${getChannelColor(mostUsedChannel.channel)}`}>
              {(() => {
                const Icon = getChannelIcon(mostUsedChannel.channel);
                return <Icon className="h-5 w-5" />;
              })()}
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-muted-foreground">Canal Principal</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{mostUsedChannel.count}</p>
                <Badge variant="secondary" className="text-xs">
                  {mostUsedChannel.channel.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variables promedio */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-muted-foreground">Variables Promedio</p>
              <p className="text-xl font-bold">{averageVariables}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actividad reciente */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Activity className="h-5 w-5 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-muted-foreground">Actualizadas</p>
              <p className="text-xl font-bold">
                {templates.filter(t => {
                  const updated = new Date(t.updated_at);
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return updated > weekAgo;
                }).length}
              </p>
              <p className="text-xs text-muted-foreground">Esta semana</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Distribución por canal */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Distribución por Canal
          </CardTitle>
          <CardDescription className="text-xs">
            Número de plantillas por canal de comunicación
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(channelStats).map(([channel, count]) => {
              const Icon = getChannelIcon(channel as NotificationChannel);
              const colorClass = getChannelColor(channel as NotificationChannel);
              
              return (
                <div key={channel} className="text-center">
                  <div className={`inline-flex p-2 rounded-lg ${colorClass} mb-1`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="font-semibold text-base">{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {channel}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
