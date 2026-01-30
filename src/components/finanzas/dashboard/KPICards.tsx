'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertTriangle,
  Wallet,
  Building2,
  Users,
  Truck
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import type { KPIData } from './FinanzasDashboardService';

interface KPICardsProps {
  data: KPIData;
  isLoading?: boolean;
  currencyCode?: string;
}

interface KPICardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';
  currencyCode?: string;
  isLoading?: boolean;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800'
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800'
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    icon: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800'
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800'
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800'
  }
};

function KPICard({ title, value, icon, trend, trendValue, color, currencyCode = 'COP', isLoading }: KPICardProps) {
  const colors = colorClasses[color];
  
  if (isLoading) {
    return (
      <Card className={cn('border', colors.border, 'dark:bg-gray-800/50')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className={cn('p-3 rounded-lg', colors.bg)}>
              <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn('border transition-all hover:shadow-md', colors.border, 'dark:bg-gray-800/50')}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(value, currencyCode)}
            </p>
            {trend && trendValue && (
              <div className={cn(
                'flex items-center gap-1 text-xs',
                trend === 'up' ? 'text-green-600 dark:text-green-400' : 
                trend === 'down' ? 'text-red-600 dark:text-red-400' : 
                'text-gray-500 dark:text-gray-400'
              )}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : 
                 trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
                <span>{trendValue}</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-lg', colors.bg)}>
            <div className={cn('h-6 w-6', colors.icon)}>
              {icon}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function KPICards({ data, isLoading, currencyCode = 'COP' }: KPICardsProps) {
  const kpis = [
    {
      title: 'Ingresos',
      value: data.ingresos,
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'green' as const,
      trend: 'up' as const,
      trendValue: 'Ventas del período'
    },
    {
      title: 'Egresos',
      value: data.egresos,
      icon: <TrendingDown className="h-6 w-6" />,
      color: 'red' as const,
      trend: 'down' as const,
      trendValue: 'Compras del período'
    },
    {
      title: 'Utilidad Bruta',
      value: data.utilidadBruta,
      icon: <DollarSign className="h-6 w-6" />,
      color: data.utilidadBruta >= 0 ? 'blue' as const : 'red' as const,
      trend: data.utilidadBruta >= 0 ? 'up' as const : 'down' as const,
      trendValue: data.utilidadBruta >= 0 ? 'Positivo' : 'Negativo'
    },
    {
      title: 'Cartera Vencida',
      value: data.carteraVencida,
      icon: <AlertTriangle className="h-6 w-6" />,
      color: data.carteraVencida > 0 ? 'yellow' as const : 'green' as const,
      trend: data.carteraVencida > 0 ? 'down' as const : 'neutral' as const,
      trendValue: data.carteraVencida > 0 ? 'Requiere atención' : 'Sin vencidos'
    },
    {
      title: 'Caja',
      value: data.caja,
      icon: <Wallet className="h-6 w-6" />,
      color: 'purple' as const
    },
    {
      title: 'Bancos',
      value: data.bancos,
      icon: <Building2 className="h-6 w-6" />,
      color: 'blue' as const
    },
    {
      title: 'Cuentas por Cobrar',
      value: data.cuentasPorCobrar,
      icon: <Users className="h-6 w-6" />,
      color: 'orange' as const,
      trendValue: 'Total pendiente'
    },
    {
      title: 'Cuentas por Pagar',
      value: data.cuentasPorPagar,
      icon: <Truck className="h-6 w-6" />,
      color: 'red' as const,
      trendValue: 'Total pendiente'
    }
  ];
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi, index) => (
        <KPICard
          key={index}
          title={kpi.title}
          value={kpi.value}
          icon={kpi.icon}
          color={kpi.color}
          trend={kpi.trend}
          trendValue={kpi.trendValue}
          currencyCode={currencyCode}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}

export default KPICards;
