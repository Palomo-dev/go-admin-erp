'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Plus, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface CredentialsHeaderProps {
  connection: IntegrationConnection | null;
  credentialsCount: number;
  activeCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onNewCredential: () => void;
}

export function CredentialsHeader({
  connection,
  credentialsCount,
  activeCount,
  refreshing,
  onRefresh,
  onNewCredential,
}: CredentialsHeaderProps) {
  const connectionId = connection?.id;

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={connectionId ? `/app/integraciones/conexiones/${connectionId}` : '/app/integraciones/conexiones'}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </Link>

          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                Credenciales
              </h1>
              {credentialsCount > 0 && (
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {activeCount} activa{activeCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {connection?.name || 'Conexión'} • Gestión de credenciales
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button size="sm" onClick={onNewCredential}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva credencial
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
