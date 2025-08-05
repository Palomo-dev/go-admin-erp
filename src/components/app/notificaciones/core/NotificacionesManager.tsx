/**
 * Componente principal para gestionar notificaciones y alertas del sistema
 * Incluye sistema de tabs, coordina todos los sub-componentes y maneja el estado global
 */

'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Bell, 
  AlertTriangle, 
  RefreshCw, 
  Settings, 
  Filter,
  MoreHorizontal,
  CheckCheck,
  Trash2,
  AlertCircle,
  Info,
  Package
} from 'lucide-react';

import { useNotifications } from '@/lib/hooks/useNotifications';
import { useSharedNotifications } from '@/lib/hooks/useSharedNotifications';
import { NotificacionesDataLoader } from './NotificacionesDataLoader';
import { SimpleBreadcrumb } from '../ui/SimpleBreadcrumb';
import { ArchivedNotificationsView } from '../ui/ArchivedNotificationsView';
import { supabase } from '@/lib/supabase/config';
import { restoreNotification, permanentDeleteNotification } from '@/lib/services/notificationService';
import { cn } from '@/utils/Utils';

import type { 
  NotificationFilter, 
  SystemAlertFilter,
  ActionResult 
} from '@/types/notification';

// ========================
// TIPOS Y CONFIGURACIÓN
// ========================

/**
 * Props del componente
 */
interface NotificacionesManagerProps {
  defaultTab?: 'notifications' | 'alerts' | 'archived';
  showStats?: boolean;
  showActions?: boolean;
  showRealtime?: boolean;
  showBreadcrumb?: boolean;
  context?: {
    type: string;
    id: string;
    name?: string;
  };
  className?: string;
}

/**
 * Configuración de tabs
 */
const TABS_CONFIG = {
  notifications: {
    id: 'notifications',
    label: 'Notificaciones',
    icon: Bell,
    description: 'Mensajes y notificaciones del sistema',
  },
  alerts: {
    id: 'alerts',
    label: 'Alertas del Sistema',
    icon: AlertTriangle,
    description: 'Alertas críticas y del sistema',
  },
  archived: {
    id: 'archived',
    label: 'Archivadas',
    icon: Package,
    description: 'Notificaciones y alertas archivadas',
  },
};

// ========================
// COMPONENTE PRINCIPAL
// ========================

/**
 * Componente principal de gestión de notificaciones
 */
