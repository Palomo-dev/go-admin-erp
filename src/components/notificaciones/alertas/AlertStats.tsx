'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Activity,
  Info,
  XCircle
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AlertStats, AlertSeverity, SourceModule } from '@/types/alert';

interface AlertStatsProps {
  stats: AlertStats;
  loading?: boolean;
  className?: string;
}

// Configuración de severidad
const severityConfig: Record<AlertSeverity, { 
  label: string; 
  icon: React.ElementType;
  color: string;
}> = {
  info: { label: 'Info', icon: Info, color: 'blue' },
  warning: { label: 'Advertencias', icon: AlertTriangle, color: 'yellow' },
  critical: { label: 'Críticas', icon: Shield, color: 'red' }
};

// Configuración de módulos
const moduleConfig: Record<SourceModule, { label: string; color: string }> = {
  sistema: { label: 'Sistema', color: 'gray' },
  ventas: { label: 'Ventas', color: 'green' },
  inventario: { label: 'Inventario', color: 'purple' },
  pms: { label: 'PMS', color: 'blue' },
  rrhh: { label: 'RR.HH.', color: 'orange' },
  crm: { label: 'CRM', color: 'indigo' },
  finanzas: { label: 'Finanzas', color: 'emerald' },
  transporte: { label: 'Transporte', color: 'cyan' }
};

export default function AlertStats({ 
  stats, 
  loading = false, 
  className 
}: AlertStatsProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
                <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Validar y normalizar los datos de stats
  const safeStats = {
    active_rules: stats.active_rules || 0,
    total_rules: stats.total_rules || 0,
    inactive_rules: stats.inactive_rules || 0,
    total_alerts: stats.total_alerts || 0,
    pending_alerts: stats.pending_alerts || 0,
    delivered_alerts: stats.delivered_alerts || 0,
    resolved_alerts: stats.resolved_alerts || 0,
    by_severity: {
      critical: stats.by_severity?.critical || 0,
      warning: stats.by_severity?.warning || 0,
      info: stats.by_severity?.info || 0
    },
    by_module: stats.by_module || {},
    recent_alerts: stats.recent_alerts || []
  };

  const statCards = [
    {
      title: 'Reglas Activas',
      value: safeStats.active_rules,
      total: safeStats.total_rules,
      icon: Shield,
      color: safeStats.active_rules > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500',
      bgColor: safeStats.active_rules > 0 ? 'bg-green-100 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-800',
      description: `${safeStats.inactive_rules} inactivas`
    },
    {
      title: 'Alertas Activas',
      value: safeStats.pending_alerts + safeStats.delivered_alerts,
      total: safeStats.total_alerts,
      icon: AlertTriangle,
      color: (safeStats.pending_alerts + safeStats.delivered_alerts) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500',
      bgColor: (safeStats.pending_alerts + safeStats.delivered_alerts) > 0 ? 'bg-orange-100 dark:bg-orange-900/20' : 'bg-gray-100 dark:bg-gray-800',
      description: `${safeStats.pending_alerts} pendientes`
    },
    {
      title: 'Resueltas',
      value: safeStats.resolved_alerts,
      total: safeStats.total_alerts,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      description: 'Total resueltas'
    },
    {
      title: 'Críticas',
      value: safeStats.by_severity.critical,
      total: safeStats.total_alerts,
      icon: Shield,
      color: safeStats.by_severity.critical > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500',
      bgColor: safeStats.by_severity.critical > 0 ? 'bg-red-100 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-gray-800',
      description: 'Requieren atención'
    }
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Tarjetas principales de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          // Asegurar que percentage es un número válido
          const percentage = stat.total > 0 && !isNaN(stat.value) && !isNaN(stat.total) 
            ? Math.round((stat.value / stat.total) * 100) 
            : 0;
          
          return (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.title}
                  </CardTitle>
                  <div className={cn("p-2 rounded-full", stat.bgColor)}>
                    <Icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stat.value}
                  </div>
                  {stat.total > 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      de {stat.total}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stat.description}
                </p>
                {stat.total > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">{percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className={cn(
                          "h-1 rounded-full transition-all duration-300",
                          stat.color.includes('green') ? 'bg-green-500' :
                          stat.color.includes('orange') ? 'bg-orange-500' :
                          stat.color.includes('red') ? 'bg-red-500' :
                          'bg-gray-400'
                        )}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas por severidad */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Por Severidad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(Object.entries(severityConfig) as [AlertSeverity, typeof severityConfig[AlertSeverity]][]).map(([severity, config]) => {
                const count = safeStats.by_severity[severity] || 0;
                const percentage = safeStats.total_alerts > 0 && !isNaN(count) 
                  ? Math.round((count / safeStats.total_alerts) * 100) 
                  : 0;
                const Icon = config.icon;
                
                return (
                  <div key={severity} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{count}</div>
                      <Badge variant="outline" className="text-xs px-2 py-0">
                        {percentage}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Alertas por módulo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Por Módulo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(Object.entries(moduleConfig) as [SourceModule, typeof moduleConfig[SourceModule]][])
                .filter(([module]) => (safeStats.by_module[module] || 0) > 0)
                .sort(([moduleA], [moduleB]) => (safeStats.by_module[moduleB] || 0) - (safeStats.by_module[moduleA] || 0))
                .map(([module, config]) => {
                  const count = safeStats.by_module[module] || 0;
                  const percentage = safeStats.total_alerts > 0 && !isNaN(count) 
                    ? Math.round((count / safeStats.total_alerts) * 100) 
                    : 0;
                  
                  return (
                    <div key={module} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          `bg-${config.color}-500`
                        )} />
                        <span className="text-sm font-medium">{config.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{count}</div>
                        <Badge variant="outline" className="text-xs px-2 py-0">
                          {percentage}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              
              {Object.values(safeStats.by_module).every(count => (count || 0) === 0) && (
                <div className="text-center text-gray-500 py-4">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay alertas por módulo</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas recientes */}
      {safeStats.recent_alerts && safeStats.recent_alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Alertas Recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {safeStats.recent_alerts.slice(0, 5).map((alert) => {
                const alertSeverityConfig = severityConfig[alert.severity];
                const Icon = alertSeverityConfig.icon;
                
                return (
                  <div key={alert.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className={cn(
                      "p-1 rounded-full mt-0.5",
                      alert.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/20' :
                      alert.severity === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                      'bg-blue-100 dark:bg-blue-900/20'
                    )}>
                      <Icon className={cn(
                        "h-3 w-3",
                        alert.severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                        alert.severity === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-blue-600 dark:text-blue-400'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {alert.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {alert.message}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {moduleConfig[alert.source_module]?.label}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {formatDate(alert.created_at)}
                        </span>
                      </div>
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
}
