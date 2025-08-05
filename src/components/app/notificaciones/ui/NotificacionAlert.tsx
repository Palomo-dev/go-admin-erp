/**
 * Componente para renderizar alertas del sistema con acciones específicas
 * Diseño optimizado para diferentes niveles de severidad
 */

'use client';

import React, { useState } from 'react';
import { cn } from '@/utils/Utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
// import { Progress } from '@/components/ui/progress'; // No disponible
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  XCircle,
  CheckCircle2,
  Clock,
  User,
  ExternalLink,
  Package,
  Users,
  DollarSign,
  Building2,
  Trash2,
  Shield,
  Zap,
  Loader2
} from 'lucide-react';
import type { 
  SystemAlert, 
  AlertSeverity,
  SourceModule,
  ActionResult 
} from '@/types/notification';

/**
 * Props para NotificacionAlert
 */
interface NotificacionAlertProps {
  /** Alerta a renderizar */
  alert: SystemAlert;
  /** Función para resolver alerta */
  onResolve?: (id: string) => Promise<void>;
  /** Función para eliminar */
  onDelete?: (id: string) => Promise<ActionResult>;
  /** Si está en procesamiento */
  processing?: boolean;
  /** Término de búsqueda para resaltar */
  searchTerm?: string;
  /** Mostrar acciones */
  showActions?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Configuración de severidad
 */
const SEVERITY_CONFIG: Record<AlertSeverity, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}> = {
  info: {
    icon: <Info className="w-4 h-4" />,
    label: 'Información',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-300',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Advertencia',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-700 dark:text-yellow-300',
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    label: 'Error',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-700 dark:text-red-300',
  },
  critical: {
    icon: <AlertCircle className="w-4 h-4 animate-pulse" />,
    label: 'Crítico',
    color: 'text-red-700',
    bgColor: 'bg-red-100 dark:bg-red-950/30',
    borderColor: 'border-red-300 dark:border-red-700',
    textColor: 'text-red-800 dark:text-red-200',
  },
};

/**
 * Configuración de módulos
 */
