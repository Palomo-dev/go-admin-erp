'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import integrationsService from '@/lib/services/integrationsService';

interface ChatChannelsSectionProps {
  organizationId: number;
}

interface ChatChannelConnection {
  id: string;
  name: string;
  type: string;
  status: string;
  hasCredentials: boolean;
  isValid: boolean;
  lastValidatedAt: string | null;
  channelUrl: string;
}

const channelConfig: Record<string, { label: string; color: string; icon: string }> = {
  whatsapp: {
    label: 'WhatsApp',
    color: 'bg-green-500',
    icon: '📱',
  },
  facebook: {
    label: 'Facebook Messenger',
    color: 'bg-blue-600',
    icon: '💬',
  },
  instagram: {
    label: 'Instagram DM',
    color: 'bg-pink-500',
    icon: '📸',
  },
};

export function ChatChannelsSection({ organizationId }: ChatChannelsSectionProps) {
  const [channels, setChannels] = useState<ChatChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        setLoading(true);
        const data = await integrationsService.getChatChannelsAsConnections(organizationId);
        setChannels(data);
      } catch (error) {
        console.error('Error loading chat channels:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchChannels();
  }, [organizationId]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await integrationsService.getChatChannelsAsConnections(organizationId);
      setChannels(data);
    } catch (error) {
      console.error('Error refreshing channels:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Canales de Mensajería
          </CardTitle>
          <CardDescription>Cargando canales...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (channels.length === 0) {
    return (
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Canales de Mensajería
            </CardTitle>
            <CardDescription>
              No hay canales externos configurados
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <MessageCircle className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Configura canales de WhatsApp, Facebook o Instagram para verlos aquí
            </p>
            <Link href="/app/chat/canales">
              <Button variant="outline" size="sm">
                Ir a Canales de Chat
                <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Canales de Mensajería
          </CardTitle>
          <CardDescription>
            Estado de conexión de canales externos
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="text-gray-500"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/app/chat/canales">
            <Button variant="outline" size="sm">
              Gestionar
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((channel) => {
            const config = channelConfig[channel.type] || {
              label: channel.type,
              color: 'bg-gray-500',
              icon: '💬',
            };
            const isActive = channel.status === 'active';
            const isConnected = channel.hasCredentials && channel.isValid;
            const hasError = channel.hasCredentials && !channel.isValid;
            const isPending = !channel.hasCredentials;

            return (
              <div
                key={channel.id}
                className={cn(
                  'p-4 rounded-lg border transition-all hover:shadow-md',
                  isConnected
                    ? 'border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10'
                    : hasError
                    ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg text-lg',
                    config.color
                  )}>
                    {config.icon}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isConnected && (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Conectado
                      </Badge>
                    )}
                    {hasError && (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Error
                      </Badge>
                    )}
                    {isPending && (
                      <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Sin credenciales
                      </Badge>
                    )}
                    {isActive && (
                      <Badge variant="outline" className="text-xs border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                        Activo
                      </Badge>
                    )}
                  </div>
                </div>

                <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                  {channel.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {config.label}
                </p>

                <Link href={channel.channelUrl}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                  >
                    {isPending ? 'Configurar' : 'Ver detalles'}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default ChatChannelsSection;
