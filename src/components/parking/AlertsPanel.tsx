'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Clock, 
  CreditCard, 
  TrendingUp,
  Bell
} from 'lucide-react';
import { cn } from '@/utils/Utils';

interface AlertsPanelProps {
  atRiskSessions: number;
  expiringIn7Days: number;
  occupancyRate: number;
  totalActivePasses: number;
}

export function AlertsPanel({
  atRiskSessions,
  expiringIn7Days,
  occupancyRate,
  totalActivePasses,
}: AlertsPanelProps) {
  const alerts = [];

  // Alerta de sesiones en riesgo
  if (atRiskSessions > 0) {
    alerts.push({
      type: 'danger',
      icon: <Clock className="h-4 w-4" />,
      title: 'Sesiones prolongadas',
      description: `${atRiskSessions} vehículo${atRiskSessions > 1 ? 's' : ''} con más de 8 horas`,
    });
  }

  // Alerta de vencimientos próximos
  if (expiringIn7Days > 0) {
    alerts.push({
      type: 'warning',
      icon: <CreditCard className="h-4 w-4" />,
      title: 'Abonados por vencer',
      description: `${expiringIn7Days} pase${expiringIn7Days > 1 ? 's' : ''} vence${expiringIn7Days > 1 ? 'n' : ''} en 7 días`,
    });
  }

  // Alerta de alta ocupación
  if (occupancyRate >= 90) {
    alerts.push({
      type: 'danger',
      icon: <TrendingUp className="h-4 w-4" />,
      title: 'Capacidad alta',
      description: `Ocupación al ${occupancyRate}% - Casi lleno`,
    });
  } else if (occupancyRate >= 75) {
    alerts.push({
      type: 'warning',
      icon: <TrendingUp className="h-4 w-4" />,
      title: 'Ocupación elevada',
      description: `Ocupación al ${occupancyRate}%`,
    });
  }

  const getAlertStyles = (type: string) => {
    switch (type) {
      case 'danger':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300';
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';
    }
  };

  const getIconStyles = (type: string) => {
    switch (type) {
      case 'danger':
        return 'bg-red-100 dark:bg-red-800 text-red-600 dark:text-red-300';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-800 text-yellow-600 dark:text-yellow-300';
      default:
        return 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300';
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Bell className="h-5 w-5 text-orange-500" />
            Alertas
          </CardTitle>
          {alerts.length > 0 && (
            <Badge variant="destructive">
              {alerts.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sin alertas activas
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Todo funciona correctamente
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  getAlertStyles(alert.type)
                )}
              >
                <div className={cn(
                  'p-2 rounded-full flex-shrink-0',
                  getIconStyles(alert.type)
                )}>
                  {alert.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{alert.title}</p>
                  <p className="text-xs opacity-80">{alert.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
