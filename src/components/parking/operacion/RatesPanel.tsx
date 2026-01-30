'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Car, Bike, Truck } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

export interface ParkingRate {
  id: string;
  vehicle_type: string;
  rate_name: string;
  unit: 'hour' | 'day' | 'fraction';
  price: number;
  grace_period_min: number;
}

interface RatesPanelProps {
  rates: ParkingRate[];
  isLoading?: boolean;
}

function getVehicleIcon(vehicleType: string) {
  switch (vehicleType.toLowerCase()) {
    case 'motorcycle':
    case 'moto':
      return Bike;
    case 'truck':
    case 'camion':
      return Truck;
    default:
      return Car;
  }
}

function getVehicleLabel(vehicleType: string): string {
  switch (vehicleType.toLowerCase()) {
    case 'car':
      return 'Carro';
    case 'motorcycle':
    case 'moto':
      return 'Moto';
    case 'truck':
    case 'camion':
      return 'Camión';
    case 'bicycle':
    case 'bicicleta':
      return 'Bicicleta';
    default:
      return vehicleType;
  }
}

function getUnitLabel(unit: string): string {
  switch (unit) {
    case 'hour':
      return '/hora';
    case 'day':
      return '/día';
    case 'fraction':
      return '/fracción';
    default:
      return '';
  }
}

export function RatesPanel({ rates, isLoading }: RatesPanelProps) {
  // Agrupar tarifas por tipo de vehículo
  const groupedRates = rates.reduce((acc, rate) => {
    if (!acc[rate.vehicle_type]) {
      acc[rate.vehicle_type] = [];
    }
    acc[rate.vehicle_type].push(rate);
    return acc;
  }, {} as Record<string, ParkingRate[]>);

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Tarifas Vigentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : rates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <DollarSign className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No hay tarifas configuradas</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedRates).map(([vehicleType, vehicleRates]) => {
              const Icon = getVehicleIcon(vehicleType);
              return (
                <div key={vehicleType} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {getVehicleLabel(vehicleType)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 pl-6">
                    {vehicleRates.map((rate) => (
                      <div 
                        key={rate.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
                      >
                        <div>
                          <span className="text-sm text-gray-900 dark:text-white">
                            {rate.rate_name}
                          </span>
                          {rate.grace_period_min > 0 && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {rate.grace_period_min}min gracia
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {formatCurrency(rate.price)}{getUnitLabel(rate.unit)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
