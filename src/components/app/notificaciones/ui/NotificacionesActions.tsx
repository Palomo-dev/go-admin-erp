/**
 * Componente para acciones masivas en notificaciones y alertas del sistema
 * Incluye marcar todas como leídas, eliminar todas, resolver todas, etc.
 */

'use client';

import React, { useState } from 'react';
import { cn } from '@/utils/Utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  CheckCircle2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  X,
  Loader2,
  Shield,
  Download,
  Filter,
  Settings
} from 'lucide-react';
import type { 
  NotificationStats,
  SystemAlertStats 
} from '@/types/notification';

/**
 * Props para NotificacionesActions
 */
interface NotificacionesActionsProps {
  /** Tipo de acciones */
  type: 'notifications' | 'alerts';
  /** Estadísticas actuales */
  stats?: NotificationStats | SystemAlertStats;
  /** Estados de carga de acciones */
  loading?: {
    markAllAsRead?: boolean;
    deleteAll?: boolean;
    resolveAll?: boolean;
    refresh?: boolean;
  };
  /** Funciones de acciones masivas */
  actions?: {
    markAllAsRead?: () => Promise<void>;
    deleteAll?: () => Promise<void>;
    resolveAll?: () => Promise<void>;
    refresh?: () => Promise<void>;
    export?: () => Promise<void>;
  };
  /** Si hay filtros aplicados */
  hasActiveFilters?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Componente de acciones masivas
 */
export const NotificacionesActions: React.FC<NotificacionesActionsProps> = ({
  type,
  stats,
  loading = {},
  actions = {},
  hasActiveFilters = false,
  className,
}) => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Determinar si es para notificaciones o alertas
  const isNotifications = type === 'notifications';
  const isAlerts = type === 'alerts';

  /**
   * Obtener estadísticas específicas por tipo
   */
  const getTypeStats = () => {
    if (!stats) return null;

    if (isNotifications) {
      const notifStats = stats as NotificationStats;
      return {
        total: notifStats.total || 0,
        unread: notifStats.unread || 0,
        pending: 0,
        failed: notifStats.by_status?.failed || 0,
      };
    } else {
      const alertStats = stats as SystemAlertStats;
      return {
        total: alertStats.total || 0,
        unread: 0,
        pending: alertStats.pending || 0,
        critical: alertStats.critical_count || 0,
      };
    }
  };

  const typeStats = getTypeStats();

  /**
   * Ejecutar acción con manejo de estado
   */
  const executeAction = async (actionKey: string, actionFn?: () => Promise<void>) => {
    if (!actionFn || loading[actionKey as keyof typeof loading]) return;

    setPendingAction(actionKey);
    try {
      await actionFn();
    } catch (error) {
      console.error(`Error en acción ${actionKey}:`, error);
    } finally {
      setPendingAction(null);
    }
  };

