'use client';

import { MoreVertical, RotateCcw, Ban, Copy, Check, Clock, Shield } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ChannelApiKey } from '@/lib/services/inboxConfigService';

interface ApiKeyCardProps {
  apiKey: ChannelApiKey;
  onRevoke: (key: ChannelApiKey) => void;
  onRotate: (key: ChannelApiKey) => void;
}

export default function ApiKeyCard({ apiKey, onRevoke, onRotate }: ApiKeyCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopyPrefix = async () => {
    await navigator.clipboard.writeText(apiKey.key_prefix + '...');
    setCopied(true);
    toast({
      title: 'Copiado',
      description: 'Prefijo de la llave copiado'
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = apiKey.expires_at && new Date(apiKey.expires_at) < new Date();
  const isRevoked = !!apiKey.revoked_at;

  return (
    <div className={`bg-white dark:bg-gray-900 border rounded-lg p-4 ${
      !apiKey.is_active || isExpired || isRevoked
        ? 'border-gray-300 dark:border-gray-700 opacity-75'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {apiKey.name}
            </h3>
            {apiKey.is_active && !isExpired && !isRevoked ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Activa
              </Badge>
            ) : isRevoked ? (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Revocada
              </Badge>
            ) : isExpired ? (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                Expirada
              </Badge>
            ) : (
              <Badge variant="secondary">Inactiva</Badge>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
              {apiKey.key_prefix}...
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyPrefix}
              className="h-7 w-7 p-0"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {apiKey.channel && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Canal: {apiKey.channel.name} ({apiKey.channel.type})
            </p>
          )}
        </div>

        {apiKey.is_active && !isRevoked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRotate(apiKey)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Rotar llave
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRevoke(apiKey)}
                className="text-red-600 dark:text-red-400"
              >
                <Ban className="h-4 w-4 mr-2" />
                Revocar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {apiKey.scopes && apiKey.scopes.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
            <Shield className="h-3 w-3" />
            Permisos:
          </div>
          <div className="flex flex-wrap gap-1">
            {apiKey.scopes.map((scope) => (
              <span
                key={scope}
                className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>
            Creada {formatDistanceToNow(new Date(apiKey.created_at), { addSuffix: true, locale: es })}
          </span>
        </div>
        {apiKey.last_used_at && (
          <div>
            Último uso: {formatDistanceToNow(new Date(apiKey.last_used_at), { addSuffix: true, locale: es })}
          </div>
        )}
        {apiKey.expires_at && (
          <div className={isExpired ? 'text-red-500' : ''}>
            {isExpired ? 'Expiró' : 'Expira'}: {formatDistanceToNow(new Date(apiKey.expires_at), { addSuffix: true, locale: es })}
          </div>
        )}
      </div>
    </div>
  );
}