const MODULE_CONFIG: Record<SourceModule, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
}> = {
  sistema: {
    icon: <Shield className="w-3 h-3" />,
    label: 'Sistema',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-900/20',
  },
  ventas: {
    icon: <DollarSign className="w-3 h-3" />,
    label: 'Ventas',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
  },
  inventario: {
    icon: <Package className="w-3 h-3" />,
    label: 'Inventario',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
  },
  pms: {
    icon: <Building2 className="w-3 h-3" />,
    label: 'PMS',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/20',
  },
  rrhh: {
    icon: <Users className="w-3 h-3" />,
    label: 'RR.HH.',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/20',
  },
  crm: {
    icon: <Users className="w-3 h-3" />,
    label: 'CRM',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/20',
  },
  finanzas: {
    icon: <DollarSign className="w-3 h-3" />,
    label: 'Finanzas',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/20',
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
 * Componente NotificacionAlert
 */
export const NotificacionAlert: React.FC<NotificacionAlertProps> = ({
  alert,
  onResolve,
  onDelete,
  processing = false,
  searchTerm,
  showActions = true,
  className,
}) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Configuraciones
  const severityConfig = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  const moduleConfig = MODULE_CONFIG[alert.source_module] || MODULE_CONFIG.sistema;

  // Estados
  const isResolved = alert.status === 'resolved';
  const isPending = alert.status === 'pending' || alert.status === 'active';

  /**
   * Manejar resolución de alerta
   */
  const handleResolve = async () => {
    if (!onResolve || isResolved || processing) return;

    setActionLoading('resolve');
    try {
      await onResolve(alert.id);
    } catch (error) {
      console.error('Error al resolver alerta:', error);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Manejar eliminación
   */
  const handleDelete = async () => {
    if (!onDelete || processing) return;

    if (!window.confirm('¿Estás seguro de que deseas eliminar esta alerta?')) {
      return;
    }

    setActionLoading('delete');
    try {
      const result = await onDelete(alert.id);
      if (!result.success) {
        console.error('Error al eliminar alerta:', result.message);
      }
    } catch (error) {
      console.error('Error al eliminar alerta:', error);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Formatear tiempo
   */
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
    
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Obtener metadatos
   */
  const getMetadata = () => {
    try {
      return typeof alert.metadata === 'string' 
        ? JSON.parse(alert.metadata) 
        : alert.metadata || {};
    } catch {
      return {};
    }
  };

  const metadata = getMetadata();

  /**
   * Renderizar indicador de tiempo para alertas críticas
   */
  const renderTimeIndicator = () => {
    if (alert.severity !== 'critical' || isResolved) return null;

    const createdAt = new Date(alert.created_at).getTime();
    const now = new Date().getTime();
    const elapsed = now - createdAt;
    const hours = Math.floor(elapsed / (60 * 60 * 1000));

    return (
      <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded">
        <div className="flex items-center space-x-2 text-xs text-red-700 dark:text-red-300">
          <Clock className="w-3 h-3" />
          <span>Alerta crítica activa por {hours}h</span>
          {hours > 24 && <span className="font-bold animate-pulse">⚠️ ATENCIÓN</span>}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div 
        className={cn(
          'p-4 transition-all duration-200 hover:bg-muted/30 w-full overflow-visible',
          severityConfig.borderColor,
          severityConfig.bgColor,
          isResolved && 'opacity-75',
          processing && 'opacity-50 pointer-events-none',
          alert.severity === 'critical' && !isResolved && 'animate-pulse-slow',
          className
        )}
      >
        <div className="flex items-start space-x-3">
          {/* Icono de severidad */}
          <div className={cn(
            'flex-shrink-0 p-2 rounded-full mt-1',
            severityConfig.bgColor,
            severityConfig.borderColor,
            'border'
          )}>
            <div className={severityConfig.color}>
              {isResolved ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                severityConfig.icon
              )}
            </div>
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className={cn(
                    'font-semibold text-sm',
                    isResolved ? 'text-muted-foreground line-through' : severityConfig.textColor
                  )}>
                    {highlightSearchTerm(alert.title, searchTerm)}
                  </h4>
                  
                  {isResolved && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      ✓ Resuelta
                    </Badge>
                  )}
                </div>
                
                <p className={cn(
                  'text-sm leading-relaxed',
                  isResolved ? 'text-muted-foreground/70' : 'text-muted-foreground'
                )}>
                  {highlightSearchTerm(alert.message, searchTerm)}
                </p>
              </div>

              {/* Acciones */}
              {showActions && (
                <div className="flex items-center space-x-1 ml-3">
                  {isPending && onResolve && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResolve}
                          disabled={actionLoading !== null}
                          className="text-green-600 border-green-600 hover:bg-green-50"
                        >
                          {actionLoading === 'resolve' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Resolver alerta</TooltipContent>
                    </Tooltip>
                  )}

                  {onDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDelete}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'delete' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Eliminar alerta</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>

            {/* Metadatos y badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{formatTime(alert.created_at)}</span>
                {isResolved && alert.resolved_at && (
                  <span>• Resuelta {formatTime(alert.resolved_at)}</span>
                )}
              </div>

              <Separator orientation="vertical" className="h-3" />

              <Badge 
                variant="secondary" 
                className={cn(
                  'text-xs',
                  severityConfig.color,
                  severityConfig.bgColor
                )}
              >
                {severityConfig.icon}
                <span className="ml-1">{severityConfig.label}</span>
              </Badge>

              <Badge 
                variant="outline" 
                className={cn(
                  'text-xs',
                  moduleConfig.color
                )}
              >
                {moduleConfig.icon}
                <span className="ml-1">{moduleConfig.label}</span>
              </Badge>

              {alert.source_id && (
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  ID: {alert.source_id}
                </span>
              )}
            </div>

            {/* Indicador de tiempo para alertas críticas */}
            {renderTimeIndicator()}

            {/* Información del usuario que resolvió */}
            {isResolved && alert.resolved_by && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                <div className="flex items-center space-x-1">
                  <User className="w-3 h-3" />
                  <span>Resuelta por: {alert.resolved_by}</span>
                </div>
              </div>
            )}

            {/* Canales de envío */}
            {alert.sent_channels && alert.sent_channels.length > 0 && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span>Notificado via:</span>
                {alert.sent_channels.map((channel) => (
                  <Badge key={channel} variant="outline" className="text-xs">
                    {channel}
                  </Badge>
                ))}
              </div>
            )}

            {/* Metadatos adicionales */}
            {metadata && Object.keys(metadata).length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver metadatos técnicos
                </summary>
                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
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
