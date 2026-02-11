'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, DollarSign, Maximize, Tag } from 'lucide-react';
import type { Space } from '@/lib/services/spacesService';
import { SpaceServicesBadges } from './SpaceServicesBadges';

interface SpaceBasicInfoProps {
  space: Space;
  servicesRefreshTrigger?: number;
}

export function SpaceBasicInfo({ space, servicesRefreshTrigger = 0 }: SpaceBasicInfoProps) {
  const amenities = space.space_types?.amenities || {};
  const amenitiesList = Object.entries(amenities).filter(([_, value]) => value);

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Información Básica
      </h2>

      {/* Descripción */}
      {space.description && (
        <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{space.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tipo */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Tipo</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {space.space_types?.name}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {space.space_types?.category?.display_name}
            </p>
          </div>
        </div>

        {/* Capacidad */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Capacidad</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {space.space_types?.capacity || 0} personas
            </p>
          </div>
        </div>

        {/* Tarifa Base */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Tarifa Base</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              ${space.space_types?.base_rate?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">por noche</p>
          </div>
        </div>

        {/* Área */}
        {space.space_types?.area_sqm && (
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Maximize className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Área</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {space.space_types.area_sqm} m²
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Amenities */}
      {amenitiesList.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Comodidades
          </h3>
          <div className="flex flex-wrap gap-2">
            {amenitiesList.map(([key]) => (
              <span
                key={key}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 rounded-full"
              >
                {key.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Servicios del espacio */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <SpaceServicesBadges spaceId={space.id} refreshTrigger={servicesRefreshTrigger} />
      </div>

      {/* Notas de Mantenimiento */}
      {space.maintenance_notes && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Notas de Mantenimiento
          </h3>
          <p className="text-sm text-orange-600 dark:text-orange-400">
            ⚠️ {space.maintenance_notes}
          </p>
        </div>
      )}
    </Card>
  );
}
