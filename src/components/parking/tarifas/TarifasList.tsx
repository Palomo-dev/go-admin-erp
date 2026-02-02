'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Car,
  Bike,
  Truck,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Clock,
  Calendar,
  Timer,
  DollarSign,
} from 'lucide-react';
import { ParkingRate, VehicleType, RateUnit } from './types';

interface TarifasListProps {
  rates: ParkingRate[];
  onEdit: (rate: ParkingRate) => void;
  onDuplicate: (rate: ParkingRate) => void;
  onDelete: (rate: ParkingRate) => void;
  onToggleActive: (rate: ParkingRate) => void;
  isLoading: boolean;
}

const vehicleIcons: Record<VehicleType, React.ReactNode> = {
  car: <Car className="h-6 w-6" />,
  motorcycle: <Bike className="h-6 w-6" />,
  truck: <Truck className="h-6 w-6" />,
  bicycle: <Bike className="h-5 w-5" />,
};

const vehicleLabels: Record<VehicleType, string> = {
  car: 'Automóvil',
  motorcycle: 'Motocicleta',
  truck: 'Camión',
  bicycle: 'Bicicleta',
};

const unitIcons: Record<RateUnit, React.ReactNode> = {
  minute: <Timer className="h-4 w-4" />,
  hour: <Clock className="h-4 w-4" />,
  day: <Calendar className="h-4 w-4" />,
};

const unitLabels: Record<RateUnit, string> = {
  minute: 'Por Minuto',
  hour: 'Por Hora',
  day: 'Por Día',
};

export function TarifasList({
  rates,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  isLoading,
}: TarifasListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay tarifas configuradas
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Crea tu primera tarifa para comenzar
        </p>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rates.map((rate) => {
        const isActive = rate.is_active !== false;

        return (
          <Card
            key={rate.id}
            className={`transition-all hover:shadow-md ${
              !isActive ? 'opacity-60' : ''
            }`}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                    {vehicleIcons[rate.vehicle_type] || <Car className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {rate.rate_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {vehicleLabels[rate.vehicle_type] || rate.vehicle_type}
                    </p>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(rate)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(rate)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(rate)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    {unitIcons[rate.unit]}
                    <span className="text-sm">{unitLabels[rate.unit]}</span>
                  </div>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatPrice(rate.price)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    Periodo de gracia
                  </span>
                  <Badge variant="outline">
                    {rate.grace_period_min || 0} min
                  </Badge>
                </div>

                {rate.lost_ticket_fee !== undefined && rate.lost_ticket_fee > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Ticket perdido
                    </span>
                    <Badge variant="secondary">
                      {formatPrice(rate.lost_ticket_fee)}
                    </Badge>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {isActive ? 'Activa' : 'Inactiva'}
                  </span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => onToggleActive(rate)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
