'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { 
  AlertTriangle, 
  FileText, 
  Clock, 
  Building2, 
  Wallet,
  ChevronRight,
  Bell
} from 'lucide-react';
import Link from 'next/link';
import type { Alerta } from './FinanzasDashboardService';

interface AlertasCardProps {
  alertas: Alerta[];
  isLoading?: boolean;
  maxItems?: number;
}

const iconMap = {
  factura_vencer: FileText,
  resolucion_dian: Clock,
  conciliacion: Building2,
  cartera_vencida: AlertTriangle,
  saldo_bajo: Wallet
};

const prioridadColors = {
  alta: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    border: 'border-l-red-500'
  },
  media: {
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    border: 'border-l-yellow-500'
  },
  baja: {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    border: 'border-l-blue-500'
  }
};

export function AlertasCard({ alertas, isLoading, maxItems = 5 }: AlertasCardProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500" />
            Alertas y Notificaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const alertasMostradas = alertas.slice(0, maxItems);
  const alertasRestantes = alertas.length - maxItems;

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500" />
            Alertas y Notificaciones
          </CardTitle>
          {alertas.length > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {alertas.length} {alertas.length === 1 ? 'alerta' : 'alertas'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <Bell className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No hay alertas pendientes</p>
            <p className="text-sm">¡Todo está en orden!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alertasMostradas.map((alerta) => {
              const Icon = iconMap[alerta.tipo] || AlertTriangle;
              const colors = prioridadColors[alerta.prioridad];
              
              return (
                <div
                  key={alerta.id}
                  className={cn(
                    'p-3 rounded-lg border-l-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                    colors.border
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      alerta.prioridad === 'alta' ? 'bg-red-100 dark:bg-red-900/30' :
                      alerta.prioridad === 'media' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                      'bg-blue-100 dark:bg-blue-900/30'
                    )}>
                      <Icon className={cn(
                        'h-4 w-4',
                        alerta.prioridad === 'alta' ? 'text-red-600 dark:text-red-400' :
                        alerta.prioridad === 'media' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-blue-600 dark:text-blue-400'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {alerta.titulo}
                        </span>
                        <Badge className={cn('text-xs', colors.badge)}>
                          {alerta.prioridad}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {alerta.descripcion}
                      </p>
                    </div>
                    {alerta.enlace && (
                      <Link href={alerta.enlace}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
            
            {alertasRestantes > 0 && (
              <div className="pt-2 text-center">
                <Button variant="link" className="text-blue-600 dark:text-blue-400">
                  Ver {alertasRestantes} alertas más
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AlertasCard;
