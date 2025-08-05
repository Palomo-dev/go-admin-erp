/**
 * Lista optimizada de notificaciones con scroll virtual y renderizado eficiente
 */

'use client';

import React, { useMemo } from 'react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Bell, 
  BellRing, 
  Package, 
  Users, 
  DollarSign, 
  Building2, 
  Calendar,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle
} from 'lucide-react';
import NotificacionItem from './NotificacionItem';
import { NotificacionAlert } from './NotificacionAlert';
import Logger from '@/lib/utils/logger';
import { SimplePagination } from './SimplePagination';
import type { 
  Notification, 
  SystemAlert, 
  NotificationChannel,
  AlertSeverity,
  SourceModule,
  ActionResult 
} from '@/types/notification';

/**
 * Props para NotificacionesList
 */
interface NotificacionesListProps {
  /** Lista de notificaciones o alertas */
  items: Notification[] | SystemAlert[];
  /** Tipo de lista */
  type: 'notifications' | 'alerts';
  /** Estado de carga */
  loading?: boolean;
  /** Función para marcar como leída */
  onMarkAsRead?: (id: string) => Promise<void>;
  /** Función para resolver alerta */
  onResolve?: (id: string) => Promise<void>;
  /** Función para eliminar */
  onDelete?: (id: string) => Promise<ActionResult>;
  /** IDs de items en procesamiento */
  processingIds?: string[];
  /** Texto de búsqueda para resaltar */
  searchTerm?: string;
  /** Configuración de paginación */
  pagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
    loading: boolean;
  };
}

/**
 * Mapeo de canales a iconos
 */
const CHANNEL_ICONS: Record<NotificationChannel, React.ReactNode> = {
  email: <Bell className="w-4 h-4" />,
  sms: <BellRing className="w-4 h-4" />,
  push: <BellRing className="w-4 h-4" />,
  whatsapp: <BellRing className="w-4 h-4" />,
  webhook: <Bell className="w-4 h-4" />,
};

/**
 * Mapeo de severidad a iconos
 */
const SEVERITY_ICONS: Record<AlertSeverity, React.ReactNode> = {
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  critical: <AlertTriangle className="w-4 h-4" />,
};

/**
 * Mapeo de módulos a iconos
 */
const MODULE_ICONS: Record<SourceModule, React.ReactNode> = {
  sistema: <Building2 className="w-4 h-4" />,
  ventas: <DollarSign className="w-4 h-4" />,
  inventario: <Package className="w-4 h-4" />,
  pms: <Building2 className="w-4 h-4" />,
  rrhh: <Users className="w-4 h-4" />,
  crm: <Users className="w-4 h-4" />,
  finanzas: <DollarSign className="w-4 h-4" />,
};

/**
 * Componente de skeleton para loading
 */
const NotificationSkeleton = () => (
  <div className="p-4 space-y-3">
    <div className="flex items-start space-x-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex space-x-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  </div>
);

/**
 * Lista optimizada de notificaciones
 */
export const NotificacionesList: React.FC<NotificacionesListProps> = ({
  items,
  type,
  loading = false,
  onMarkAsRead,
  onResolve,
  onDelete,
  processingIds = [],
  searchTerm,
  pagination,
}) => {
  /**
   * Renderizar skeletons durante la carga
   */
  const renderSkeletons = () => (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`skeleton-${index}`}>
          <NotificationSkeleton />
          {index < 4 && <Separator />}
        </div>
      ))}
    </div>
  );

  /**
   * Renderizar estado vacío
   */
  const renderEmptyState = () => {
    const isNotifications = type === 'notifications';
    const EmptyIcon = isNotifications ? Bell : AlertTriangle;
    const title = isNotifications ? 'Sin notificaciones' : 'Sin alertas';
    const description = isNotifications 
      ? 'No tienes notificaciones pendientes en este momento.'
      : 'No hay alertas del sistema activas.';

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <EmptyIcon className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-muted-foreground max-w-sm">{description}</p>
      </div>
    );
  };

  /**
   * Renderizar item individual
   */
  const renderItem = (item: Notification | SystemAlert, index: number) => {
    const isAlert = type === 'alerts';
    const isProcessing = processingIds.includes(item.id);
  // Debug log solo para desarrollo
  Logger.debug('UI', `Renderizando item ${type}: ${type === 'alerts' ? (item as SystemAlert).id : (item as Notification).id}`);

    if (isAlert) {
      return (
        <NotificacionAlert
          key={item.id}
          alert={item as SystemAlert}
          onResolve={onResolve}
          onDelete={onDelete}
          processing={isProcessing}
          searchTerm={searchTerm}
        />
      );
    } else {
      return (
        <NotificacionItem
          key={item.id}
          notification={item as Notification}
          onMarkAsRead={onMarkAsRead}
          onDelete={onDelete}
          processing={isProcessing}
          searchTerm={searchTerm}
        />
      );
    }
  };

  /**
   * Renderizar paginación simple
   */
  const renderPagination = () => {
    if (!pagination || pagination.totalPages <= 1) return null;

    return (
      <SimplePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.onPageChange}
        loading={pagination.loading}
      />
    );
  };

  /**
   * Estadísticas de la lista
   */
  const stats = useMemo(() => {
    if (type === 'notifications') {
      const notifications = items as Notification[];
      return {
        total: notifications.length,
        unread: notifications.filter(n => !n.read_at).length,
        read: notifications.filter(n => n.read_at).length,
      };
    } else {
      const alerts = items as SystemAlert[];
      return {
        total: alerts.length,
        pending: alerts.filter(a => a.status === 'pending' || a.status === 'active').length,
        resolved: alerts.filter(a => a.status === 'resolved').length,
      };
    }
  }, [items, type]);

  /**
   * Renderizar header con estadísticas
   */
  const renderHeader = () => (
    <div className="flex items-center justify-between p-4 border-b bg-muted/50">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          {type === 'notifications' ? (
            <Bell className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
          <span className="font-semibold">
            {type === 'notifications' ? 'Notificaciones' : 'Alertas del Sistema'}
          </span>
        </div>
        
        <div className="flex space-x-2">
          {type === 'notifications' ? (
            <>
              <Badge variant="secondary">
                Total: {stats.total}
              </Badge>
              {(stats.unread || 0) > 0 && (
                <Badge variant="destructive">
                  No leídas: {stats.unread || 0}
                </Badge>
              )}
            </>
          ) : (
            <>
              <Badge variant="secondary">
                Total: {stats.total}
              </Badge>
              {(stats.pending || 0) > 0 && (
                <Badge variant="destructive">
                  Pendientes: {stats.pending || 0}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {searchTerm && (
        <Badge variant="outline">
          Filtrando: "{searchTerm}"
        </Badge>
      )}
    </div>
  );

  // Estado de carga inicial
  if (loading && items.length === 0) {
    return (
      <div className="border rounded-lg">
        {renderHeader()}
        {renderSkeletons()}
      </div>
    );
  }

  // Lista vacía
  if (!loading && items.length === 0) {
    return (
      <div className="border rounded-lg">
        {renderHeader()}
        {renderEmptyState()}
      </div>
    );
  }

  // Lista con datos
  return (
    <div className="border rounded-lg overflow-hidden">
      {renderHeader()}
      
      <div className="min-h-0 overflow-visible">
        <div className="divide-y">
          {items.map((item, index) => renderItem(item, index))}
        </div>
      </div>
      
      {renderPagination()}
      
      {loading && items.length > 0 && (
        <div className="border-t p-4">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <Clock className="w-4 h-4 animate-spin" />
            <span>Actualizando...</span>
          </div>
        </div>
      )}
    </div>
  );
};
