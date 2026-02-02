'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Car, Bike, Truck } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { VehicleTypeStats } from '@/lib/services/parkingReportService';

interface VehicleTypeChartProps {
  data: VehicleTypeStats[];
  isLoading?: boolean;
}

const VEHICLE_ICONS: Record<string, React.ReactNode> = {
  car: <Car className="h-5 w-5" />,
  carro: <Car className="h-5 w-5" />,
  motorcycle: <Bike className="h-5 w-5" />,
  moto: <Bike className="h-5 w-5" />,
  truck: <Truck className="h-5 w-5" />,
  camion: <Truck className="h-5 w-5" />,
};

const VEHICLE_COLORS: Record<string, string> = {
  car: 'bg-blue-500',
  carro: 'bg-blue-500',
  motorcycle: 'bg-green-500',
  moto: 'bg-green-500',
  bicycle: 'bg-amber-500',
  bicicleta: 'bg-amber-500',
  truck: 'bg-purple-500',
  camion: 'bg-purple-500',
};

export function VehicleTypeChart({ data, isLoading }: VehicleTypeChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
          <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Distribución por Tipo de Vehículo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400">
            No hay datos disponibles
          </div>
        ) : (
          <div className="space-y-4">
            {/* Barra de distribución */}
            <div className="h-8 rounded-lg overflow-hidden flex">
              {data.map((item, index) => {
                const color =
                  VEHICLE_COLORS[item.vehicle_type.toLowerCase()] || 'bg-gray-500';
                return (
                  <div
                    key={index}
                    className={`${color} transition-all duration-300`}
                    style={{ width: `${item.percentage}%` }}
                    title={`${item.vehicle_type}: ${item.percentage}%`}
                  />
                );
              })}
            </div>

            {/* Lista detallada */}
            <div className="space-y-3">
              {data.map((item, index) => {
                const icon =
                  VEHICLE_ICONS[item.vehicle_type.toLowerCase()] || <Car className="h-5 w-5" />;
                const color =
                  VEHICLE_COLORS[item.vehicle_type.toLowerCase()] || 'bg-gray-500';

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${color} bg-opacity-20 dark:bg-opacity-30 text-gray-700 dark:text-gray-300`}
                      >
                        {icon}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white capitalize">
                          {item.vehicle_type}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.count} vehículos
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(item.revenue)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.percentage}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default VehicleTypeChart;
