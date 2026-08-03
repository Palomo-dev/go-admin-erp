'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Edit,
  Copy,
  Power,
  Trash2,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { IntegrationWebhook } from '@/lib/services/integrationsService';

interface WebhooksListProps {
  webhooks: IntegrationWebhook[];
  loading: boolean;
  onEdit: (webhook: IntegrationWebhook) => void;
  onDuplicate: (webhook: IntegrationWebhook) => void;
  onToggleStatus: (webhook: IntegrationWebhook) => void;
  onTest: (webhook: IntegrationWebhook) => void;
  onDelete: (webhook: IntegrationWebhook) => void;
}

export function WebhooksList({
  webhooks,
  loading,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onTest,
  onDelete,
}: WebhooksListProps) {
  if (loading && webhooks.length === 0) {
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

  if (webhooks.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            No hay webhooks configurados
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Crea un nuevo webhook para recibir eventos
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {webhooks.map((webhook) => {
        const isActive = webhook.is_active;

        return (
          <Card
            key={webhook.id}
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
                        {webhook.direction === 'inbound' ? 'Entrante' : 'Saliente'}
                      </span>
                      <Badge
                        className={isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }
                      >
                        {isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono truncate">
                      {webhook.url}
                    </p>

                    {webhook.events && webhook.events.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {webhook.events.map((event, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs dark:border-gray-600 dark:text-gray-300"
                          >
                            {event}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span>Método: {webhook.signing_method}</span>
                      {webhook.last_received_at && (
                        <span>Último: {new Date(webhook.last_received_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(webhook)}
                    className="h-8 w-8 p-0"
                    title="Editar"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDuplicate(webhook)}
                    className="h-8 w-8 p-0"
                    title="Duplicar"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTest(webhook)}
                    className="h-8 w-8 p-0 text-blue-500"
                    title="Probar"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleStatus(webhook)}
                    className={`h-8 w-8 p-0 ${isActive ? 'text-orange-500' : 'text-green-500'}`}
                    title={isActive ? 'Desactivar' : 'Activar'}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(webhook)}
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
