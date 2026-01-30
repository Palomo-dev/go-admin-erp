'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { DollarSign, Layers, TrendingUp, Calendar } from 'lucide-react';
import type { Rate } from '@/lib/services/ratesService';

interface RatesStatsProps {
  rates: Rate[];
  isLoading?: boolean;
}

export function RatesStats({ rates, isLoading }: RatesStatsProps) {
  const totalRates = rates.length;
  const uniqueSpaceTypes = new Set(rates.map((r) => r.space_type_id)).size;
  const averagePrice =
    totalRates > 0
      ? Math.round(rates.reduce((sum, r) => sum + Number(r.price), 0) / totalRates)
      : 0;
  
  // Contar tarifas con is_active = true
  const activeRates = rates.filter((r) => r.is_active).length;

  const stats = [
    {
      label: 'Total Tarifas',
      value: totalRates,
      icon: DollarSign,
      color: 'text-gray-900 dark:text-gray-100',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      iconColor: 'text-gray-600 dark:text-gray-400',
    },
    {
      label: 'Tipos de Espacio',
      value: uniqueSpaceTypes,
      icon: Layers,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Precio Promedio',
      value: `$${averagePrice.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Tarifas Activas',
      value: activeRates,
      icon: Calendar,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3"></div>
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {stat.label}
              </p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
