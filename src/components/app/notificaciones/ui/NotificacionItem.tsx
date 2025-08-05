/**
 * Componente para renderizar un item individual de notificación
 * Incluye acciones individuales y estado visual optimizado
 */

'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils/Utils';
import { 
  Bell, 
  Eye, 
  Trash2, 
  Clock, 
  User,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Mail,
  MessageSquare,
  Phone,
  Webhook,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Check
} from 'lucide-react';
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Logger from '@/lib/utils/logger';
import type { Notification, NotificationChannel, NotificationType, SourceModule, ActionResult } from '@/types/notification';
import { 
  translateNotification, 
  getChannelIcon, 
  getCategoryColor,
  type NotificationTranslation
} from '@/utils/notificationTranslations';

// Tipos debugeados para evitar logs repetitivos
const debuggedTypes = new Set<string>();

/**
 * Props para NotificacionItem
 */
interface NotificacionItemProps {
  /** Notificación a mostrar */
  notification: Notification;
  /** Callback para marcar como leída */
  onMarkAsRead?: (id: string) => Promise<void>;
  /** Callback para eliminar */
  onDelete?: (id: string) => Promise<ActionResult>;
  /** Si está procesando alguna acción */
  processing?: boolean;
  /** Término de búsqueda para resaltar */
  searchTerm?: string;
  /** Si mostrar acciones */
  showActions?: boolean;
  /** Si mostrar navegación contextual */
  showNavigation?: boolean;
  /** Clases adicionales */
  className?: string;
}

/**
 * Mapeo de canales a iconos y colores
 */
const CHANNEL_CONFIG: Record<NotificationChannel, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
}> = {
  email: {
    icon: <Mail className="w-3 h-3" />,
    label: 'Email',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
  },
  sms: {
    icon: <MessageSquare className="w-3 h-3" />,
    label: 'SMS',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
  },
  push: {
    icon: <Phone className="w-3 h-3" />,
    label: 'Push',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/20',
  },
  whatsapp: {
    icon: <MessageSquare className="w-3 h-3" />,
    label: 'WhatsApp',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
  },
  webhook: {
    icon: <Bell className="w-3 h-3" />,
    label: 'Webhook',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-900/20',
  },
};

/**
 * Mapeo de estados de notificación
 */
const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  pending: {
    label: 'Pendiente',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
  },
  sent: {
    label: 'Enviado',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
  },
  delivered: {
    label: 'Entregado',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
  },
  failed: {
    label: 'Fallido',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/20',
  },
  read: {
    label: 'Leída',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-900/20',
  },
};

/**
 * Función para resaltar texto de búsqueda
 */
const highlightSearchTerm = (text: string, searchTerm?: string): React.ReactNode => {
  if (!searchTerm || !text) return text;

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
};

/**
 * Componente NotificacionItem
 */
