'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { EstadisticasCxC } from './types';
import { formatCurrency } from '@/utils/Utils';

interface EstadisticasCardsProps {
  estadisticas: EstadisticasCxC;
  isLoading?: boolean;
}

export function EstadisticasCards({ estadisticas, isLoading }: EstadisticasCardsProps) {
  const cards = [
    {
      title: 'Total por Cobrar',
      value: formatCurrency(estadisticas.total_balance),
      icon: DollarSign,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      subtitle: `${estadisticas.total_cuentas} cuentas activas`,
    },
    {
      title: 'Vigentes',
      value: formatCurrency(estadisticas.current_amount),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      subtitle: 'Al día',
    },
    {
      title: 'Vencidas',
      value: formatCurrency(estadisticas.overdue_amount),
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      subtitle: 'Requieren seguimiento',
    },
    {
      title: 'Promedio Días Cobro',
      value: `${Math.round(estadisticas.promedio_dias_cobro)} días`,
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      subtitle: 'Tiempo promedio',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="dark:bg-gray-800/50 dark:border-gray-700">
            <CardHeader className="space-y-2">
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
              <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <Card key={index} className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-full ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {card.value}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {card.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EstadisticasDetalle({ estadisticas }: { estadisticas: EstadisticasCxC }) {
  const porcentajePagado = estadisticas.total_amount > 0 
    ? (estadisticas.paid_amount / estadisticas.total_amount) * 100 
    : 0;

  const porcentajeVencido = estadisticas.total_balance > 0 
    ? (estadisticas.overdue_amount / estadisticas.total_balance) * 100 
    : 0;

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 dark:text-white">
          Resumen Detallado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Total Facturado</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatCurrency(estadisticas.total_amount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Total Cobrado</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {formatCurrency(estadisticas.paid_amount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Parcialmente Cobrado</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatCurrency(estadisticas.partial_amount)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Eficiencia de Cobro</span>
              <Badge variant={porcentajePagado >= 80 ? 'default' : porcentajePagado >= 60 ? 'secondary' : 'destructive'}>
                {porcentajePagado.toFixed(1)}%
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Cartera Vencida</span>
              <Badge variant={porcentajeVencido <= 10 ? 'default' : porcentajeVencido <= 25 ? 'secondary' : 'destructive'}>
                {porcentajeVencido.toFixed(1)}%
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">Cuentas Activas</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {estadisticas.total_cuentas}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
