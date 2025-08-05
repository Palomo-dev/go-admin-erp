'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Info,
  Shield,
  Clock,
  Eye,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { SystemAlert, AlertSeverity, AlertStatus, SourceModule } from '@/types/alert';

interface SystemAlertsTableProps {
  alerts: SystemAlert[];
  loading?: boolean;
  selectedAlerts: string[];
  onSelectAlert: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onResolve: (id: string) => void;
  onView: (alert: SystemAlert) => void;
  className?: string;
}

// Configuración de severidad
const severityConfig: Record<AlertSeverity, { 
  label: string; 
  icon: React.ElementType;
  className: string;
}> = {
  info: {
    label: 'Info',
    icon: Info,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
  },
  warning: {
    label: 'Advertencia',
    icon: AlertTriangle,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
  },
  critical: {
    label: 'Crítico',
    icon: Shield,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 font-semibold border border-red-300 dark:border-red-700'
  }
};

// Configuración de estado
const statusConfig: Record<AlertStatus, { 
  label: string; 
  icon: React.ElementType;
  className: string;
}> = {
  pending: {
    label: 'Pendiente',
    icon: Clock,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
  },
  delivered: {
    label: 'Entregada',
    icon: CheckCircle,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
  },
  read: {
    label: 'Leída',
    icon: Eye,
    className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
  },
  resolved: {
    label: 'Resuelta',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
  },
  ignored: {
    label: 'Ignorada',
    icon: XCircle,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
  }
};

// Configuración de módulos
const moduleConfig: Record<string, { label: string; color: string }> = {
  sistema: { label: 'Sistema', color: 'gray' },
  ventas: { label: 'Ventas', color: 'green' },
  inventario: { label: 'Inventario', color: 'purple' },
  pms: { label: 'PMS', color: 'blue' },
  pos: { label: 'POS', color: 'green' },
  rrhh: { label: 'RR.HH.', color: 'orange' },
  hrm: { label: 'Recursos Humanos', color: 'orange' },
  crm: { label: 'CRM', color: 'indigo' },
  finanzas: { label: 'Finanzas', color: 'emerald' },
  transporte: { label: 'Transporte', color: 'cyan' }
};

export default function SystemAlertsTable({
  alerts,
  loading = false,
  selectedAlerts,
  onSelectAlert,
  onSelectAll,
  onResolve,
  onView,
  className
}: SystemAlertsTableProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Ahora mismo';
    if (diffInMinutes < 60) return `Hace ${diffInMinutes}m`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Hace ${diffInHours}h`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `Hace ${diffInDays}d`;
    
    return formatDate(dateString);
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    const config = severityConfig[severity];
    if (!config) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Info className="h-3 w-3" />
          {severity}
        </Badge>
      );
    }
    
    const Icon = config.icon;
    return (
      <Badge variant="secondary" className={cn(config.className, "flex items-center gap-1")}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: AlertStatus) => {
    const config = statusConfig[status];
    if (!config) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {status}
        </Badge>
      );
    }
    
    const Icon = config.icon;
    return (
      <Badge variant="secondary" className={cn(config.className, "flex items-center gap-1")}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getModuleBadge = (module: SourceModule) => {
    const config = moduleConfig[module];
    
    // Si no existe configuración para el módulo, usar valores por defecto
    const label = config?.label || module.charAt(0).toUpperCase() + module.slice(1);
    
    return (
      <Badge variant="outline" className="text-xs">
        {label}
      </Badge>
    );
  };

  const isAllSelected = alerts.length > 0 && selectedAlerts.length === alerts.length;
  const isPartiallySelected = selectedAlerts.length > 0 && selectedAlerts.length < alerts.length;

  if (loading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox disabled />
              </TableHead>
              <TableHead>Alerta</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Severidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Tiempo</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Checkbox disabled />
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
                </TableCell>
                <TableCell>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
                </TableCell>
                <TableCell>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
                </TableCell>
                <TableCell>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
                </TableCell>
                <TableCell>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-8" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No hay alertas activas
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          ¡Excelente! Tu sistema está funcionando sin problemas.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={onSelectAll}
                className={isPartiallySelected ? "data-[state=checked]:bg-blue-500" : ""}
              />
            </TableHead>
            <TableHead>Alerta</TableHead>
            <TableHead>Módulo</TableHead>
            <TableHead>Severidad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Tiempo</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((alert) => (
            <TableRow 
              key={alert.id}
              className={cn(
                "hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer",
                alert.severity === 'critical' && "bg-red-50/50 dark:bg-red-900/10",
                selectedAlerts.includes(alert.id) && "bg-blue-50 dark:bg-blue-900/20"
              )}
              onClick={() => onView(alert)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedAlerts.includes(alert.id)}
                  onCheckedChange={(checked) => onSelectAlert(alert.id, checked as boolean)}
                />
              </TableCell>
              
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {alert.title}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {alert.message}
                  </div>
                  {alert.sent_channels && alert.sent_channels.length > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-xs text-gray-400">Enviado por:</span>
                      {alert.sent_channels.map((channel, index) => (
                        <Badge key={index} variant="outline" className="text-xs px-1 py-0">
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </TableCell>
              
              <TableCell>
                {getModuleBadge(alert.source_module)}
              </TableCell>
              
              <TableCell>
                {getSeverityBadge(alert.severity)}
              </TableCell>
              
              <TableCell>
                {getStatusBadge(alert.status)}
              </TableCell>
              
              <TableCell>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formatRelativeTime(alert.created_at)}
                </div>
                {alert.resolved_at && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    Resuelta: {formatRelativeTime(alert.resolved_at)}
                  </div>
                )}
              </TableCell>
              
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(alert)}>
                      <Eye className="h-4 w-4 mr-2" />
                      Ver detalles
                    </DropdownMenuItem>
                    
                    {alert.status !== 'resolved' && (
                      <DropdownMenuItem onClick={() => onResolve(alert.id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Resolver
                      </DropdownMenuItem>
                    )}
                    
                    {alert.status === 'resolved' && (
                      <DropdownMenuItem onClick={() => {}}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reactivar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