  /**
   * Renderizar botón de acción con confirmación
   */
  const renderActionButton = ({
    actionKey,
    icon,
    label,
    description,
    confirmTitle,
    confirmDescription,
    variant = 'outline',
    disabled = false,
    requiresConfirmation = true,
    buttonClassName,
  }: {
    actionKey: string;
    icon: React.ReactNode;
    label: string;
    description: string;
    confirmTitle: string;
    confirmDescription: string;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    disabled?: boolean;
    requiresConfirmation?: boolean;
    buttonClassName?: string;
  }) => {
    const actionFn = actions[actionKey as keyof typeof actions];
    const isLoading = loading[actionKey as keyof typeof loading] || pendingAction === actionKey;
    const isDisabled = disabled || !actionFn || isLoading;

    const button = (
      <Button
        variant={variant}
        size="sm"
        disabled={isDisabled}
        onClick={requiresConfirmation ? undefined : () => executeAction(actionKey, actionFn)}
        className={cn('flex items-center space-x-2', buttonClassName)}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          icon
        )}
        <span>{label}</span>
      </Button>
    );

    if (!requiresConfirmation) {
      return (
        <TooltipProvider key={actionKey}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <AlertDialog key={actionKey}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center space-x-2">
              {icon}
              <span>{confirmTitle}</span>
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => executeAction(actionKey, actionFn)}
              className={variant === 'destructive' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  /**
   * Renderizar acciones para notificaciones
   */
  const renderNotificationActions = () => {
    if (!typeStats) return null;

    const actions = [];

    // Marcar todas como leídas
    if (typeStats.unread > 0) {
      actions.push(
        renderActionButton({
          actionKey: 'markAllAsRead',
          icon: <CheckCheck className="w-4 h-4" />,
          label: `Marcar ${typeStats.unread} como leídas`,
          description: 'Marcar todas las notificaciones no leídas como leídas',
          confirmTitle: 'Marcar todas como leídas',
          confirmDescription: `¿Estás seguro de que deseas marcar ${typeStats.unread} notificaciones como leídas? Esta acción no se puede deshacer.`,
        })
      );
    }

    // Eliminar todas
    if (typeStats.total > 0) {
      actions.push(
        renderActionButton({
          actionKey: 'deleteAll',
          icon: <Trash2 className="w-4 h-4" />,
          label: `Eliminar ${hasActiveFilters ? 'filtradas' : 'todas'}`,
          description: hasActiveFilters 
            ? 'Eliminar todas las notificaciones que coinciden con los filtros actuales'
            : 'Eliminar todas las notificaciones',
          confirmTitle: 'Eliminar notificaciones',
          confirmDescription: hasActiveFilters
            ? 'Se eliminarán todas las notificaciones que coinciden con los filtros actuales. Esta acción no se puede deshacer.'
            : `¿Estás seguro de que deseas eliminar todas las ${typeStats.total} notificaciones? Esta acción no se puede deshacer.`,
          variant: 'destructive',
        })
      );
    }

    return actions;
  };

  /**
   * Renderizar acciones para alertas
   */
  const renderAlertActions = () => {
    if (!typeStats) return null;

    const actions = [];

    // Resolver todas las alertas pendientes
    if (typeStats.pending > 0) {
      actions.push(
        renderActionButton({
          actionKey: 'resolveAll',
          icon: <CheckCircle2 className="w-4 h-4" />,
          label: `Resolver ${typeStats.pending} pendientes`,
          description: 'Resolver todas las alertas pendientes',
          confirmTitle: 'Resolver todas las alertas',
          confirmDescription: `¿Estás seguro de que deseas resolver ${typeStats.pending} alertas pendientes? Esto las marcará como resueltas.`,
          variant: 'default',
        })
      );
    }

    // Eliminar todas
    if (typeStats.total > 0) {
      actions.push(
        renderActionButton({
          actionKey: 'deleteAll',
          icon: <Trash2 className="w-4 h-4" />,
          label: `Eliminar ${hasActiveFilters ? 'filtradas' : 'todas'}`,
          description: hasActiveFilters 
            ? 'Eliminar todas las alertas que coinciden con los filtros actuales'
            : 'Eliminar todas las alertas',
          confirmTitle: 'Eliminar alertas',
          confirmDescription: hasActiveFilters
            ? 'Se eliminarán todas las alertas que coinciden con los filtros actuales. Esta acción no se puede deshacer.'
            : `¿Estás seguro de que deseas eliminar todas las ${typeStats.total} alertas? Esta acción no se puede deshacer.`,
          variant: 'destructive',
        })
      );
    }

    return actions;
  };

  /**
   * Renderizar acciones generales
   */
  const renderGeneralActions = () => {
    const actions = [];

    // Actualizar
    actions.push(
      renderActionButton({
        actionKey: 'refresh',
        icon: <RotateCcw className="w-4 h-4" />,
        label: 'Actualizar',
        description: 'Recargar datos desde el servidor',
        confirmTitle: '',
        confirmDescription: '',
        requiresConfirmation: false,
        variant: 'ghost',
      })
    );

    // Exportar
    if (typeStats && typeStats.total > 0) {
      actions.push(
        renderActionButton({
          actionKey: 'export',
          icon: <Download className="w-4 h-4" />,
          label: 'Exportar',
          description: hasActiveFilters 
            ? 'Exportar elementos filtrados a Excel'
            : `Exportar todos los elementos a Excel`,
          confirmTitle: '',
          confirmDescription: '',
          requiresConfirmation: false,
          variant: 'ghost',
        })
      );
    }

    return actions;
  };

  // Si no hay estadísticas, no renderizar nada
  if (!typeStats) {
    return null;
  }

  const specificActions = isNotifications ? renderNotificationActions() : renderAlertActions();
  const generalActions = renderGeneralActions();

  return (
    <div className={cn(
      'flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 p-4 border rounded-lg bg-muted/30',
      className
    )}>
      {/* Estadísticas */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          {isNotifications ? (
            <Bell className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Shield className="w-5 h-5 text-muted-foreground" />
          )}
          <span className="font-medium">
            {isNotifications ? 'Notificaciones' : 'Alertas del Sistema'}
          </span>
        </div>

        <div className="flex space-x-2">
          <Badge variant="secondary">
            Total: {typeStats.total}
          </Badge>
          
          {isNotifications && typeStats.unread > 0 && (
            <Badge variant="destructive">
              No leídas: {typeStats.unread}
            </Badge>
          )}
          
          {isAlerts && typeStats.pending > 0 && (
            <Badge variant="destructive">
              Pendientes: {typeStats.pending}
            </Badge>
          )}
          
          {isAlerts && typeStats.critical && typeStats.critical > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Críticas: {typeStats.critical}
            </Badge>
          )}

          {hasActiveFilters && (
            <Badge variant="outline">
              <Filter className="w-3 h-3 mr-1" />
              Filtrado
            </Badge>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        {/* Acciones específicas */}
        {specificActions}
        
        {specificActions && specificActions.length > 0 && generalActions.length > 0 && (
          <Separator orientation="vertical" className="h-8 mx-2" />
        )}
        
        {/* Acciones generales */}
        {generalActions}
      </div>
    </div>
  );
};