export function NotificacionesManager({
  defaultTab = 'notifications',
  showStats = true,
  showActions = true,
  showRealtime = true,
  showBreadcrumb = false,
  context,
  className,
}: NotificacionesManagerProps) {
  // Hook principal de notificaciones (página)
  const {
    notifications,
    systemAlerts,
    loading,
    error,
    stats,
    filters,
    pagination,
    refreshAll,
    // Acciones individuales
    markNotificationAsRead,
    deleteNotification,
    resolveAlert,
    deleteAlert,
    // Acciones masivas
    markAllNotificationsAsRead,
    deleteAllNotifications,
    resolveAllAlerts,
    // Gestión de filtros y paginación
    updateNotificationFilters,
    updateAlertFilters,
    clearFilters,
    loadMoreNotifications,
    loadMoreAlerts,
    goToNotificationPage,
    goToAlertPage,
  } = useNotifications();

  // Hook compartido para sincronización con header (página)
  const sharedNotifications = useSharedNotifications(false); // false = para página

  // Estado local del componente
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [showFilters, setShowFilters] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ========================
  // HANDLERS Y CALLBACKS
  // ========================

  /**
   * Maneja el cambio de tab
   */
  const handleTabChange = useCallback((tab: string) => {
    console.log('📱 Cambiando a tab:', tab);
    setActiveTab(tab);
  }, []);

  /**
   * Maneja el refresh de datos
   */
  const handleRefresh = useCallback(async () => {
    console.log('🔄 Refrescando datos...');
    setActionLoading('refresh');
    try {
      await refreshAll();
      console.log('✅ Datos refrescados correctamente');
    } catch (error) {
      console.error('❌ Error al refrescar:', error);
    } finally {
      setActionLoading(null);
    }
  }, [refreshAll]);

  /**
   * Maneja las acciones masivas
   */
  const handleMassiveAction = useCallback(async (
    action: 'mark_all_read' | 'delete_all_notifications' | 'resolve_all_alerts'
  ) => {
    console.log('⚡ Ejecutando acción masiva:', action);
    setActionLoading(action);
    
    try {
      let result: ActionResult;
      
      switch (action) {
        case 'mark_all_read':
          result = await markAllNotificationsAsRead();
          break;
        case 'delete_all_notifications':
          result = await deleteAllNotifications();
          break;
        case 'resolve_all_alerts':
          result = await resolveAllAlerts();
          break;
        default:
          throw new Error('Acción no reconocida');
      }
      
      if (result.success) {
        console.log('✅ Acción ejecutada:', result.message);
        // Aquí podrías mostrar una notificación toast
      } else {
        console.error('❌ Error en acción:', result.message);
      }
    } catch (error) {
      console.error('❌ Error en acción masiva:', error);
    } finally {
      setActionLoading(null);
    }
  }, [markAllNotificationsAsRead, deleteAllNotifications, resolveAllAlerts]);

  /**
   * Maneja la actualización de filtros
   */
  const handleFiltersUpdate = useCallback((
    type: 'notifications' | 'alerts',
    newFilters: Partial<NotificationFilter | SystemAlertFilter>
  ) => {
    console.log('🔍 Actualizando filtros:', type, newFilters);
    
    if (type === 'notifications') {
      updateNotificationFilters(newFilters as Partial<NotificationFilter>);
    } else {
      updateAlertFilters(newFilters as Partial<SystemAlertFilter>);
    }
  }, [updateNotificationFilters, updateAlertFilters]);

  /**
   * Maneja la limpieza de filtros
   */
  const handleClearFilters = useCallback(() => {
    console.log('🧹 Limpiando filtros');
    clearFilters();
    setShowFilters(false);
  }, [clearFilters]);

  // ========================
  // HELPERS Y UTILIDADES
  // ========================

  /**
   * Obtiene el conteo de items no leídos/pendientes
   */
  const getUnreadCount = useCallback((type: 'notifications' | 'alerts'): number => {
    if (type === 'notifications') {
      return stats.notifications?.unread || 0;
    } else {
      return stats.alerts?.pending || 0;
    }
  }, [stats]);

  /**
   * Obtiene el total de items
   */
  const getTotalCount = useCallback((type: 'notifications' | 'alerts'): number => {
    if (type === 'notifications') {
      return notifications.length;
    } else {
      return systemAlerts.length;
    }
  }, [notifications.length, systemAlerts.length]);

  /**
   * Verifica si hay acciones disponibles
   */
  const hasAvailableActions = useCallback((type: 'notifications' | 'alerts'): boolean => {
    if (type === 'notifications') {
      return notifications.length > 0;
    } else {
      return systemAlerts.length > 0;
    }
  }, [notifications.length, systemAlerts.length]);

  /**
   * Restaura una notificación archivada usando el servicio
   */
  const handleRestoreNotification = useCallback(async (id: string) => {
    console.log('🔄 Iniciando restauración de notificación:', id);
    try {
      const result = await restoreNotification(id);
      
      if (!result.success) {
        throw new Error(result.message);
      }

      console.log('✅ Notificación restaurada exitosamente');
      // Refrescar datos
      await refreshAll();
    } catch (error) {
      console.error('❌ Error restaurando notificación:', error);
      throw error;
    }
  }, [refreshAll]);

  /**
   * Elimina permanentemente una notificación usando el servicio
   */
  const handlePermanentDeleteNotification = useCallback(async (id: string) => {
    console.log('🗑️ Iniciando eliminación permanente:', id);
    try {
      const result = await permanentDeleteNotification(id);
      
      if (!result.success) {
        throw new Error(result.message);
      }

      console.log('✅ Notificación eliminada permanentemente');
      // Refrescar datos
      await refreshAll();
    } catch (error) {
      console.error('❌ Error eliminando notificación permanentemente:', error);
      throw error;
    }
  }, [refreshAll]);

  // ========================
  // COMPONENTES AUXILIARES
  // ========================

  /**
   * Renderiza el header de stats
   */
  const renderStatsHeader = () => {
    if (!showStats) return null;

    const currentStats = activeTab === 'notifications' ? stats.notifications : stats.alerts;
    const unreadCount = getUnreadCount(activeTab as 'notifications' | 'alerts');
    const totalCount = getTotalCount(activeTab as 'notifications' | 'alerts');

    return (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              Total: {totalCount}
            </Badge>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-sm">
                {activeTab === 'notifications' ? 'Sin leer' : 'Pendientes'}: {unreadCount}
              </Badge>
            )}
          </div>
          
          {currentStats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Hoy: {currentStats.today}</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Esta semana: {currentStats.this_week}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * Renderiza las acciones masivas
   */
  const renderMassiveActions = () => {
    if (!showActions) return null;

    const hasActions = hasAvailableActions(activeTab as 'notifications' | 'alerts');
    if (!hasActions) return null;

    return (
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || !!actionLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Actualizar
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {activeTab === 'notifications' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMassiveAction('mark_all_read')}
              disabled={loading || !!actionLoading}
              className="flex items-center gap-2"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar todas como leídas
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMassiveAction('delete_all_notifications')}
              disabled={loading || !!actionLoading}
              className="flex items-center gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar todas
            </Button>
          </>
        )}

        {activeTab === 'alerts' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleMassiveAction('resolve_all_alerts')}
            disabled={loading || !!actionLoading}
            className="flex items-center gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Resolver todas
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
      </div>
    );
  };

  /**
   * Renderiza el indicador de carga
   */
  const renderLoadingIndicator = () => {
    if (!actionLoading) return null;

    const loadingMessages = {
      refresh: 'Actualizando datos...',
      mark_all_read: 'Marcando como leídas...',
      delete_all_notifications: 'Eliminando notificaciones...',
      resolve_all_alerts: 'Resolviendo alertas...',
    };

    return (
      <Alert className="mb-4">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <AlertDescription>
          {loadingMessages[actionLoading as keyof typeof loadingMessages] || 'Procesando...'}
        </AlertDescription>
      </Alert>
    );
  };

  // ========================
  // RENDERIZADO PRINCIPAL
  // ========================

  if (error) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Error al cargar notificaciones: {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('w-full space-y-4 min-h-0', className)}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Bandeja de Notificaciones
              </CardTitle>
            </div>
            
            {/* Acciones del header */}
            <div className="flex items-center gap-2">
              {/* Breadcrumb en la esquina superior derecha */}
              {showBreadcrumb && (
                <SimpleBreadcrumb className="text-xs" />
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Gestiona tus notificaciones y alertas del sistema en tiempo real</span>
          </div>
        </CardHeader>
        
        <CardContent>
          {renderLoadingIndicator()}
          
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              {Object.values(TABS_CONFIG).map((tab) => {
                const Icon = tab.icon;
                const unreadCount = getUnreadCount(tab.id as 'notifications' | 'alerts');
                
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {unreadCount > 0 && tab.id !== 'archived' && (
                      <Badge variant="destructive" className="ml-1 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="mt-6">
              {renderStatsHeader()}
              {renderMassiveActions()}
              
              <TabsContent value="notifications" className="mt-4">
                <NotificacionesDataLoader
                  type="notifications"
                  data={notifications}
                  loading={loading}
                  filters={filters.notifications}
                  showFilters={showFilters}
                  onFiltersChange={(newFilters) => handleFiltersUpdate('notifications', newFilters)}
                  onClearFilters={handleClearFilters}
                  onMarkAsRead={markNotificationAsRead}
                  onDelete={deleteNotification}
                  pagination={pagination}
                  loadMoreNotifications={loadMoreNotifications}
                  loadMoreAlerts={loadMoreAlerts}
                  goToNotificationPage={goToNotificationPage}
                  goToAlertPage={goToAlertPage}
                />
              </TabsContent>
              
              <TabsContent value="alerts" className="mt-4 overflow-visible">
                <NotificacionesDataLoader
                  type="alerts"
                  data={systemAlerts}
                  loading={loading}
                  filters={filters.alerts}
                  showFilters={showFilters}
                  onFiltersChange={(newFilters) => handleFiltersUpdate('alerts', newFilters)}
                  onClearFilters={handleClearFilters}
                  onDelete={deleteAlert}
                  onResolve={resolveAlert}
                  pagination={pagination}
                  loadMoreNotifications={loadMoreNotifications}
                  loadMoreAlerts={loadMoreAlerts}
                  goToNotificationPage={goToNotificationPage}
                  goToAlertPage={goToAlertPage}
                />
              </TabsContent>
              
              <TabsContent value="archived" className="mt-4">
                <ArchivedNotificationsView
                  loading={loading}
                  onRestoreNotification={handleRestoreNotification}
                  onPermanentDelete={handlePermanentDeleteNotification}
                />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
