'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Truck, CheckCircle2, Package } from 'lucide-react';
import type { InventoryTransfer } from '../transferencias/types';

interface DistribucionStatsProps {
  transferencias: InventoryTransfer[];
}

export function DistribucionStats({ transferencias }: DistribucionStatsProps) {
  const pendientes = transferencias.filter((t) => t.status === 'pending').length;
  const enTransito = transferencias.filter((t) => t.status === 'in_transit').length;
  const recibidas = transferencias.filter((t) => t.status === 'complete').length;
  const parciales = transferencias.filter((t) => t.status === 'partial').length;

  const stats = [
    {
      label: 'Pendientes',
      value: pendientes,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      label: 'En Tránsito',
      value: enTransito,
      icon: Truck,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Recibidas',
      value: recibidas,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Parciales',
      value: parciales,
      icon: Package,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
