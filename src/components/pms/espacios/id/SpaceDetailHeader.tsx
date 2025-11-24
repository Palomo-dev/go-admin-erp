'use client';

import React from 'react';
import { ArrowLeft, Edit, Wrench, Sparkles, TrendingUp, Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Space } from '@/lib/services/spacesService';
import { useRouter } from 'next/navigation';

interface SpaceDetailHeaderProps {
  space: Space;
  onEdit: () => void;
  onMarkMaintenance: () => void;
  onAssignCleaning: () => void;
  onViewRevenue: () => void;
  onNewReservation: () => void;
  onAddConsumption: () => void;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'available':
      return {
        label: 'Disponible',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      };
    case 'occupied':
      return {
        label: 'Ocupado',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      };
    case 'reserved':
      return {
        label: 'Reservado',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 'maintenance':
      return {
        label: 'Mantenimiento',
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      };
    case 'cleaning':
      return {
        label: 'Limpieza',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 'out_of_order':
      return {
        label: 'Fuera de Servicio',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800',
      };
  }
};

export function SpaceDetailHeader({
  space,
  onEdit,
  onMarkMaintenance,
  onAssignCleaning,
  onViewRevenue,
  onNewReservation,
  onAddConsumption,
}: SpaceDetailHeaderProps) {
  const router = useRouter();
  const statusInfo = getStatusInfo(space.status);

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-6 py-4">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push('/app/pms/espacios')}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Espacios
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {space.label}
              </h1>
              <Badge className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
            </div>

            <p className="text-lg text-gray-600 dark:text-gray-400">
              {space.space_types?.name} • {space.space_types?.category?.display_name}
            </p>

            {space.floor_zone && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                📍 {space.floor_zone}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onNewReservation}
              disabled={space.status === 'occupied' || space.status === 'maintenance' || space.status === 'out_of_order'}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Reserva
            </Button>

            <Button variant="outline" size="sm" onClick={onViewRevenue}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Ingresos
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={onAddConsumption}
              disabled={space.status !== 'occupied' && space.status !== 'reserved'}
              className="text-green-600 dark:text-green-400"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Consumos
            </Button>

            <Button variant="outline" size="sm" onClick={onAssignCleaning}>
              <Sparkles className="h-4 w-4 mr-2" />
              Limpieza
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onMarkMaintenance}
              className={
                space.status === 'maintenance'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-orange-600 dark:text-orange-400'
              }
            >
              <Wrench className="h-4 w-4 mr-2" />
              {space.status === 'maintenance' ? 'Quitar Mantenimiento' : 'Mantenimiento'}
            </Button>

            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
