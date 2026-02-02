'use client';

import React from 'react';
import { Car, Bike, Accessibility, Crown, Clock, Wrench } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { ParkingSpace, SpaceState, SpaceType } from '@/lib/services/parkingMapService';

interface SpaceCardProps {
  space: ParkingSpace;
  onClick: (space: ParkingSpace) => void;
  isSelected?: boolean;
}

const STATE_COLORS: Record<SpaceState, string> = {
  free: 'bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-600 hover:bg-green-200 dark:hover:bg-green-900/60',
  occupied: 'bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600 hover:bg-red-200 dark:hover:bg-red-900/60',
  reserved: 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 hover:bg-amber-200 dark:hover:bg-amber-900/60',
  maintenance: 'bg-purple-100 dark:bg-purple-900/40 border-purple-400 dark:border-purple-600 hover:bg-purple-200 dark:hover:bg-purple-900/60',
};

const STATE_TEXT_COLORS: Record<SpaceState, string> = {
  free: 'text-green-700 dark:text-green-400',
  occupied: 'text-red-700 dark:text-red-400',
  reserved: 'text-amber-700 dark:text-amber-400',
  maintenance: 'text-purple-700 dark:text-purple-400',
};

const TYPE_ICONS: Record<SpaceType, React.ReactNode> = {
  car: <Car className="h-6 w-6" />,
  motorcycle: <Bike className="h-6 w-6" />,
  bicycle: <Bike className="h-5 w-5" />,
  disabled: <Accessibility className="h-6 w-6" />,
  vip: <Crown className="h-6 w-6" />,
};

const STATE_ICONS: Record<SpaceState, React.ReactNode> = {
  free: null,
  occupied: <Car className="h-4 w-4" />,
  reserved: <Clock className="h-4 w-4" />,
  maintenance: <Wrench className="h-4 w-4" />,
};

export function SpaceCard({ space, onClick, isSelected }: SpaceCardProps) {
  const stateColor = STATE_COLORS[space.state];
  const textColor = STATE_TEXT_COLORS[space.state];
  const typeIcon = TYPE_ICONS[space.type] || TYPE_ICONS.car;
  const stateIcon = STATE_ICONS[space.state];

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <button
      onClick={() => onClick(space)}
      className={cn(
        'relative p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer min-h-[100px] flex flex-col items-center justify-center gap-1',
        stateColor,
        isSelected && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900'
      )}
    >
      {/* Indicador de zona especial */}
      {(space.parking_zone?.is_vip || space.parking_zone?.is_covered) && (
        <div className="absolute top-1 right-1">
          {space.parking_zone.is_vip && (
            <Crown className="h-3 w-3 text-amber-500" />
          )}
        </div>
      )}

      {/* Icono de tipo */}
      <div className={textColor}>{typeIcon}</div>

      {/* Label del espacio */}
      <span className={cn('font-bold text-sm', textColor)}>{space.label}</span>

      {/* Info de sesión activa */}
      {space.state === 'occupied' && space.active_session && (
        <div className="text-[10px] text-center space-y-0.5">
          <p className="font-mono font-semibold text-gray-800 dark:text-gray-200">
            {space.active_session.vehicle_plate}
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            {formatTime(space.active_session.entry_at)}
          </p>
        </div>
      )}

      {/* Estado icono */}
      {stateIcon && (
        <div className={cn('absolute bottom-1 left-1', textColor)}>
          {stateIcon}
        </div>
      )}

      {/* Zona */}
      {space.zone && (
        <span className="absolute bottom-1 right-1 text-[8px] text-gray-500 dark:text-gray-400">
          {space.zone}
        </span>
      )}
    </button>
  );
}

export default SpaceCard;
