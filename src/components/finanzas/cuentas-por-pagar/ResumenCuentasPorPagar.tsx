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
      blue: { bg: 'bg-blue-500 dark:bg-blue-600', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-700' },
      red: { bg: 'bg-red-500 dark:bg-red-600', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-700' },
      yellow: { bg: 'bg-yellow-500 dark:bg-yellow-600', text: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-700' },
      purple: { bg: 'bg-purple-500 dark:bg-purple-600', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-700' },
      green: { bg: 'bg-green-500 dark:bg-green-600', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-700' },
      gray: { bg: 'bg-gray-500 dark:bg-gray-600', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' }
    };
    
    return colorMap[color as keyof typeof colorMap]?.[variant] || colorMap.gray[variant];
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Widgets principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {widgets.map((widget, index) => (
          <Card key={index} className="relative overflow-hidden dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 sm:p-2 rounded-lg ${getColorClasses(widget.color, 'bg')} bg-opacity-10`}>
                    <widget.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${getColorClasses(widget.color, 'text')}`} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      {widget.title}
                    </p>
                    {widget.badge && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs mt-1 px-1 sm:px-1.5 py-0 dark:border-gray-600 dark:text-gray-300">
                        {widget.badge}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="mt-3 sm:mt-4">
                <div className="flex items-baseline gap-1.5 sm:gap-2">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(widget.value)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    {widget.currency}
                  </p>
                </div>
                
                <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {widget.description}
                </p>
                
                {widget.subtitle && (
                  <p className={`text-[10px] sm:text-xs mt-1 font-medium ${getColorClasses(widget.color, 'text')}`}>
                    {widget.subtitle}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Indicadores adicionales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Nivel de urgencia */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center text-gray-900 dark:text-white">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              <span>Nivel de Urgencia</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${
                urgencyLevel === 'high' ? 'bg-red-500 dark:bg-red-400' :
                urgencyLevel === 'medium' ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-green-500 dark:bg-green-400'
              }`} />
              <div>
                <p className={`text-xs sm:text-sm font-medium ${
                  urgencyLevel === 'high' ? 'text-red-600 dark:text-red-400' :
                  urgencyLevel === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                }`}>
                  {urgencyLevel === 'high' ? 'Alto' :
                   urgencyLevel === 'medium' ? 'Medio' : 'Bajo'}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                  {porcentajeVencido.toFixed(1)}% vencido
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Proveedores activos */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center text-gray-900 dark:text-white">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              <span>Proveedores Activos</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 sm:space-y-2">
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                {resumen.suppliers_count}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                Promedio: {formatCurrency(promedioProveedores)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estado general */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center text-gray-900 dark:text-white">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              <span>Estado General</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex justify-between text-[10px] sm:text-xs">
                <span className="text-gray-600 dark:text-gray-400">Pendientes</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {resumen.total_amount && formatCurrency(resumen.total_pending)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] sm:text-xs">
                <span className="text-gray-600 dark:text-gray-400">Parciales</span>
                <span className="font-medium text-yellow-600 dark:text-yellow-400">
                  {formatCurrency(resumen.total_partial)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] sm:text-xs">
                <span className="text-gray-600 dark:text-gray-400">Vencidas</span>
                <span className="font-medium text-red-600 dark:text-red-400">
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
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-200">
                  Atención: Pagos Vencidos
                </h4>
                <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mt-1">
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
