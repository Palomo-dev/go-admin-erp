'use client';

import { Card } from '@/components/ui/card';
import { Package, CheckCircle, Truck, XCircle, Clock, DollarSign, AlertCircle, RotateCcw, ClipboardList, Scale, CalendarDays, UserX, TrendingUp } from 'lucide-react';

interface ShipmentsStatsProps {
  stats: {
    total: number;
    pending: number;
    assigned: number;
    inTransit: number;
    outForDelivery: number;
    delivered: number;
    failed: number;
    returned: number;
    cancelled: number;
    revenue: number;
    totalWeight?: number;
    totalDeclaredValue?: number;
    shipmentsToday?: number;
    unassignedPending?: number;
    deliveryRate?: number;
  };
}

export function ShipmentsStats({ stats }: ShipmentsStatsProps) {
  const fmtCOP = (v: number) => new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(v || 0);

  const fmtNum = (v: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(v || 0);

  const highlightCards = [
    {
      title: 'Total Envíos',
      value: stats.total,
      sub: stats.shipmentsToday ? `${stats.shipmentsToday} hoy` : undefined,
      icon: <Package className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300',
    },
    {
      title: 'Tasa de Entrega',
      value: `${stats.deliveryRate ?? 0}%`,
      sub: `${stats.delivered} entregados`,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-300',
    },
    {
      title: 'Sin Asignar',
      value: stats.unassignedPending ?? 0,
      sub: 'pendientes sin conductor',
      icon: <UserX className="h-5 w-5" />,
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300',
    },
    {
      title: 'Ingresos',
      value: fmtCOP(stats.revenue),
      sub: 'envíos entregados',
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
  ];

  const statusCards = [
    { title: 'Pendientes', value: stats.pending, icon: <Clock className="h-4 w-4" />, color: 'text-yellow-600 dark:text-yellow-300' },
    { title: 'Asignados', value: stats.assigned, icon: <ClipboardList className="h-4 w-4" />, color: 'text-cyan-600 dark:text-cyan-300' },
    { title: 'En Tránsito', value: stats.inTransit, icon: <Truck className="h-4 w-4" />, color: 'text-purple-600 dark:text-purple-300' },
    { title: 'En Entrega', value: stats.outForDelivery, icon: <Truck className="h-4 w-4" />, color: 'text-orange-600 dark:text-orange-300' },
    { title: 'Entregados', value: stats.delivered, icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600 dark:text-green-300' },
    { title: 'Fallidos', value: stats.failed, icon: <AlertCircle className="h-4 w-4" />, color: 'text-red-600 dark:text-red-300' },
    { title: 'Devueltos', value: stats.returned, icon: <RotateCcw className="h-4 w-4" />, color: 'text-orange-600 dark:text-orange-300' },
    { title: 'Cancelados', value: stats.cancelled, icon: <XCircle className="h-4 w-4" />, color: 'text-gray-600 dark:text-gray-300' },
  ];

  const extraStats = [
    { label: 'Peso Total', value: `${fmtNum(stats.totalWeight || 0)} kg`, icon: <Scale className="h-4 w-4" /> },
    { label: 'Valor Declarado', value: fmtCOP(stats.totalDeclaredValue || 0), icon: <DollarSign className="h-4 w-4" /> },
    { label: 'Envíos Hoy', value: stats.shipmentsToday ?? 0, icon: <CalendarDays className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {highlightCards.map((stat) => (
          <Card key={stat.title} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.color}`}>{stat.icon}</div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.title}</p>
                {stat.sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{stat.sub}</p>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {statusCards.map((stat) => (
          <Card key={stat.title} className="p-3">
            <div className="flex items-center gap-2">
              <span className={stat.color}>{stat.icon}</span>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.title}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {extraStats.map((stat) => (
          <Card key={stat.label} className="p-3 flex items-center gap-2">
            <span className="text-gray-400 dark:text-gray-500">{stat.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{stat.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
