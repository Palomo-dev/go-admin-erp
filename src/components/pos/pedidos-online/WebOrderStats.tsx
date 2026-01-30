'use client';

import { Card, CardContent } from '@/components/ui/card';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  DollarSign,
  TrendingUp,
  Package
} from 'lucide-react';

interface WebOrderStatsProps {
  stats: {
    total_orders: number;
    pending_orders: number;
    completed_orders: number;
    cancelled_orders: number;
    total_revenue: number;
    avg_order_value: number;
  };
  isLoading?: boolean;
}

export function WebOrderStats({ stats, isLoading }: WebOrderStatsProps) {
  const statItems = [
    {
      label: 'Pedidos hoy',
      value: stats.total_orders,
      icon: <Package className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Pendientes',
      value: stats.pending_orders,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
      highlight: stats.pending_orders > 0,
    },
    {
      label: 'Completados',
      value: stats.completed_orders,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Cancelados',
      value: stats.cancelled_orders,
      icon: <XCircle className="h-5 w-5" />,
      color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    },
    {
      label: 'Ingresos',
      value: `$${stats.total_revenue.toLocaleString()}`,
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      label: 'Ticket promedio',
      value: `$${Math.round(stats.avg_order_value).toLocaleString()}`,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-10 w-10 bg-muted rounded-lg mb-2" />
              <div className="h-4 w-16 bg-muted rounded mb-1" />
              <div className="h-6 w-12 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statItems.map((item, index) => (
        <Card 
          key={index} 
          className={`transition-all ${item.highlight ? 'ring-2 ring-yellow-500 shadow-lg' : ''}`}
        >
          <CardContent className="p-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${item.color}`}>
              {item.icon}
            </div>
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
