/**
 * Vista detallada de una notificación
 * Muestra el contenido completo, archivos adjuntos, historial de entregas y acciones disponibles
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Archive,
  RotateCcw,
  Mail,
  Phone,
  MessageSquare,
  Webhook,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  MoreHorizontal,
  User,
  TrendingUp,
  BarChart3,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { useNotificationDetail } from '@/lib/hooks/useNotificationDetail';
import type { NotificationDetailAction } from '@/types/notification';
import { translateNotification } from '@/utils/notificationTranslations';
// Importar componentes desde el mismo directorio
import { NotificationAttachments } from './NotificationAttachments';
import { NotificationLinks } from './NotificationLinks';
import { DeliveryHistory } from './DeliveryHistory';

interface NotificationDetailViewProps {
  notificationId: string;
  onClose?: () => void;
  showBackButton?: boolean;
}

export function NotificationDetailView({ 
  notificationId, 
  onClose, 
  showBackButton = true 
}: NotificationDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  
  // Usar el hook personalizado
  const {
    notification,
    loading,
    error,
    actionLoading,
    loadDetail,
    markAsRead,
    markAsUnread,
    archive,
    retryDelivery,
    refreshDeliveryLogs
  } = useNotificationDetail(notificationId);

  // Obtener la traducción de la notificación
  const translation = React.useMemo(() => {
    if (!notification) return null;
    return translateNotification(notification.payload);
  }, [notification]);

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      router.back();
    }
  };

  const handleAction = async (actionId: string) => {
    if (!notification) return;
    
    try {
      let result;
      
      switch (actionId) {
        case 'mark_read':
          result = await markAsRead();
          if (result.success) {
            toast({ title: 'Marcada como leída', description: result.message });
          }
          break;
          
        case 'mark_unread':
          result = await markAsUnread();
          if (result.success) {
            toast({ title: 'Marcada como no leída', description: result.message });
          }
          break;
          
        case 'archive':
          result = await archive();
          if (result.success) {
            toast({ title: 'Archivada', description: result.message });
            handleBack(); // Regresar después de archivar
          }
          break;
          
        case 'retry':
          result = await retryDelivery();
          if (result.success) {
            toast({ title: 'Reintento iniciado', description: result.message });
          }
          break;
          
        default:
          console.warn('Acción no reconocida:', actionId);
          return;
      }
      
      if (!result.success) {
        toast({ 
          title: 'Error', 
          description: result.message, 
          variant: 'destructive' 
        });
      }
    } catch (err: any) {
      console.error('Error en acción:', err);
      toast({ 
        title: 'Error', 
        description: err.message || 'Error al ejecutar la acción', 
        variant: 'destructive' 
      });
    }
  };

  // Configurar acciones disponibles
  const getAvailableActions = (): NotificationDetailAction[] => {
    if (!notification) return [];
    
    const actions: NotificationDetailAction[] = [];
    
    // Marcar como leída/no leída
    if (notification.read_at) {
      actions.push({
        id: 'mark_unread',
        label: 'Marcar como no leída',
        icon: 'Mail',
        variant: 'outline',
        onClick: () => handleAction('mark_unread')
      });
    } else {
      actions.push({
        id: 'mark_read',
        label: 'Marcar como leída',
        icon: 'CheckCircle',
        variant: 'default',
        onClick: () => handleAction('mark_read')
      });
    }
    
    // Archivar
    actions.push({
      id: 'archive',
      label: 'Archivar',
      icon: 'Archive',
      variant: 'outline',
      onClick: () => handleAction('archive')
    });
    
    // Reintentar (solo si falló)
    if (notification.status === 'failed') {
      actions.push({
        id: 'retry',
        label: 'Reintentar envío',
        icon: 'RotateCcw',
        variant: 'secondary',
        onClick: () => handleAction('retry')
      });
    }
    
    return actions;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'read':
        return <CheckCircle className="h-4 w-4 text-purple-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'push':
        return <MessageSquare className="h-4 w-4" />;
      case 'sms':
        return <Phone className="h-4 w-4" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Cargando detalles...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        {showBackButton && (
          <Button 
            onClick={handleBack} 
            variant="outline" 
            className="mt-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        )}
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Notificación no encontrada</AlertDescription>
        </Alert>
        {showBackButton && (
          <Button 
            onClick={handleBack} 
            variant="outline" 
            className="mt-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        )}
      </div>
    );
  }

  const actions = getAvailableActions();

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <Button 
              onClick={handleBack} 
              variant="ghost" 
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">Detalle de Notificación</h1>
            <p className="text-sm text-muted-foreground">
              {translation?.title || notification.title || 'Sin título'}
            </p>
          </div>
        </div>
        
        {/* Acciones */}
        <div className="flex items-center gap-2">
          {actions.map((action) => {
            const IconComponent = action.icon === 'CheckCircle' ? CheckCircle :
                               action.icon === 'Archive' ? Archive :
                               action.icon === 'RotateCcw' ? RotateCcw :
                               action.icon === 'Mail' ? Mail : AlertCircle;
            
            return (
              <Button
                key={action.id}
                onClick={action.onClick}
                variant={action.variant}
                size="sm"
                disabled={actionLoading === action.id}
              >
                {actionLoading === action.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <IconComponent className="h-4 w-4 mr-2" />
                )}
                {action.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contenido principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getChannelIcon(notification.channel)}
                Información de la Notificación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(notification.status)}
                  <Badge variant={notification.status === 'delivered' ? 'default' : 
                                notification.status === 'failed' ? 'destructive' : 
                                'secondary'}>
                    {notification.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {notification.time_ago}
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">Canal:</label>
                  <p className="text-sm text-muted-foreground capitalize">
                    {notification.channel}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Destinatario:</label>
                  <p className="text-sm text-muted-foreground">
                    {notification.recipient_email || notification.recipient_phone || 'Sistema'}
                  </p>
                </div>
                
                {notification.sent_at && (
                  <div>
                    <label className="text-sm font-medium">Enviado:</label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(notification.sent_at).toLocaleString()}
                    </p>
                  </div>
                )}
                
                {notification.read_at && (
                  <div>
                    <label className="text-sm font-medium">Leído:</label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(notification.read_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contenido del mensaje */}
          <Card>
            <CardHeader>
              <CardTitle>Mensaje</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[70vh] overflow-auto">
                <div className="space-y-4">
                  {(translation?.title || notification.title) && (
                    <div>
                      <label className="text-sm font-medium">Título:</label>
                      <p className="mt-1">{translation?.title || notification.title}</p>
                    </div>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium">Contenido:</label>
                    <div className="mt-1 p-4 bg-muted rounded-lg">
                      <p className="whitespace-pre-wrap">
                        {translation?.message || notification.message || notification.content || 'Sin contenido'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Mostrar detalles adicionales del payload */}
                  {notification.payload && (
                    <div>
                      <label className="text-sm font-medium">Detalles:</label>
                      <div className="mt-1 space-y-3">
                        {/* Información del cliente */}
                        {notification.payload.customer_name && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <User className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                Cliente
                              </span>
                            </div>
                            <div className="space-y-1 ml-6">
                              <p className="text-sm font-medium break-words">{notification.payload.customer_name}</p>
                              {notification.payload.customer_email && (
                                <p className="text-sm text-muted-foreground break-words">{notification.payload.customer_email}</p>
                              )}
                              {notification.payload.customer_phone && (
                                <p className="text-sm text-muted-foreground break-words">{notification.payload.customer_phone}</p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Información de la oportunidad */}
                        {(notification.payload.opportunity_name || notification.payload.opportunity_title) && (
                          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="h-4 w-4 text-green-600" />
                              <span className="text-sm font-medium text-green-900 dark:text-green-100">
                                Oportunidad
                              </span>
                            </div>
                            <div className="space-y-1 ml-6">
                              <p className="text-sm font-medium break-words">
                                {notification.payload.opportunity_name || notification.payload.opportunity_title}
                              </p>
                              {notification.payload.opportunity_status && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Estado:</span>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {notification.payload.opportunity_status === 'won' ? 'Ganada' :
                                     notification.payload.opportunity_status === 'lost' ? 'Perdida' :
                                     notification.payload.opportunity_status === 'active' ? 'Activa' :
                                     notification.payload.opportunity_status === 'pending' ? 'Pendiente' :
                                     notification.payload.opportunity_status}
                                  </Badge>
                                </div>
                              )}
                              {notification.payload.opportunity_amount && (
                                <p className="text-sm text-muted-foreground break-words">
                                  Valor: {notification.payload.opportunity_currency || '$'} {notification.payload.opportunity_amount.toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Información de la tarea */}
                        {notification.payload.task_title && (
                          <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-purple-600" />
                              <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                                Tarea
                              </span>
                            </div>
                            <div className="space-y-2 ml-6">
                              <p className="text-sm font-medium break-words">{notification.payload.task_title}</p>
                              {notification.payload.task_description && (
                                <p className="text-sm text-muted-foreground break-words">{notification.payload.task_description}</p>
                              )}
                              
                              {/* Usuario asignado */}
                              {notification.payload.assigned_to_name && (
                                <div className="flex items-center gap-2 text-sm">
                                  <User className="h-3 w-3" />
                                  <span className="text-xs text-muted-foreground">Asignado a:</span>
                                  <span className="font-medium">{notification.payload.assigned_to_name}</span>
                                </div>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-3">
                                {notification.payload.task_status && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Estado:</span>
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {notification.payload.task_status === 'open' ? 'Abierta' :
                                       notification.payload.task_status === 'completed' ? 'Completada' :
                                       notification.payload.task_status === 'cancelled' ? 'Cancelada' :
                                       notification.payload.task_status}
                                    </Badge>
                                  </div>
                                )}
                                {notification.payload.task_priority && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Prioridad:</span>
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {notification.payload.task_priority === 'high' ? 'Alta' :
                                       notification.payload.task_priority === 'med' ? 'Media' :
                                       notification.payload.task_priority === 'low' ? 'Baja' :
                                       notification.payload.task_priority}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Información de etapa */}
                        {notification.payload.stage_name && (
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            <span className="text-sm">Etapa: {notification.payload.stage_name}</span>
                          </div>
                        )}
                        
                        {/* Fecha límite */}
                        {notification.payload.due_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="text-sm">Fecha límite: {new Date(notification.payload.due_date).toLocaleDateString('es-ES')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {notification.error_msg && (
                    <div>
                      <label className="text-sm font-medium text-red-600">Error:</label>
                      <p className="mt-1 text-sm text-red-600">
                        {notification.error_msg}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Archivos adjuntos */}
          {notification.attachments && notification.attachments.length > 0 && (
            <NotificationAttachments attachments={notification.attachments} />
          )}

          {/* Enlaces contextuales */}
          {notification.links && notification.links.length > 0 && (
            <NotificationLinks links={notification.links} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Historial de entregas */}
          <DeliveryHistory 
            deliveryLogs={notification.delivery_logs || []}
            onRefresh={refreshDeliveryLogs}
          />
        </div>
      </div>
    </div>
  );
}