export default function NotificacionItem({
  notification,
  onMarkAsRead,
  onDelete,
  processing = false,
  searchTerm,
  showActions = true,
  showNavigation = true,
  className,
}: NotificacionItemProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Debug: Verificar props recibidas
  Logger.debug('UI', `Renderizando NotificacionItem: ${notification.id} (${notification.payload?.type})`);

  // Configuración del canal
  const channelConfig = CHANNEL_CONFIG[notification.channel] || CHANNEL_CONFIG.push;
  
  // Configuración del estado
  const statusConfig = STATUS_CONFIG[notification.status] || STATUS_CONFIG.pending;

  // Estado de lectura
  const isRead = Boolean(notification.read_at);
  const isUnread = !isRead;

  // Procesar información de la notificación usando translateNotification
  const translation = useMemo(() => {
    return translateNotification(notification.payload || {});
  }, [notification.payload]);
  
  const { title: notificationTitle, message: notificationMessage, category: notificationCategory, icon: notificationIcon } = translation;

  /**
   * Manejar acción de marcar como leída
   */
  const handleMarkAsRead = async () => {
    console.log('🎯 handleMarkAsRead INICIADO:', {
      notificationId: notification.id,
      isRead,
      processing,
      hasOnMarkAsRead: !!onMarkAsRead,
      notification
    });
    
    if (!onMarkAsRead || isRead || processing) {
      console.log('🚫 handleMarkAsRead CANCELADO:', { onMarkAsRead: !!onMarkAsRead, isRead, processing });
      return;
    }
    
    setActionLoading('read');
    try {
      console.log('📞 Llamando onMarkAsRead con ID:', notification.id);
      await onMarkAsRead(notification.id);
      console.log('✅ onMarkAsRead completado exitosamente');
    } catch (error) {
      console.error('❌ Error en handleMarkAsRead:', error);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Manejar acción de eliminar
   */
  const handleDelete = async () => {
    console.log('🚨 HANDLE DELETE EJECUTADO:', { notificationId: notification.id, hasOnDelete: !!onDelete, processing, onDeleteType: typeof onDelete });
    if (!onDelete) {
      console.error('❌ handleDelete cancelado: onDelete no disponible');
      return;
    }
    if (processing) {
      console.error('❌ handleDelete cancelado: en procesamiento');
      return;
    }
    console.log('🗑️ Eliminando directamente sin confirmación...');
    setActionLoading('delete');
    try {
      console.log('📡 Llamando onDelete con ID:', notification.id);
      await onDelete(notification.id);
      console.log('✅ onDelete ejecutado exitosamente');
    } catch (error) {
      console.error('❌ Error al eliminar notificación:', error);
    } finally {
      setActionLoading(null);
      console.log('🏁 handleDelete finalizado');
    }
  };

  /**
   * Obtener contenido traducido y enriquecido
   */
  const getContent = (): NotificationTranslation & { metadata: any } => {
    try {
      const payload = typeof notification.payload === 'string' 
        ? JSON.parse(notification.payload) 
        : notification.payload;

      // Usar datos enriquecidos del servicio si están disponibles
      if (payload?.title && payload?.content) {
        Logger.debug('UI', `Usando datos enriquecidos: ${payload.title}`);
        
        // Determinar categoría basada en el tipo original
        let category: 'info' | 'success' | 'warning' | 'error' = 'info';
        const originalType = payload.original_type || payload.type;
        
        if (originalType?.includes('won') || originalType?.includes('success')) {
          category = 'success';
        } else if (originalType?.includes('lost') || originalType?.includes('warning')) {
          category = 'warning';
        } else if (originalType?.includes('error') || originalType?.includes('failed')) {
          category = 'error';
        }
        
        return {
          title: payload.title,
          message: payload.content,
          category,
          metadata: payload?.metadata || {},
        };
      }

      // Fallback al sistema de traducción antiguo si no hay datos enriquecidos
      console.log('🔄 Fallback a sistema de traducción antigua para:', payload?.type);
      const translation = translateNotification(payload);
      
      return {
        ...translation,
        metadata: payload?.metadata || {},
      };
    } catch (error) {
      console.error('❌ Error procesando contenido de notificación:', error);
      return {
        title: 'Notificación',
        message: 'Sin mensaje',
        category: 'info' as const,
        metadata: {},
      };
    }
  };

  const { title, message, category, icon, metadata } = getContent();
  const router = useRouter();

  /**
   * Obtener URL de navegación contextual
   */
  const getContextUrl = () => {
    try {
      const payload = typeof notification.payload === 'string' 
        ? JSON.parse(notification.payload) 
        : notification.payload;

      const contextType = payload?.context?.type;
      const contextId = payload?.context?.id;
      const sourceModule = payload?.source_module;

      if (contextType && contextId) {
        switch (contextType) {
          case 'customer':
            return `/app/clientes/${contextId}`;
          case 'opportunity':
            return `/app/crm/pipeline?opportunity=${contextId}`;
          case 'task':
            return `/app/crm/tareas?task=${contextId}`;
          case 'activity':
            return `/app/crm/actividades?activity=${contextId}`;
          case 'invoice':
            return `/app/finanzas/facturas/${contextId}`;
          case 'booking':
            return `/app/pms?booking=${contextId}`;
          case 'product':
            return `/app/inventario/productos/${contextId}`;
          default:
            return null;
        }
      }

      // Fallback por módulo de origen
      if (sourceModule) {
        switch (sourceModule) {
          case 'crm':
            return '/app/crm';
          case 'inventario':
            return '/app/inventario';
          case 'pms':
            return '/app/pms';
          case 'finanzas':
            return '/app/finanzas';
          case 'hrm':
            return '/app/hrm';
          default:
            return null;
        }
      }

      return null;
    } catch (error) {
      console.error('Error obteniendo URL de contexto:', error);
      return null;
    }
  };

  /**
   * Navegar al contexto
   */
  const handleNavigateToContext = () => {
    const url = getContextUrl();
    if (url) {
      router.push(url);
    }
  };

  /**
   * Formatear tiempo
   */
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Menos de 1 minuto
    if (diff < 60000) {
      return 'Ahora';
    }
    
    // Menos de 1 hora
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `Hace ${minutes} min`;
    }
    
    // Menos de 1 día
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `Hace ${hours}h`;
    }
    
    // Más de 1 día
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TooltipProvider>
      <div 
        className={cn(
          'p-4 transition-all duration-200 hover:bg-muted/50',
          isUnread && 'bg-blue-50/30 dark:bg-blue-950/10',
          processing && 'opacity-50 pointer-events-none',
          className
        )}
      >
        <div className="flex items-start space-x-3">
          {/* Indicador de estado */}
          <div className="flex flex-col items-center space-y-1 mt-1">
            <div className={cn(
              'p-2 rounded-full',
              channelConfig.bgColor
            )}>
              <div className={channelConfig.color}>
                {channelConfig.icon}
              </div>
            </div>
            
            {isUnread && (
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  {/* Icono de categoría */}
                  {notificationIcon && (
                    <span className="text-sm">{notificationIcon}</span>
                  )}
                  
                  <h4 className={cn(
                    'font-medium text-sm leading-tight',
                    isUnread ? getCategoryColor(notificationCategory) : 'text-muted-foreground'
                  )}>
                    {highlightSearchTerm(notificationTitle, searchTerm)}
                  </h4>
                  
                  {/* Badge de categoría */}
                  <Badge 
                    variant={notificationCategory === 'success' ? 'default' : 
                             notificationCategory === 'warning' ? 'secondary' :
                             notificationCategory === 'error' ? 'destructive' : 'outline'}
                    className="text-xs px-2 py-0"
                  >
                    {notificationCategory === 'success' ? 'Éxito' :
                     notificationCategory === 'warning' ? 'Advertencia' :
                     notificationCategory === 'error' ? 'Error' : 'Info'}
                  </Badge>
                </div>
                
                <p className={cn(
                  'text-sm line-clamp-2',
                  isUnread ? 'text-foreground' : 'text-muted-foreground/70'
                )}>
                  {highlightSearchTerm(notificationMessage, searchTerm)}
                </p>
                
                {/* Información adicional del payload */}
                {(metadata.opportunity_id || metadata.customer_name || metadata.task_title) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {metadata.opportunity_id && (
                      <Badge variant="outline" className="text-xs">
                        Oportunidad
                      </Badge>
                    )}
                    {metadata.customer_name && (
                      <Badge variant="outline" className="text-xs">
                        Cliente: {metadata.customer_name}
                      </Badge>
                    )}
                    {metadata.task_title && (
                      <Badge variant="outline" className="text-xs">
                        Tarea: {metadata.task_title}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Acciones */}
              {showActions && (
                <div className="flex items-center space-x-1 ml-3">
                  {isUnread && onMarkAsRead && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleMarkAsRead}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'read' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Marcar como leída</TooltipContent>
                    </Tooltip>
                  )}

                  {/* Ver detalles de la notificación */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/app/notificaciones/detalle/${notification.id}`)}
                        disabled={actionLoading !== null}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Ver detalles</TooltipContent>
                  </Tooltip>

                  {/* Navegación contextual */}
                  {showNavigation && getContextUrl() && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleNavigateToContext}
                          disabled={actionLoading !== null}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Abrir en contexto</TooltipContent>
                    </Tooltip>
                  )}

                  {onDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            console.log('🗿 CLICK EN BOTÓN ELIMINAR - ANTES DE handleDelete');
                            handleDelete();
                          }}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'delete' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Archivar</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>

            {/* Metadatos */}
            <div className="flex items-center space-x-3 text-xs text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{formatTime(notification.created_at)}</span>
                {isRead && notification.read_at && (
                  <span>• Leída {formatTime(notification.read_at)}</span>
                )}
              </div>

              <Separator orientation="vertical" className="h-3" />

              <Badge 
                variant="secondary" 
                className={cn(
                  'text-xs',
                  channelConfig.color,
                  channelConfig.bgColor
                )}
              >
                {channelConfig.label}
              </Badge>

              <Badge 
                variant="outline" 
                className={cn(
                  'text-xs',
                  statusConfig.color
                )}
              >
                {statusConfig.label}
              </Badge>

              {notification.recipient_email && (
                <span className="truncate max-w-32">
                  {notification.recipient_email}
                </span>
              )}
            </div>

            {/* Mensaje de error si existe */}
            {notification.error_msg && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
                <strong>Error:</strong> {notification.error_msg}
              </div>
            )}

            {/* Metadatos adicionales */}
            {metadata && Object.keys(metadata).length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver detalles técnicos
                </summary>
                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
