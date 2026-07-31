'use client';

import { Card } from '@/components/ui/card';
import { Package, Clock, Navigation, CheckCircle } from 'lucide-react';

interface MisEnviosStatsProps {
  total: number;
  pendientes: number;
  enRuta: number;
  entregados: number;
}

export function MisEnviosStats({ total, pendientes, enRuta, entregados }: MisEnviosStatsProps) {
  const stats = [
    { label: 'Total', value: total, icon: Package, color: 'blue' },
    { label: 'Pendientes', value: pendientes, icon: Clock, color: 'yellow' },
    { label: 'En ruta', value: enRuta, icon: Navigation, color: 'orange' },
    { label: 'Entregados', value: entregados, icon: CheckCircle, color: 'green' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-${stat.color}-100 dark:bg-${stat.color}-900/30 rounded-lg`}>
                <Icon className={`h-5 w-5 text-${stat.color}-600 dark:text-${stat.color}-400`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
