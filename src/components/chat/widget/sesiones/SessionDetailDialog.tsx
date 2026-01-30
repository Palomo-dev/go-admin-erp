'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Monitor, Smartphone, Tablet, Globe, User, Clock, MapPin, Link, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { WidgetSession } from '@/lib/services/widgetSessionsService';

interface SessionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: WidgetSession | null;
}

const DeviceIcon = ({ type }: { type: string | null }) => {
  switch (type?.toLowerCase()) {
    case 'mobile':
      return <Smartphone className="h-5 w-5" />;
    case 'tablet':
      return <Tablet className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
};

export default function SessionDetailDialog({
  open,
  onOpenChange,
  session
}: SessionDetailDialogProps) {
  if (!session) return null;

  // is_active = true significa online (heartbeat reciente), false = expirada
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <DeviceIcon type={session.device_type} />
            Detalles de Sesión
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">ID de sesión anónima</p>
              <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded block mt-1">
                {session.anon_id}
              </code>
            </div>
            {getStatusBadge()}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Creada
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {format(new Date(session.created_at), "d 'de' MMMM, yyyy HH:mm", { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Última actividad
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {format(new Date(session.last_seen_at), "d 'de' MMMM, yyyy HH:mm", { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Estado
              </p>
              <p className={`text-sm font-medium mt-1 ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {isOnline ? 'Conectado ahora' : 'Desconectado'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Monitor className="h-4 w-4" /> Dispositivo
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {session.device_type || 'Desktop'}
              </p>
            </div>
          </div>

          <Separator />

          {session.customer ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <User className="h-4 w-4" /> Cliente asociado
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {session.customer.full_name}
              </p>
              {session.customer.email && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{session.customer.email}</p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <User className="h-4 w-4" /> Visitante anónimo
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Este visitante no ha iniciado sesión ni está asociado a un cliente
              </p>
            </div>
          )}

          {session.channel && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-2">
                <Globe className="h-4 w-4" /> Canal
              </p>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="font-medium text-gray-900 dark:text-white">{session.channel.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{session.channel.type}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {session.current_page && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                  <FileText className="h-4 w-4" /> Página actual
                </p>
                <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 p-2 rounded break-all">
                  {session.current_page}
                </p>
              </div>
            )}

            {session.referrer && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                  <Link className="h-4 w-4" /> Referrer
                </p>
                <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 p-2 rounded break-all">
                  {session.referrer}
                </p>
              </div>
            )}

            {session.location_data && (session.location_data.country || session.location_data.city) && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                  <MapPin className="h-4 w-4" /> Ubicación
                </p>
                <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  {[session.location_data.city, session.location_data.region, session.location_data.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            )}

            {session.user_agent && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">User Agent</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded break-all font-mono">
                  {session.user_agent}
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            {session.fingerprint_hash && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Fingerprint Hash</p>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">
                  {session.fingerprint_hash.substring(0, 16)}...
                </code>
              </div>
            )}
            {session.ip_hash && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">IP Hash</p>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">
                  {session.ip_hash.substring(0, 16)}...
                </code>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
