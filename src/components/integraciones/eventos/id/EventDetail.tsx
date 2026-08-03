'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Download,
  RotateCcw,
  ExternalLink,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IntegrationEvent } from '@/lib/services/integrationsService';
import { cn, formatDate } from '@/utils/Utils';
import { useToast } from '@/components/ui/use-toast';

interface EventDetailProps {
  event: IntegrationEvent;
  onReprocess: () => void;
  reprocessing?: boolean;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'processed':
      return {
        icon: CheckCircle2,
        label: 'Procesado',
        className: 'text-green-600 dark:text-green-400',
        bgClassName: 'bg-green-100 dark:bg-green-900/30',
      };
    case 'error':
      return {
        icon: XCircle,
        label: 'Error',
        className: 'text-red-600 dark:text-red-400',
        bgClassName: 'bg-red-100 dark:bg-red-900/30',
      };
    default:
      return {
        icon: Clock,
        label: 'Recibido',
        className: 'text-yellow-600 dark:text-yellow-400',
        bgClassName: 'bg-yellow-100 dark:bg-yellow-900/30',
      };
  }
};

export function EventDetail({ event, onReprocess, reprocessing = false }: EventDetailProps) {
  const { toast } = useToast();
  const [showFullPayload, setShowFullPayload] = useState(false);
  const connection = event.connection as any;
  const statusConfig = getStatusConfig(event.status);
  const StatusIcon = statusConfig.icon;

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
    toast({
      title: 'Copiado',
      description: 'Payload copiado al portapapeles',
    });
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(event.id);
    toast({
      title: 'Copiado',
      description: 'ID del evento copiado al portapapeles',
    });
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(event, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-${event.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const payloadString = JSON.stringify(event.payload, null, 2);
  const isLargePayload = payloadString.length > 1000;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="px-4 sm:px-6 py-4">
          {/* Navegación */}
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <Link
              href="/app/integraciones/eventos"
              className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Eventos
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white font-medium truncate max-w-[200px]">
              {event.event_type}
            </span>
          </div>

          {/* Header principal */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/app/integraciones/eventos"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2.5 rounded-xl',
                    event.direction === 'inbound'
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-orange-100 dark:bg-orange-900/30'
                  )}
                >
                  {event.direction === 'inbound' ? (
                    <ArrowDownLeft className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <ArrowUpRight className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  )}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    {event.event_type}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {connection?.name || 'Conexión'} • {event.source}
                  </p>
                </div>
              </div>

              {/* Badge de estado */}
              <Badge className={cn('ml-2', statusConfig.bgClassName, statusConfig.className)}>
                <StatusIcon className="h-3.5 w-3.5 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyId}
                className="dark:border-gray-700 dark:text-gray-300"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar ID
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadJson}
                className="dark:border-gray-700 dark:text-gray-300"
              >
                <Download className="h-4 w-4 mr-2" />
                Descargar JSON
              </Button>
              <Button
                size="sm"
                onClick={onReprocess}
                disabled={reprocessing}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <RotateCcw className={`h-4 w-4 mr-2 ${reprocessing ? 'animate-spin' : ''}`} />
                {reprocessing ? 'Procesando...' : 'Reprocesar'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Información del evento */}
            <div className="lg:col-span-1 space-y-6">
              {/* Detalles básicos */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold dark:text-white">
                    Información del Evento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">ID</span>
                    <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                      {event.id}
                    </p>
                  </div>
                  {event.external_event_id && (
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                        ID Externo
                      </span>
                      <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                        {event.external_event_id}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                      Dirección
                    </span>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {event.direction === 'inbound' ? 'Entrante' : 'Saliente'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                      Fuente
                    </span>
                    <p className="text-sm text-gray-900 dark:text-white capitalize">{event.source}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Conexión */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold dark:text-white">
                    Conexión
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/app/integraciones/conexiones/${event.connection_id}`}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Activity className="h-5 w-5 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {connection?.name || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {connection?.connector?.provider?.name || 'Proveedor'}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </Link>
                </CardContent>
              </Card>

              {/* Timestamps */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold dark:text-white">
                    Tiempos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Recibido</span>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                  </div>
                  {event.processed_at && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Procesado</span>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {formatDate(event.processed_at)}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payload y Error */}
            <div className="lg:col-span-2 space-y-6">
              {/* Error (si existe) */}
              {event.error_message && (
                <Card className="bg-white dark:bg-gray-900 border-red-200 dark:border-red-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Mensaje de Error
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap overflow-x-auto">
                      {event.error_message}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Payload */}
              <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold dark:text-white">
                      Payload
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {(payloadString.length / 1024).toFixed(1)} KB
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={handleCopyPayload}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre
                      className={cn(
                        'p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm font-mono text-gray-800 dark:text-gray-200 overflow-x-auto',
                        !showFullPayload && isLargePayload && 'max-h-[400px] overflow-hidden'
                      )}
                    >
                      {payloadString}
                    </pre>
                    {isLargePayload && !showFullPayload && (
                      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-50 dark:from-gray-800 to-transparent flex items-end justify-center pb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFullPayload(true)}
                        >
                          Mostrar todo
                        </Button>
                      </div>
                    )}
                    {isLargePayload && showFullPayload && (
                      <div className="mt-2 flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFullPayload(false)}
                        >
                          Colapsar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EventDetail;
