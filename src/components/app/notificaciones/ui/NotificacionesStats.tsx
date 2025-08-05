/**
 * Componente de estadísticas para notificaciones y alertas del sistema
 * Muestra contadores, gráficos y métricas importantes
 */

'use client';

import React, { useMemo } from 'react';
import { cn } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
// import { Progress } from '@/components/ui/progress'; // No disponible
import { 
  Bell,
  BellRing,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Shield,
  Mail,
  MessageSquare,
  Smartphone,
  Package,
  Users,
  DollarSign,
  Building2,
  Info,
  AlertCircle
} from 'lucide-react';
import type { 
  NotificationStats,
  SystemAlertStats,
  NotificationChannel,
  AlertSeverity,
  SourceModule 
} from '@/types/notification';

/**
 * Props para NotificacionesStats
 */
interface NotificacionesStatsProps {
  /** Tipo de estadísticas */
  type: 'notifications' | 'alerts';
  /** Estadísticas de notificaciones */
  notificationStats?: NotificationStats;
  /** Estadísticas de alertas */
  alertStats?: SystemAlertStats;
  /** Si está en modo compacto */
  compact?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Configuración de iconos para canales
 */
const CHANNEL_ICONS: Record<NotificationChannel, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  sms: <MessageSquare className="w-4 h-4" />,
  push: <Smartphone className="w-4 h-4" />,
  whatsapp: <MessageSquare className="w-4 h-4" />,
  webhook: <Bell className="w-4 h-4" />,
};

/**
 * Configuración de iconos para severidad
 */
const SEVERITY_ICONS: Record<AlertSeverity, React.ReactNode> = {
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  critical: <AlertCircle className="w-4 h-4" />,
};

/**
 * Configuración de iconos para módulos
 */
const MODULE_ICONS: Record<SourceModule, React.ReactNode> = {
  sistema: <Shield className="w-4 h-4" />,
  ventas: <DollarSign className="w-4 h-4" />,
  inventario: <Package className="w-4 h-4" />,
  pms: <Building2 className="w-4 h-4" />,
  rrhh: <Users className="w-4 h-4" />,
  crm: <Users className="w-4 h-4" />,
  finanzas: <DollarSign className="w-4 h-4" />,
};

/**
 * Componente de estadísticas
 */
