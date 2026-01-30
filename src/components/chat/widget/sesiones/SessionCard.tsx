'use client';

import { MoreVertical, Ban, Unlock, Eye, Globe, Monitor, Smartphone, Tablet, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { WidgetSession } from '@/lib/services/widgetSessionsService';

interface SessionCardProps {
  session: WidgetSession;
  onViewDetails: (session: WidgetSession) => void;
  onBlock: (session: WidgetSession) => void;
  onUnblock: (session: WidgetSession) => void;
}

const DeviceIcon = ({ type }: { type: string | null }) => {
  switch (type?.toLowerCase()) {
    case 'mobile':
      return <Smartphone className="h-4 w-4" />;
    case 'tablet':
      return <Tablet className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
};

export default function SessionCard({ session, onViewDetails, onBlock, onUnblock }: SessionCardProps) {
  // is_active = true significa que el visitante está online (heartbeat reciente)
  const isOnline = session.is_active;

  const getStatusBadge = () => {
    if (isOnline) {
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          En línea
        </Badge>
      );
    }
    return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Expirada</Badge>;
  };

  return (
    <div className={`bg-white dark:bg-gray-900 border rounded-lg p-4 ${
      !isOnline ? 'border-gray-200 dark:border-gray-800 opacity-60' : 
      'border-green-200 dark:border-green-800'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
              {session.anon_id.substring(0, 16)}...
            </code>
            {getStatusBadge()}
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <DeviceIcon type={session.device_type} />
              <span>{session.device_type || 'Desktop'}</span>
            </div>
            {session.channel && (
              <div className="flex items-center gap-1">
                <Globe className="h-4 w-4" />
                <span>{session.channel.name}</span>
              </div>
            )}
          </div>

          {session.customer ? (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <User className="h-4 w-4 text-blue-500" />
              <span className="text-gray-900 dark:text-white font-medium">
                {session.customer.full_name}
              </span>
              {session.customer.email && (
                <span className="text-gray-500 dark:text-gray-400">
                  ({session.customer.email})
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <User className="h-4 w-4" />
              <span>Visitante anónimo</span>
            </div>
          )}

          {session.current_page && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 truncate">
              📄 {session.current_page}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onViewDetails(session)}>
              <Eye className="h-4 w-4 mr-2" />
              Ver detalles
            </DropdownMenuItem>
            {isOnline && (
              <DropdownMenuItem
                onClick={() => onBlock(session)}
                className="text-orange-600 dark:text-orange-400"
              >
                <Ban className="h-4 w-4 mr-2" />
                Cerrar conversación
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>
            Última actividad: {formatDistanceToNow(new Date(session.last_seen_at), { addSuffix: true, locale: es })}
          </span>
        </div>
        {session.location_data?.country && (
          <span>
            📍 {session.location_data.city ? `${session.location_data.city}, ` : ''}{session.location_data.country}
          </span>
        )}
      </div>
    </div>
  );
}
