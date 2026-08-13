'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { Webhook, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import type { WebhookResumen } from '@/lib/services/integracionesDashboardService';

interface WebhooksListProps {
  webhooks: WebhookResumen[];
  isLoading: boolean;
  maxItems?: number;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function WebhooksList({ webhooks, isLoading, maxItems = 6 }: WebhooksListProps) {
  return (
    <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Webhook className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Webhooks configurados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <Webhook className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Sin webhooks</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              No hay webhooks configurados
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.slice(0, maxItems).map((w) => (
              <div
                key={w.id}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {w.direction === 'inbound' ? (
                      <ArrowDownToLine className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    ) : (
                      <ArrowUpFromLine className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {w.connectionName}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0',
                      w.isActive
                        ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                        : 'border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400',
                    )}
                  >
                    {w.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                  {w.url}
                </p>
                {w.events.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {w.events.slice(0, 4).map((ev) => (
                      <Badge
                        key={ev}
                        variant="secondary"
                        className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      >
                        {ev}
                      </Badge>
                    ))}
                    {w.events.length > 4 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        +{w.events.length - 4}
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  Últ. recepción: {formatDate(w.lastReceivedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WebhooksList;
