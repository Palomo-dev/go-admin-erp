'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Car, Clock, Wrench, CircleCheck } from 'lucide-react';

export function MapaLegend() {
  const items = [
    {
      label: 'Libre',
      color: 'bg-green-400 dark:bg-green-600',
      icon: CircleCheck,
    },
    {
      label: 'Ocupado',
      color: 'bg-red-400 dark:bg-red-600',
      icon: Car,
    },
    {
      label: 'Reservado',
      color: 'bg-amber-400 dark:bg-amber-600',
      icon: Clock,
    },
    {
      label: 'Mantenimiento',
      color: 'bg-purple-400 dark:bg-purple-600',
      icon: Wrench,
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardContent className="p-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Leyenda
        </p>
        <div className="flex flex-wrap gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${item.color}`} />
              <item.icon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
              <span className="text-xs text-gray-600 dark:text-gray-300">{item.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default MapaLegend;
