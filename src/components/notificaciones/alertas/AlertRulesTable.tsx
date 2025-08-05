'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  Edit, 
  Trash2, 
  Play, 
  Pause,
  Shield,
  AlertTriangle,
  Info,
  XCircle
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AlertRule, AlertSeverity, SourceModule } from '@/types/alert';

interface AlertRulesTableProps {
  rules: AlertRule[];
  loading?: boolean;
  onEdit: (rule: AlertRule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  className?: string;
}

// Configuración de severidad
const severityConfig: Record<AlertSeverity, { 
  label: string; 
  color: string; 
  icon: React.ElementType;
  className: string;
}> = {
  info: {
    label: 'Info',
    color: 'blue',
    icon: Info,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
  },
  warning: {
    label: 'Advertencia',
    color: 'yellow',
    icon: AlertTriangle,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
  },
  critical: {
    label: 'Crítico',
    color: 'red',
    icon: Shield,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 font-semibold'
  }
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

export default function AlertRulesTable({
  rules,
  loading = false,
  onEdit,
  onDelete,
  onToggle,
  className
}: AlertRulesTableProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    const config = severityConfig[severity];
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
    
    return (
      <Badge variant="outline" className="text-xs">
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Severidad</TableHead>
              <TableHead>Canales</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </TableCell>
                <TableCell>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
                </TableCell>
                <TableCell>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
                </TableCell>
                <TableCell>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-12" />
                </TableCell>
                <TableCell>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-12" />
                </TableCell>
                <TableCell>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24" />
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

  if (rules.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No hay reglas de alerta
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Crea tu primera regla de alerta para comenzar a monitorear tu sistema.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Módulo</TableHead>
            <TableHead>Severidad</TableHead>
            <TableHead>Canales</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {rule.name}
                  </div>
                  {rule.description && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {rule.description}
                    </div>
                  )}
                </div>
              </TableCell>
              
              <TableCell>
                {getModuleBadge(rule.source_module)}
              </TableCell>
              
              <TableCell>
                {getSeverityBadge(rule.severity)}
              </TableCell>
              
              <TableCell>
                <div className="text-sm font-medium">
                  {rule.channels.length} canal{rule.channels.length !== 1 ? 'es' : ''}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {rule.channels.join(', ')}
                </div>
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.active}
                    onCheckedChange={(checked) => onToggle(rule.id, checked)}
                  />
                  <span className={cn(
                    "text-xs font-medium",
                    rule.active 
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400"
                  )}>
                    {rule.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </TableCell>
              
              <TableCell>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(rule.created_at)}
                </div>
              </TableCell>
              
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(rule)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => onToggle(rule.id, !rule.active)}
                    >
                      {rule.active ? (
                        <>
                          <Pause className="h-4 w-4 mr-2" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Activar
                        </>
                      )}
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => onDelete(rule.id)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
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
