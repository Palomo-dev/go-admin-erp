'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import Link from 'next/link';
import type { NotificationChannel, LinkedConnection } from './types';
import { CHANNEL_TO_PROVIDER_CODES } from './types';

interface LinkConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: NotificationChannel | null;
  availableConnections: LinkedConnection[];
  onLink: (channelId: string, connectionId: string, providerName: string) => Promise<boolean>;
}

const statusColors: Record<string, string> = {
  connected: 'border-green-300 dark:border-green-700',
  paused: 'border-amber-300 dark:border-amber-700',
  error: 'border-red-300 dark:border-red-700',
};

const statusBadge: Record<string, string> = {
  connected: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function LinkConnectionDialog({
  open, onOpenChange, channel, availableConnections, onLink,
}: LinkConnectionDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  if (!channel) return null;

  const suggestedCodes = CHANNEL_TO_PROVIDER_CODES[channel.code] || [];

  const suggested = availableConnections.filter((c) =>
    suggestedCodes.includes(c.provider_code) || c.category === 'messaging'
  );
  const others = availableConnections.filter(
    (c) => !suggestedCodes.includes(c.provider_code) && c.category !== 'messaging'
  );

  const handleLink = async () => {
    if (!selectedId || !channel) return;
    setIsLinking(true);
    const conn = availableConnections.find((c) => c.id === selectedId);
    const ok = await onLink(channel.id, selectedId, conn?.provider_name || channel.provider_name);
    setIsLinking(false);
    if (ok) {
      setSelectedId(null);
      onOpenChange(false);
    }
  };

  const renderConnection = (conn: LinkedConnection) => (
    <button
      key={conn.id}
      onClick={() => setSelectedId(conn.id)}
      className={cn(
        'w-full text-left p-3 rounded-lg border-2 transition-all',
        selectedId === conn.id
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        statusColors[conn.status]
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{conn.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {conn.provider_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1 py-0">{conn.environment}</Badge>
          <Badge className={cn('text-[10px] px-1.5 py-0', statusBadge[conn.status] || 'bg-gray-100 text-gray-500')}>
            {conn.status}
          </Badge>
          {selectedId === conn.id && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
        </div>
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            Vincular Integración
          </DialogTitle>
          <DialogDescription>
            Selecciona una conexión de Integraciones para el canal <strong>{channel.code}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {suggested.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Sugeridas para {channel.code}</p>
              <div className="space-y-2">
                {suggested.map(renderConnection)}
              </div>
            </>
          )}

          {others.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-2">Otras conexiones</p>
              <div className="space-y-2">
                {others.map(renderConnection)}
              </div>
            </>
          )}

          {availableConnections.length === 0 && (
            <div className="text-center py-8">
              <Link2 className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                No hay conexiones disponibles
              </p>
              <Link href="/app/integraciones/conexiones">
                <Button variant="outline" size="sm" className="text-xs">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Ir a Integraciones
                </Button>
              </Link>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLinking}>
            Cancelar
          </Button>
          {availableConnections.length > 0 && (
            <Button
              onClick={handleLink}
              disabled={!selectedId || isLinking}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
              Vincular
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
