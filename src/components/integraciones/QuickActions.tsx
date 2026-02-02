'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  Plus,
  Activity,
  Briefcase,
  Download,
  RefreshCw,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

interface QuickAction {
  label: string;
  description: string;
  href?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
  onClick?: () => void;
}

interface QuickActionsProps {
  onNewConnection?: () => void;
  onExport?: () => void;
  onRetryFailed?: () => void;
}


export function QuickActions({ onNewConnection, onExport, onRetryFailed }: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      label: 'Nueva Conexión',
      description: 'Conectar un proveedor',
      href: '/app/integraciones/conexiones/nueva',
      icon: <Plus className="h-5 w-5" />,
      color: 'blue',
      onClick: onNewConnection,
    },
    {
      label: 'Ver Eventos',
      description: 'Logs y auditoría',
      href: '/app/integraciones/eventos',
      icon: <Activity className="h-5 w-5" />,
      color: 'green',
    },
    {
      label: 'Ver Jobs',
      description: 'Sincronización',
      href: '/app/integraciones/jobs',
      icon: <Briefcase className="h-5 w-5" />,
      color: 'purple',
    },
    {
      label: 'Exportar Estado',
      description: 'CSV / JSON',
      icon: <Download className="h-5 w-5" />,
      color: 'orange',
      onClick: onExport,
    },
  ];

  return (
    <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Acciones Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action, idx) => {
            const content = (
              <div className={cn(
                'p-4 rounded-lg border transition-all cursor-pointer',
                'border-gray-200 dark:border-gray-700',
                'bg-gray-50 dark:bg-gray-800/50',
                'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                'hover:shadow-md',
                'group'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg transition-colors',
                    action.color === 'blue' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                    action.color === 'green' && 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
                    action.color === 'purple' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
                    action.color === 'orange' && 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
                  )}>
                    {action.icon}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {action.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {action.description}
                    </p>
                  </div>
                </div>
              </div>
            );

            if (action.href && !action.onClick) {
              return (
                <Link key={idx} href={action.href}>
                  {content}
                </Link>
              );
            }

            return (
              <div key={idx} onClick={action.onClick}>
                {content}
              </div>
            );
          })}
        </div>

        {onRetryFailed && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="outline"
              className="w-full border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              onClick={onRetryFailed}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar Jobs Fallidos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default QuickActions;
