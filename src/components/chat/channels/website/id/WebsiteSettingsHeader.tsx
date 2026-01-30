'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, Power, Activity, Users, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ChatChannel, WidgetStats } from '@/lib/services/chatChannelsService';

interface WebsiteSettingsHeaderProps {
  channel: ChatChannel;
  widgetStats: WidgetStats | null;
  onToggleStatus: () => Promise<void>;
  isUpdating: boolean;
}

export default function WebsiteSettingsHeader({
  channel,
  widgetStats,
  onToggleStatus,
  isUpdating
}: WebsiteSettingsHeaderProps) {
  const router = useRouter();

  return (
    <div className="border-b dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4">
        {/* Navigation */}
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/app/chat/channels')}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {channel.name}
              </h1>
              <Badge variant={channel.status === 'active' ? 'default' : 'secondary'}>
                {channel.status === 'active' ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configuración del widget de chat para sitio web
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {channel.status === 'active' ? 'Widget activo' : 'Widget inactivo'}
            </span>
            <Switch
              checked={channel.status === 'active'}
              onCheckedChange={onToggleStatus}
              disabled={isUpdating}
            />
          </div>
        </div>

        {/* Stats Cards */}
        {widgetStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                    <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Sesiones</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                      {widgetStats.totalSessions}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 dark:bg-green-800 rounded-lg">
                    <Power className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-green-600 dark:text-green-400">Activas</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      {widgetStats.activeSessions}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                    <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Visitantes</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                      {widgetStats.uniqueVisitors}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
                    {(widgetStats.deviceBreakdown.mobile || 0) > (widgetStats.deviceBreakdown.desktop || 0) ? (
                      <Smartphone className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    ) : (
                      <Monitor className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-orange-600 dark:text-orange-400">Dispositivo</p>
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">
                      {(widgetStats.deviceBreakdown.mobile || 0) > (widgetStats.deviceBreakdown.desktop || 0)
                        ? 'Móvil'
                        : 'Desktop'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
