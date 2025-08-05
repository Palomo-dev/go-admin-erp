/**
 * Componente para mostrar el historial de entregas de una notificación
 */

'use client';

import React, { useState } from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RotateCcw, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Webhook,
  Send
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils/Utils';
import type { DeliveryLog } from '@/types/notification';

interface DeliveryHistoryProps {
  deliveryLogs: DeliveryLog[];
  onRefresh?: () => void;
}

export function DeliveryHistory({ deliveryLogs, onRefresh }: DeliveryHistoryProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    try {
      setRefreshing(true);
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'sent':
        return <Send className="h-4 w-4 text-blue-500" />;
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Pendiente</Badge>;
      case 'sent':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Enviado</Badge>;
      case 'delivered':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Entregado</Badge>;
      case 'failed':
        return <Badge variant="destructive">Fallido</Badge>;
      default:
        return <Badge variant="outline">Desconocido</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString(),
        full: date.toLocaleString()
      };
    } catch {
      return {
        date: 'Fecha inválida',
        time: '',
        full: dateString
      };
    }
  };

  const getProviderInfo = (providerResponse: any) => {
    if (!providerResponse || typeof providerResponse !== 'object') {
      return null;
    }

    // Extraer información común del proveedor
    const info = {
      provider: providerResponse.provider || 'Desconocido',
      messageId: providerResponse.message_id || providerResponse.id,
      status: providerResponse.status,
      error: providerResponse.error || providerResponse.error_message,
      details: providerResponse.details || providerResponse.response
    };

    return info;
  };

  const hasProviderDetails = (log: DeliveryLog) => {
    return log.provider_response && 
           Object.keys(log.provider_response).length > 0 &&
           JSON.stringify(log.provider_response) !== '{}';
  };

  if (!deliveryLogs || deliveryLogs.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Historial de Entregas
            </CardTitle>
            {onRefresh && (
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay registros de entrega disponibles</p>
            <p className="text-sm mt-2">
              Los registros aparecerán aquí cuando la notificación sea procesada
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Historial de Entregas ({deliveryLogs.length})
          </CardTitle>
          {onRefresh && (
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-4">
            {deliveryLogs.map((log, index) => {
              const dateInfo = formatDate(log.delivered_at);
              const providerInfo = getProviderInfo(log.provider_response);
              const isExpanded = expandedLogs.has(log.id);
              const hasDetails = hasProviderDetails(log);
              
              return (
                <div key={log.id} className="relative">
                  {/* Línea de tiempo */}
                  {index < deliveryLogs.length - 1 && (
                    <div className="absolute left-4 top-8 w-0.5 h-full bg-border" />
                  )}
                  
                  <div className="flex gap-3">
                    {/* Icono de estado */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center">
                      {getStatusIcon(log.status)}
                    </div>
                    
                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(log.status)}
                          <Badge variant="outline" className="text-xs">
                            Intento #{log.attempt_no}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {dateInfo.time}
                        </div>
                      </div>
                      
                      <div className="space-y-1 mb-2">
                        <p className="text-sm text-muted-foreground">
                          {dateInfo.date}
                        </p>
                        
                        {providerInfo?.provider && (
                          <p className="text-sm">
                            <span className="font-medium">Proveedor:</span> {providerInfo.provider}
                          </p>
                        )}
                        
                        {providerInfo?.messageId && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">ID:</span> {providerInfo.messageId}
                          </p>
                        )}
                        
                        {providerInfo?.error && (
                          <p className="text-sm text-red-600">
                            <span className="font-medium">Error:</span> {providerInfo.error}
                          </p>
                        )}
                      </div>
                      
                      {/* Detalles expandibles */}
                      {hasDetails && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => toggleLogExpansion(log.id)}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3 w-3 mr-1" />
                                  Ocultar detalles
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3 mr-1" />
                                  Ver detalles
                                </>
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2">
                            <div className="p-3 bg-muted rounded border text-xs">
                              <pre className="whitespace-pre-wrap font-mono">
                                {JSON.stringify(log.provider_response, null, 2)}
                              </pre>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  </div>
                  
                  {index < deliveryLogs.length - 1 && (
                    <Separator className="mt-4" />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
        
        {/* Información adicional */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            💡 El historial muestra todos los intentos de entrega de esta notificación. 
            Los detalles técnicos incluyen respuestas del proveedor de servicios.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
