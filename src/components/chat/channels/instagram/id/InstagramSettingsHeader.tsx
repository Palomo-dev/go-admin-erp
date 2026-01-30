'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Settings, Power, RefreshCw, Instagram } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { InstagramChannel } from '@/lib/services/instagramChannelService';

interface InstagramSettingsHeaderProps {
  channel: InstagramChannel;
  onRefresh: () => void;
  onToggleStatus: () => void;
  isLoading: boolean;
}

export default function InstagramSettingsHeader({
  channel,
  onRefresh,
  onToggleStatus,
  isLoading
}: InstagramSettingsHeaderProps) {
  const router = useRouter();

  const getStatusBadge = () => {
    switch (channel.status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Activo</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Inactivo</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Pendiente</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-between pb-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/app/chat/channels')}
          className="hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
            <Instagram className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {channel.name}
              {getStatusBadge()}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configuración del canal Instagram Direct
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button
          variant={channel.status === 'active' ? 'destructive' : 'default'}
          size="sm"
          onClick={onToggleStatus}
          disabled={isLoading || channel.status === 'pending'}
          className="gap-2"
        >
          <Power className="h-4 w-4" />
          {channel.status === 'active' ? 'Desactivar' : 'Activar'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Avanzado
        </Button>
      </div>
    </div>
  );
}
