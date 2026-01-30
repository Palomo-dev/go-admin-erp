'use client';

import React from 'react';
import { Plus, Radio, Globe, MessageCircle, Bot, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChannelStats } from '@/lib/services/chatChannelsService';

interface ChannelsHeaderProps {
  stats: ChannelStats | null;
  loading?: boolean;
  onCreateChannel: () => void;
}

export default function ChannelsHeader({ stats, loading, onCreateChannel }: ChannelsHeaderProps) {
  return (
    <div className="border-b dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Canales de Chat
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona los canales de comunicación con tus clientes
            </p>
          </div>

          <Button onClick={onCreateChannel} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Canal
          </Button>
        </div>

        {/* Stats Cards */}
        {!loading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                    <Radio className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Total</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                      {stats.totalChannels}
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
                    <p className="text-xs text-green-600 dark:text-green-400">Activos</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      {stats.activeChannels}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                    <Globe className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Website</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                      {stats.byType.website || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-violet-100 dark:bg-violet-800 rounded-lg">
                    <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-xs text-violet-600 dark:text-violet-400">IA Auto</p>
                    <p className="text-lg font-bold text-violet-700 dark:text-violet-300">
                      {stats.byAIMode.auto || 0}
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
