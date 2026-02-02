'use client';

import React from 'react';
import { SpaceCard } from './SpaceCard';
import type { ParkingSpace, ParkingZone } from '@/lib/services/parkingMapService';

interface SpaceGridProps {
  spaces: ParkingSpace[];
  zones: ParkingZone[];
  selectedSpace: ParkingSpace | null;
  onSpaceClick: (space: ParkingSpace) => void;
  isLoading?: boolean;
  groupByZone?: boolean;
}

export function SpaceGrid({
  spaces,
  zones,
  selectedSpace,
  onSpaceClick,
  isLoading,
  groupByZone = true,
}: SpaceGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="h-[100px] rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (spaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No hay espacios configurados para esta sucursal.
        </p>
      </div>
    );
  }

  // Agrupar espacios por zona si está habilitado
  if (groupByZone && zones.length > 0) {
    const spacesByZone: Record<string, ParkingSpace[]> = {};
    const spacesWithoutZone: ParkingSpace[] = [];

    spaces.forEach((space) => {
      if (space.zone_id) {
        if (!spacesByZone[space.zone_id]) {
          spacesByZone[space.zone_id] = [];
        }
        spacesByZone[space.zone_id].push(space);
      } else {
        spacesWithoutZone.push(space);
      }
    });

    return (
      <div className="space-y-6">
        {zones.map((zone) => {
          const zoneSpaces = spacesByZone[zone.id] || [];
          if (zoneSpaces.length === 0) return null;

          return (
            <div key={zone.id}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {zone.name}
                </h3>
                {zone.is_vip && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                    VIP
                  </span>
                )}
                {zone.is_covered && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                    Cubierto
                  </span>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({zoneSpaces.length} espacios)
                </span>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                {zoneSpaces.map((space) => (
                  <SpaceCard
                    key={space.id}
                    space={space}
                    onClick={onSpaceClick}
                    isSelected={selectedSpace?.id === space.id}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Espacios sin zona */}
        {spacesWithoutZone.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              Sin Zona ({spacesWithoutZone.length} espacios)
            </h3>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {spacesWithoutZone.map((space) => (
                <SpaceCard
                  key={space.id}
                  space={space}
                  onClick={onSpaceClick}
                  isSelected={selectedSpace?.id === space.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Vista sin agrupar
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
      {spaces.map((space) => (
        <SpaceCard
          key={space.id}
          space={space}
          onClick={onSpaceClick}
          isSelected={selectedSpace?.id === space.id}
        />
      ))}
    </div>
  );
}

export default SpaceGrid;
