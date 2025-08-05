'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Wallet,
  Clock
} from 'lucide-react';

import { AccountsPayableSummary } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface ResumenCuentasPorPagarProps {
  resumen: AccountsPayableSummary;
}

export function ResumenCuentasPorPagar({ resumen }: ResumenCuentasPorPagarProps) {
  
  // Calcular métricas adicionales
  const porcentajeVencido = resumen.total_amount > 0 
    ? (resumen.total_overdue / resumen.total_amount) * 100 
    : 0;
  
  const promedioProveedores = resumen.suppliers_count > 0 
    ? resumen.total_amount / resumen.suppliers_count 
    : 0;

  const urgencyLevel = porcentajeVencido > 30 ? 'high' : porcentajeVencido > 10 ? 'medium' : 'low';

  const widgets = [
    {
      title: 'Total Pendiente',
      value: resumen.total_amount,
      currency: 'COP',
      icon: Wallet,
      color: 'blue',
      description: 'Monto total por pagar'
    },
    {
      title: 'Pagos Vencidos',
      value: resumen.total_overdue,
      currency: 'COP',
      icon: AlertCircle,
      color: resumen.total_overdue > 0 ? 'red' : 'gray',
      description: `${resumen.overdue_count} cuenta${resumen.overdue_count !== 1 ? 's' : ''} vencida${resumen.overdue_count !== 1 ? 's' : ''}`,
      badge: resumen.overdue_count > 0 ? `${porcentajeVencido.toFixed(1)}%` : null
    },
    {
      title: 'Pagos Parciales',
      value: resumen.total_partial,
      currency: 'COP',
      icon: TrendingUp,
      color: resumen.total_partial > 0 ? 'yellow' : 'gray',
      description: 'Cuentas con pagos parciales'
    },
    {
      title: 'Próximo Vencimiento',
      value: resumen.next_due_amount,
      currency: 'COP',
      icon: Calendar,
      color: 'purple',
      description: resumen.next_due_date ? formatDate(resumen.next_due_date) : 'Sin vencimientos próximos',
      subtitle: resumen.next_due_date ? getDaysUntilDue(resumen.next_due_date) : null
    }
  ];

  function getDaysUntilDue(dueDate: string): string {
    const due = new Date(dueDate);
    const today = new Date();
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `Vencido hace ${Math.abs(diffDays)} días`;
    if (diffDays === 0) return 'Vence hoy';
    if (diffDays === 1) return 'Vence mañana';
    return `Vence en ${diffDays} días`;
  }

  function getColorClasses(color: string, variant: 'bg' | 'text' | 'border' = 'bg') {
    const colorMap = {
      blue: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200' },
      red: { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-200' },
      yellow: { bg: 'bg-yellow-500', text: 'text-yellow-600', border: 'border-yellow-200' },
      purple: { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200' },
      green: { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-200' },
      gray: { bg: 'bg-gray-500', text: 'text-gray-600', border: 'border-gray-200' }
    };
    
    return colorMap[color as keyof typeof colorMap]?.[variant] || colorMap.gray[variant];
  }

  return (
    <div className="space-y-6">
      {/* Widgets principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {widgets.map((widget, index) => (
          <Card key={index} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`p-2 rounded-lg ${getColorClasses(widget.color, 'bg')} bg-opacity-10`}>
                    <widget.icon className={`w-5 h-5 ${getColorClasses(widget.color, 'text')}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {widget.title}
                    </p>
                    {widget.badge && (
                      <Badge variant="outline" className="text-xs mt-1">
                        {widget.badge}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(widget.value)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {widget.currency}
                  </p>
                </div>
                
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {widget.description}
                </p>
                
                {widget.subtitle && (
                  <p className={`text-xs mt-1 font-medium ${getColorClasses(widget.color, 'text')}`}>
                    {widget.subtitle}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Indicadores adicionales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nivel de urgencia */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Nivel de Urgencia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                urgencyLevel === 'high' ? 'bg-red-500' :
                urgencyLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
              }`} />
              <div>
                <p className={`text-sm font-medium ${
                  urgencyLevel === 'high' ? 'text-red-600' :
                  urgencyLevel === 'medium' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {urgencyLevel === 'high' ? 'Alto' :
                   urgencyLevel === 'medium' ? 'Medio' : 'Bajo'}
                </p>
                <p className="text-xs text-gray-500">
                  {porcentajeVencido.toFixed(1)}% vencido
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Proveedores activos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Proveedores Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {resumen.suppliers_count}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Promedio: {formatCurrency(promedioProveedores)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estado general */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="w-4 h-4 mr-2" />
              Estado General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Pendientes</span>
                <span className="font-medium">
                  {resumen.total_amount && formatCurrency(resumen.total_pending)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Parciales</span>
                <span className="font-medium text-yellow-600">
                  {formatCurrency(resumen.total_partial)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Vencidas</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(resumen.total_overdue)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerta para pagos vencidos */}
      {resumen.total_overdue > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Atención: Pagos Vencidos
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Tienes {resumen.overdue_count} cuenta{resumen.overdue_count !== 1 ? 's' : ''} por pagar vencida{resumen.overdue_count !== 1 ? 's' : ''} 
                  por un total de {formatCurrency(resumen.total_overdue)}. 
                  Se recomienda realizar los pagos lo antes posible para evitar recargos.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