export const NotificacionesStats: React.FC<NotificacionesStatsProps> = ({
  type,
  notificationStats,
  alertStats,
  compact = false,
  className,
}) => {
  const isNotifications = type === 'notifications';

  /**
   * Calcular porcentajes para notificaciones
   */
  const notificationPercentages = useMemo(() => {
    if (!notificationStats || notificationStats.total === 0) return null;

    const total = notificationStats.total;
    return {
      read: Math.round((notificationStats.by_status.read / total) * 100),
      unread: Math.round((notificationStats.unread / total) * 100),
      failed: Math.round((notificationStats.by_status.failed / total) * 100),
      delivered: Math.round(((notificationStats.by_status.sent + notificationStats.by_status.delivered) / total) * 100),
    };
  }, [notificationStats]);

  /**
   * Calcular porcentajes para alertas
   */
  const alertPercentages = useMemo(() => {
    if (!alertStats || alertStats.total === 0) return null;

    const total = alertStats.total;
    return {
      resolved: Math.round((alertStats.resolved / total) * 100),
      pending: Math.round((alertStats.pending / total) * 100),
      critical: Math.round((alertStats.critical_count / total) * 100),
    };
  }, [alertStats]);

  /**
   * Renderizar tarjeta de métrica
   */
  const renderMetricCard = ({
    title,
    value,
    icon,
    trend,
    color = 'text-foreground',
    bgColor = 'bg-background',
    subtitle,
  }: {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    trend?: { value: number; positive?: boolean };
    color?: string;
    bgColor?: string;
    subtitle?: string;
  }) => (
    <Card className={cn('relative overflow-hidden', bgColor)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={color}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <div className="flex items-center space-x-1 mt-2">
            {trend.positive ? (
              <TrendingUp className="w-3 h-3 text-green-500" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-500" />
            )}
            <span className={cn(
              'text-xs font-medium',
              trend.positive ? 'text-green-500' : 'text-red-500'
            )}>
              {trend.value > 0 ? '+' : ''}{trend.value}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  /**
   * Renderizar estadísticas de notificaciones
   */
  const renderNotificationStats = () => {
    if (!notificationStats) return null;

    if (compact) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {renderMetricCard({
            title: 'Total',
            value: notificationStats.total,
            icon: <Bell className="w-4 h-4" />,
            subtitle: 'Notificaciones',
          })}
          {renderMetricCard({
            title: 'No leídas',
            value: notificationStats.unread,
            icon: <BellRing className="w-4 h-4" />,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          })}
          {renderMetricCard({
            title: 'Entregadas',
            value: notificationStats.by_status.delivered,
            icon: <CheckCircle2 className="w-4 h-4" />,
            color: 'text-green-600',
            bgColor: 'bg-green-50 dark:bg-green-950/20',
          })}
          {renderMetricCard({
            title: 'Fallidas',
            value: notificationStats.by_status?.failed || 0,
            icon: <XCircle className="w-4 h-4" />,
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-950/20',
          })}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Métricas principales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {renderMetricCard({
            title: 'Total',
            value: notificationStats.total,
            icon: <Bell className="w-4 h-4" />,
            subtitle: 'Notificaciones enviadas',
          })}
          {renderMetricCard({
            title: 'No leídas',
            value: notificationStats.unread,
            icon: <BellRing className="w-4 h-4" />,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50 dark:bg-blue-950/20',
            subtitle: `${notificationPercentages?.unread || 0}% del total`,
          })}
          {renderMetricCard({
            title: 'Entregadas',
            value: notificationStats.by_status.delivered,
            icon: <CheckCircle2 className="w-4 h-4" />,
            color: 'text-green-600',
            bgColor: 'bg-green-50 dark:bg-green-950/20',
            subtitle: `${notificationPercentages?.delivered || 0}% del total`,
          })}
          {renderMetricCard({
            title: 'Fallidas',
            value: notificationStats.by_status.failed,
            icon: <XCircle className="w-4 h-4" />,
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-950/20',
            subtitle: `${notificationPercentages?.failed || 0}% del total`,
          })}
        </div>

        {/* Distribución por canal */}
        {notificationStats.by_channel && Object.keys(notificationStats.by_channel).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Distribución por Canal</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(notificationStats.by_channel).map(([channel, count]) => {
                  const percentage = notificationStats.total > 0 
                    ? Math.round((count / notificationStats.total) * 100) 
                    : 0;
                  const channelIcon = CHANNEL_ICONS[channel as NotificationChannel];
                  
                  return (
                    <div key={channel} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {channelIcon}
                        <span className="capitalize">{channel}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <Badge variant="secondary" className="min-w-12 justify-center">
                          {count}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  /**
   * Renderizar estadísticas de alertas
   */
  const renderAlertStats = () => {
    if (!alertStats) return null;

    if (compact) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {renderMetricCard({
            title: 'Total',
            value: alertStats.total,
            icon: <Shield className="w-4 h-4" />,
            subtitle: 'Alertas',
          })}
          {renderMetricCard({
            title: 'Pendientes',
            value: alertStats.pending,
            icon: <Clock className="w-4 h-4" />,
            color: 'text-yellow-600',
            bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
          })}
          {renderMetricCard({
            title: 'Críticas',
            value: alertStats.critical_count,
            icon: <AlertCircle className="w-4 h-4" />,
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-950/20',
          })}
          {renderMetricCard({
            title: 'Resueltas',
            value: alertStats.resolved,
            icon: <CheckCircle2 className="w-4 h-4" />,
            color: 'text-green-600',
            bgColor: 'bg-green-50 dark:bg-green-950/20',
          })}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Métricas principales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {renderMetricCard({
            title: 'Total',
            value: alertStats.total,
            icon: <Shield className="w-4 h-4" />,
            subtitle: 'Alertas del sistema',
          })}
          {renderMetricCard({
            title: 'Pendientes',
            value: alertStats.pending,
            icon: <Clock className="w-4 h-4" />,
            color: 'text-yellow-600',
            bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
            subtitle: `${alertPercentages?.pending || 0}% del total`,
          })}
          {renderMetricCard({
            title: 'Críticas',
            value: alertStats.critical_count,
            icon: <AlertCircle className="w-4 h-4" />,
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-950/20',
            subtitle: `${alertPercentages?.critical || 0}% del total`,
          })}
          {renderMetricCard({
            title: 'Resueltas',
            value: alertStats.resolved,
            icon: <CheckCircle2 className="w-4 h-4" />,
            color: 'text-green-600',
            bgColor: 'bg-green-50 dark:bg-green-950/20',
            subtitle: `${alertPercentages?.resolved || 0}% del total`,
          })}
        </div>

        {/* Distribución por severidad */}
        {alertStats.by_severity && Object.keys(alertStats.by_severity).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Distribución por Severidad</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(alertStats.by_severity).map(([severity, count]) => {
                  const percentage = alertStats.total > 0 
                    ? Math.round((count / alertStats.total) * 100) 
                    : 0;
                  const severityIcon = SEVERITY_ICONS[severity as AlertSeverity];
                  
                  const colors = {
                    info: 'bg-blue-500',
                    warning: 'bg-yellow-500',
                    error: 'bg-red-500',
                    critical: 'bg-red-700',
                  };
                  
                  return (
                    <div key={severity} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {severityIcon}
                        <span className="capitalize">{severity}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-muted rounded-full h-2">
                          <div 
                            className={cn("h-2 rounded-full transition-all duration-300", colors[severity as AlertSeverity])}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <Badge variant="secondary" className="min-w-12 justify-center">
                          {count}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Distribución por módulo */}
        {alertStats.by_module && Object.keys(alertStats.by_module).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5" />
                <span>Distribución por Módulo</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(alertStats.by_module).map(([module, count]) => {
                  const percentage = alertStats.total > 0 
                    ? Math.round((count / alertStats.total) * 100) 
                    : 0;
                  const moduleIcon = MODULE_ICONS[module as SourceModule];
                  
                  return (
                    <div key={module} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {moduleIcon}
                        <span className="capitalize">{module}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <Badge variant="secondary" className="min-w-12 justify-center">
                          {count}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      {isNotifications ? renderNotificationStats() : renderAlertStats()}
    </div>
  );
};
