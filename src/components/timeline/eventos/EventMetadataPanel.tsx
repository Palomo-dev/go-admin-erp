'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Info,
  Copy,
  Check,
  Globe,
  Monitor,
  Clock,
  Database,
  Hash,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';

interface EventMetadataPanelProps {
  event: TimelineEvent;
}

export function EventMetadataPanel({ event }: EventMetadataPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const metadata = event.metadata as Record<string, unknown> | null;
  const eventTime = new Date(event.event_time);
  const createdAt = new Date(event.created_at);

  const metadataItems = [
    {
      label: 'Event ID',
      value: event.event_id,
      icon: Hash,
      copyable: true,
    },
    {
      label: 'Tabla Fuente',
      value: event.source_table,
      icon: Database,
      copyable: false,
    },
    {
      label: 'Categoría',
      value: event.source_category,
      icon: Info,
      copyable: false,
    },
    {
      label: 'IP Address',
      value: event.ip_address || 'N/A',
      icon: Globe,
      copyable: event.ip_address ? true : false,
    },
    {
      label: 'Fecha del Evento',
      value: format(eventTime, "yyyy-MM-dd HH:mm:ss.SSS", { locale: es }),
      icon: Clock,
      copyable: true,
    },
    {
      label: 'Fecha de Creación',
      value: format(createdAt, "yyyy-MM-dd HH:mm:ss.SSS", { locale: es }),
      icon: Clock,
      copyable: true,
    },
    {
      label: 'Organization ID',
      value: String(event.organization_id),
      icon: Database,
      copyable: true,
    },
    {
      label: 'Branch ID',
      value: event.branch_id ? String(event.branch_id) : 'N/A',
      icon: Database,
      copyable: event.branch_id ? true : false,
    },
  ];

  // Extraer user-agent de metadata si existe
  const userAgent = metadata?.user_agent as string | undefined;
  const browserInfo = metadata?.browser as string | undefined;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-500" />
          Metadatos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metadatos principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {metadataItems.map((item) => (
            <div
              key={item.label}
              className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <item.icon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className="text-sm font-mono text-gray-900 dark:text-white truncate" title={item.value}>
                    {item.value}
                  </p>
                </div>
              </div>
              {item.copyable && item.value !== 'N/A' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(item.value, item.label)}
                        className="h-7 w-7 p-0 flex-shrink-0"
                      >
                        {copiedField === item.label ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{copiedField === item.label ? 'Copiado!' : 'Copiar'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ))}
        </div>

        {/* User Agent */}
        {(userAgent || browserInfo) && (
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="h-4 w-4 text-gray-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400">User Agent / Browser</p>
            </div>
            <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
              {userAgent || browserInfo}
            </p>
          </div>
        )}

        {/* Metadata adicional */}
        {metadata && Object.keys(metadata).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Metadata Adicional
              </h4>
              <Badge variant="outline" className="text-xs">
                {Object.keys(metadata).length} campos
              </Badge>
            </div>
            <ScrollArea className="h-48">
              <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-gray-700 dark:text-gray-300">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        )}

        {/* Payload completo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Payload Completo
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(JSON.stringify(event.payload, null, 2), 'payload')}
              className="h-7 text-xs"
            >
              {copiedField === 'payload' ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copiar JSON
                </>
              )}
            </Button>
          </div>
          <ScrollArea className="h-48">
            <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-gray-700 dark:text-gray-300">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
