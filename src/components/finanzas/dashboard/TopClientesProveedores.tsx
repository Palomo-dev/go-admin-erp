'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import { Users, Truck, Crown } from 'lucide-react';
import type { TopClienteProveedor } from './FinanzasDashboardService';

interface TopClientesProveedoresProps {
  clientes: TopClienteProveedor[];
  proveedores: TopClienteProveedor[];
  isLoading?: boolean;
  currencyCode?: string;
}

interface TopListProps {
  title: string;
  icon: React.ReactNode;
  items: TopClienteProveedor[];
  isLoading?: boolean;
  currencyCode?: string;
  colorScheme: 'blue' | 'orange';
}

function TopList({ title, icon, items, isLoading, currencyCode = 'COP', colorScheme }: TopListProps) {
  const colors = {
    blue: {
      header: 'text-blue-600 dark:text-blue-400',
      bar: 'bg-blue-500 dark:bg-blue-600',
      barBg: 'bg-blue-100 dark:bg-blue-900/30'
    },
    orange: {
      header: 'text-orange-600 dark:text-orange-400',
      bar: 'bg-orange-500 dark:bg-orange-600',
      barBg: 'bg-orange-100 dark:bg-orange-900/30'
    }
  };

  const scheme = colors[colorScheme];
  const maxMonto = items.length > 0 ? Math.max(...items.map(i => i.monto)) : 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className={cn('flex items-center gap-2 font-medium', scheme.header)}>
          {icon}
          <span>{title}</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-2 font-medium text-sm', scheme.header)}>
        {icon}
        <span>{title}</span>
      </div>
      
      {items.length === 0 ? (
        <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          Sin datos en el período
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const porcentaje = maxMonto > 0 ? (item.monto / maxMonto) * 100 : 0;
            
            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {index === 0 && (
                      <Crown className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                      {item.nombre}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(item.monto, currencyCode)}
                  </span>
                </div>
                <div className={cn('h-2 rounded-full overflow-hidden', scheme.barBg)}>
                  <div 
                    className={cn('h-full rounded-full transition-all', scheme.bar)}
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TopClientesProveedores({ clientes, proveedores, isLoading, currencyCode = 'COP' }: TopClientesProveedoresProps) {
  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
          Top Clientes y Proveedores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TopList
            title="Top 5 Clientes"
            icon={<Users className="h-4 w-4" />}
            items={clientes}
            isLoading={isLoading}
            currencyCode={currencyCode}
            colorScheme="blue"
          />
          <TopList
            title="Top 5 Proveedores"
            icon={<Truck className="h-4 w-4" />}
            items={proveedores}
            isLoading={isLoading}
            currencyCode={currencyCode}
            colorScheme="orange"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default TopClientesProveedores;
