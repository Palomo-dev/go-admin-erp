/**
 * Componente para mostrar notificaciones archivadas
 * Incluye opciones para restaurar o eliminar permanentemente
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Package,
  RotateCcw,
  Trash2,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw
} from 'lucide-react';

import { supabase } from '@/lib/supabase/config';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { translateNotification } from '@/utils/notificationTranslations';
import { cn } from '@/utils/Utils';

// ========================
// TIPOS
// ========================

interface ArchivedNotificationsViewProps {
  loading: boolean;
  onRestoreNotification: (id: string) => Promise<void>;
  onPermanentDelete: (id: string) => Promise<void>;
}

interface ArchivedNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  status: string;
  recipient_user_id: string;
  archived_at: string;
  created_at: string;
  category?: 'info' | 'success' | 'warning' | 'error';
  payload?: any;
  formattedDate?: string;
}

// ========================
// COMPONENTE PRINCIPAL
// ========================

export function ArchivedNotificationsView({
  loading,
  onRestoreNotification,
  onPermanentDelete,
}: ArchivedNotificationsViewProps) {
  const [archivedNotifications, setArchivedNotifications] = useState<ArchivedNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /**
   * Carga las notificaciones archivadas
   */
  const loadArchivedNotifications = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select(`
          id,
          channel,
          status,
          recipient_user_id,
          recipient_email,
          created_at,
          updated_at,
          payload
        `)
        .eq('status', 'deleted')
        .order('updated_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      const formattedData = (data || []).map((notification: any) => {
        const payload = notification.payload || {};
        const translated = translateNotification(payload);
        
        return {
          ...notification,
          title: translated.title,
          message: translated.message,
          type: payload.type || 'general',
          category: translated.category,
          formattedDate: formatDistanceToNow(new Date(notification.updated_at), {
            addSuffix: true,
            locale: es
          })
        };
      });

      setArchivedNotifications(formattedData);
    } catch (error: any) {
      console.error('❌ Error cargando notificaciones archivadas:', error);
      
      let errorMessage = 'Error desconocido';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (error?.hint) {
        errorMessage = error.hint;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.code) {
        errorMessage = `Error de base de datos: ${error.code}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Restaura una notificación archivada
   */
  const handleRestore = async (id: string) => {
    try {
      setActionLoading(id);
      await onRestoreNotification(id);
      
      // Recargar la lista
      await loadArchivedNotifications();
    } catch (error) {
      console.error('❌ Error restaurando notificación:', error);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Elimina permanentemente una notificación
   */
  const handlePermanentDelete = async (id: string) => {
    try {
      setActionLoading(id);
      await onPermanentDelete(id);
      
      // Recargar la lista
      await loadArchivedNotifications();
    } catch (error) {
      console.error('❌ Error eliminando notificación:', error);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Obtiene el ícono según la categoría de la notificación
   */
  const getNotificationIcon = (category: string = 'info') => {
    switch (category) {
      case 'success':
        return CheckCircle;
      case 'warning':
        return AlertCircle;
      case 'error':
        return AlertCircle;
      default:
        return Clock;
    }
  };

  /**
   * Obtiene el color del borde según la categoría
   */
  const getCategoryBorderColor = (category: string = 'info') => {
    switch (category) {
      case 'success':
        return 'border-l-green-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'error':
        return 'border-l-red-500';
      default:
        return 'border-l-blue-500';
    }
  };

  /**
   * Obtiene el color del badge según el canal
   */
  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'email':
        return 'bg-blue-100 text-blue-800';
      case 'push':
        return 'bg-green-100 text-green-800';
      case 'sms':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Cargar notificaciones al montar el componente
  useEffect(() => {
    loadArchivedNotifications();
  }, []);

  // ========================
  // RENDERIZADO
  // ========================

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Cargando notificaciones archivadas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Error al cargar notificaciones archivadas: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (archivedNotifications.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          No hay notificaciones archivadas
        </h3>
        <p className="text-sm text-muted-foreground">
          Las notificaciones que archives aparecerán aquí
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con información */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {archivedNotifications.length} notificaciones archivadas
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadArchivedNotifications}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Lista de notificaciones archivadas */}
      <div className="space-y-3">
        {archivedNotifications.map((notification) => {
          const NotificationIcon = getNotificationIcon(notification.category);
          const borderColor = getCategoryBorderColor(notification.category);
          const isActionLoading = actionLoading === notification.id;

          return (
            <Card key={notification.id} className="relative">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Ícono */}
                  <div className="flex-shrink-0 mt-1">
                    <NotificationIcon className="h-5 w-5 text-muted-foreground" />
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-muted-foreground line-clamp-1">
                          {notification.title || 'Sin título'}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {notification.message || 'Sin mensaje'}
                        </p>
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(notification.id)}
                          disabled={isActionLoading}
                          title="Restaurar notificación"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isActionLoading}
                              title="Eliminar permanentemente"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar permanentemente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. La notificación será eliminada
                                permanentemente del sistema.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handlePermanentDelete(notification.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Eliminar permanentemente
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Metadatos */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Archivada {notification.formattedDate}
                      </div>
                      
                      <Badge className={cn('text-xs', getChannelColor(notification.channel))}>
                        {notification.channel}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Indicador de carga */}
                {isActionLoading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
