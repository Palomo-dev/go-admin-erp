'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Copy,
  Edit,
  Power,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { IntegrationCredential } from '@/lib/services/integrationsService';

interface CredentialsListProps {
  credentials: IntegrationCredential[];
  loading: boolean;
  onEdit: (credential: IntegrationCredential) => void;
  onDuplicate: (credential: IntegrationCredential) => void;
  onRevoke: (credential: IntegrationCredential) => void;
  onReactivate: (credential: IntegrationCredential) => void;
  onDelete: (credential: IntegrationCredential) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Activa', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  expired: { label: 'Expirada', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  revoked: { label: 'Revocada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  rotating: { label: 'Rotando', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

const PURPOSE_CONFIG: Record<string, string> = {
  primary: 'Principal',
  backup: 'Backup',
  rotation: 'Rotación',
  legacy: 'Legacy',
};

export function CredentialsList({
  credentials,
  loading,
  onEdit,
  onDuplicate,
  onRevoke,
  onReactivate,
  onDelete,
}: CredentialsListProps) {
  if (loading && credentials.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (credentials.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            No hay credenciales configuradas
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Crea una nueva credencial para comenzar
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {credentials.map((cred) => {
        const statusConfig = STATUS_CONFIG[cred.status] || STATUS_CONFIG.active;
        const isActive = cred.status === 'active';

        return (
          <Card
            key={cred.id}
            className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {isActive ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold dark:text-white">
                        {cred.credential_type}
                      </span>
                      <Badge className={statusConfig.color}>
                        {statusConfig.label}
                      </Badge>
                      <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                        {PURPOSE_CONFIG[cred.purpose] || cred.purpose}
                      </Badge>
                    </div>

                    {cred.key_prefix && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                        {cred.key_prefix}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {cred.expires_at && (
                        <span>Expira: {new Date(cred.expires_at).toLocaleDateString()}</span>
                      )}
                      {cred.rotated_at && (
                        <span>Rotada: {new Date(cred.rotated_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(cred)}
                    className="h-8 w-8 p-0"
                    title="Rotar"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDuplicate(cred)}
                    className="h-8 w-8 p-0"
                    title="Duplicar"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(cred)}
                      className="h-8 w-8 p-0 text-orange-500"
                      title="Revocar"
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReactivate(cred)}
                      className="h-8 w-8 p-0 text-green-500"
                      title="Reactivar"
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(cred)}
                    className="h-8 w-8 p-0 text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
