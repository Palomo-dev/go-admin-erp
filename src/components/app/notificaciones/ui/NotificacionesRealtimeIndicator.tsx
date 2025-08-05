/**
 * Indicador de conexión en tiempo real para notificaciones
 * Muestra el estado de la conexión y notificaciones en vivo
 */

'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/utils/Utils';
import { 
  Wifi, 
  WifiOff, 
  Loader2,
  Bell,
  AlertTriangle,
  CheckCircle2,
  X
} from 'lucide-react';
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

/**
 * Estados de conexión posibles
 */
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Props para NotificacionesRealtimeIndicator
 */
interface NotificacionesRealtimeIndicatorProps {
  /** Si mostrar detalles extendidos */
  showDetails?: boolean;
  /** Callback cuando cambia el estado */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Clases adicionales */
  className?: string;
}

/**
 * Configuración de estados
 */
const STATUS_CONFIG: Record<ConnectionStatus, {
  icon: React.ReactNode;
  label: string;
  color: string;
  description: string;
}> = {
  connecting: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    label: 'Conectando',
    color: 'text-yellow-600',
    description: 'Estableciendo conexión en tiempo real...',
  },
  connected: {
    icon: <Wifi className="w-4 h-4" />,
    label: 'Conectado',
    color: 'text-green-600',
    description: 'Conexión activa - Recibiendo notificaciones en tiempo real',
  },
  disconnected: {
    icon: <WifiOff className="w-4 h-4" />,
    label: 'Desconectado',
    color: 'text-gray-500',
    description: 'Sin conexión en tiempo real',
  },
  error: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Error',
    color: 'text-red-600',
    description: 'Error en la conexión - Intentando reconectar...',
  },
};

/**
 * Componente NotificacionesRealtimeIndicator
 */
export function NotificacionesRealtimeIndicator({
  showDetails = false,
  onStatusChange,
  className,
}: NotificacionesRealtimeIndicatorProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newNotifications, setNewNotifications] = useState(0);
  const [channel, setChannel] = useState<any>(null);

  /**
   * Actualizar estado y notificar cambios
   */
  const updateStatus = (newStatus: ConnectionStatus) => {
    console.log('🔔 Estado de conexión:', newStatus);
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  /**
   * Configurar conexión en tiempo real
   */
  useEffect(() => {
    let mounted = true;
    let reconnectTimeout: NodeJS.Timeout;

    const setupConnection = async () => {
      try {
        updateStatus('connecting');
        
        // Obtener organización activa
        const organizacion = obtenerOrganizacionActiva();
        const organizationId = organizacion.id;
        
        console.log('🔔 Configurando conexión para organización:', organizationId);

        // Limpiar canal anterior si existe
        if (channel) {
          await supabase.removeChannel(channel);
        }

        // Crear nuevo canal
        const newChannel = supabase.channel(`notifications-realtime-${organizationId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `organization_id=eq.${organizationId}`,
            },
            (payload) => {
              console.log('🔔 Nueva notificación:', payload);
              if (mounted) {
                setLastUpdate(new Date());
                setNewNotifications(prev => prev + 1);
                
                // Mostrar notificación del navegador si es nueva
                if (payload.eventType === 'INSERT' && 'Notification' in window) {
                  try {
                    const data = payload.new as any;
                    const payloadData = typeof data.payload === 'string' 
                      ? JSON.parse(data.payload) 
                      : data.payload;
                    
                    new Notification('Nueva notificación', {
                      body: payloadData?.message || 'Tienes una nueva notificación',
                      icon: '/favicon.ico',
                      tag: `notification-${data.id}`,
                    });
                  } catch (error) {
                    console.warn('Error mostrando notificación del navegador:', error);
                  }
                }
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'system_alerts',
              filter: `organization_id=eq.${organizationId}`,
            },
            (payload) => {
              console.log('🚨 Nueva alerta:', payload);
              if (mounted) {
                setLastUpdate(new Date());
                setNewNotifications(prev => prev + 1);
              }
            }
          )
          .subscribe((status, err) => {
            if (!mounted) return;
            
            console.log('🔔 Estado de suscripción:', status, err);
            
            if (status === 'SUBSCRIBED') {
              updateStatus('connected');
            } else if (status === 'CHANNEL_ERROR' || err) {
              updateStatus('error');
              // Intentar reconectar después de 5 segundos
              reconnectTimeout = setTimeout(() => {
                if (mounted) {
                  setupConnection();
                }
              }, 5000);
            }
          });

        if (mounted) {
          setChannel(newChannel);
        }

      } catch (error) {
        console.error('Error configurando conexión en tiempo real:', error);
        if (mounted) {
          updateStatus('error');
          // Intentar reconectar después de 5 segundos
          reconnectTimeout = setTimeout(() => {
            if (mounted) {
              setupConnection();
            }
          }, 5000);
        }
      }
    };

    // Solicitar permisos de notificación
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    setupConnection();

    return () => {
      mounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  /**
   * Reconectar manualmente
   */
  const handleReconnect = () => {
    setStatus('connecting');
    window.location.reload(); // Reinicia la conexión completamente
  };

  /**
   * Limpiar contador
   */
  const handleClearCounter = () => {
    setNewNotifications(0);
  };

  const statusConfig = STATUS_CONFIG[status];

  return (
    <TooltipProvider>
      <div className={cn('flex items-center space-x-2', className)}>
        {/* Indicador principal */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'flex items-center space-x-1 px-2 py-1 rounded-md transition-colors',
              status === 'connected' && 'bg-green-50 dark:bg-green-950/20',
              status === 'error' && 'bg-red-50 dark:bg-red-950/20',
              status === 'connecting' && 'bg-yellow-50 dark:bg-yellow-950/20',
              status === 'disconnected' && 'bg-gray-50 dark:bg-gray-950/20'
            )}>
              <span className={statusConfig.color}>
                {statusConfig.icon}
              </span>
              
              {showDetails && (
                <span className={cn('text-xs font-medium', statusConfig.color)}>
                  {statusConfig.label}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium">{statusConfig.label}</p>
              <p className="text-xs">{statusConfig.description}</p>
              {lastUpdate && (
                <p className="text-xs text-muted-foreground">
                  Última actualización: {lastUpdate.toLocaleTimeString()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Contador de nuevas notificaciones */}
        {newNotifications > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearCounter}
                className="h-6 px-2"
              >
                <Bell className="w-3 h-3 mr-1" />
                <Badge variant="secondary" className="h-4 px-1 text-xs">
                  {newNotifications > 99 ? '99+' : newNotifications}
                </Badge>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Nuevas notificaciones recibidas</p>
              <p className="text-xs text-muted-foreground">Click para limpiar contador</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Botón de reconexión en caso de error */}
        {status === 'error' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReconnect}
                className="h-6 px-2"
              >
                <CheckCircle2 className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reconectar</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
