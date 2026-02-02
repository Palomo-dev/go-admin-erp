'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  ExternalLink,
  Download,
  Link2,
  Copy,
  Check,
  FileJson,
  Eye,
} from 'lucide-react';
import type { TimelineEvent } from '@/lib/services/timelineService';

interface EventActionsProps {
  event: TimelineEvent;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
  onViewCorrelation: (correlationId: string) => void;
}

export function EventActions({
  event,
  onNavigateToEntity,
  onViewCorrelation,
}: EventActionsProps) {
  const { toast } = useToast();
  const [copiedCorrelation, setCopiedCorrelation] = useState(false);
  const [copiedEventId, setCopiedEventId] = useState(false);

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(event, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evento-${event.event_id.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Evento exportado',
      description: 'El archivo JSON se descargó correctamente',
    });
  };

  const handleCopyCorrelationId = () => {
    if (event.correlation_id) {
      navigator.clipboard.writeText(event.correlation_id);
      setCopiedCorrelation(true);
      setTimeout(() => setCopiedCorrelation(false), 2000);
      toast({
        title: 'Copiado',
        description: 'Correlation ID copiado al portapapeles',
      });
    }
  };

  const handleCopyEventId = () => {
    navigator.clipboard.writeText(event.event_id);
    setCopiedEventId(true);
    setTimeout(() => setCopiedEventId(false), 2000);
    toast({
      title: 'Copiado',
      description: 'Event ID copiado al portapapeles',
    });
  };

  const actions = [
    {
      label: 'Ver Entidad',
      icon: ExternalLink,
      onClick: () => onNavigateToEntity(event.entity_type, event.entity_id),
      variant: 'default' as const,
      className: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    {
      label: 'Exportar JSON',
      icon: Download,
      onClick: handleExportJSON,
      variant: 'outline' as const,
      className: 'border-gray-300 dark:border-gray-600',
    },
    {
      label: copiedEventId ? 'Copiado!' : 'Copiar Event ID',
      icon: copiedEventId ? Check : Copy,
      onClick: handleCopyEventId,
      variant: 'outline' as const,
      className: 'border-gray-300 dark:border-gray-600',
    },
  ];

  if (event.correlation_id) {
    actions.splice(1, 0, {
      label: 'Ver Trazas de Correlación',
      icon: Link2,
      onClick: () => onViewCorrelation(event.correlation_id!),
      variant: 'outline' as const,
      className: 'border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20',
    });

    actions.push({
      label: copiedCorrelation ? 'Copiado!' : 'Copiar Correlation ID',
      icon: copiedCorrelation ? Check : Copy,
      onClick: handleCopyCorrelationId,
      variant: 'outline' as const,
      className: 'border-gray-300 dark:border-gray-600',
    });
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Eye className="h-5 w-5 text-blue-500" />
          Acciones
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              variant={action.variant}
              onClick={action.onClick}
              className={action.className}
            >
              <action.icon className="h-4 w-4 mr-2" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Info adicional */}
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Nota:</strong> Este evento es de solo lectura. Los datos de auditoría 
            no pueden ser modificados por razones de compliance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
