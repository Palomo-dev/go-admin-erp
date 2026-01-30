'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DoorOpen, MapPin, Users, Check, Loader2 } from 'lucide-react';

interface Space {
  id: string;
  label: string;
  floor_zone?: string;
  capacity?: number;
  isAvailable?: boolean;
  hasConflict?: boolean;
  space_types?: {
    name: string;
    base_rate?: number;
  };
}

interface StepSpacesProps {
  availableSpaces: Space[];
  selectedSpaces: string[];
  isLoading: boolean;
  nights: number;
  onSpaceToggle: (spaceId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepSpaces({
  availableSpaces,
  selectedSpaces,
  isLoading,
  nights,
  onSpaceToggle,
  onNext,
  onBack,
}: StepSpacesProps) {
  const isValid = selectedSpaces.length > 0;

  const calculateTotal = (basePrice: number) => {
    return (basePrice * nights).toFixed(2);
  };

  // Agrupar espacios por zona
  const spacesByZone = availableSpaces.reduce((acc, space) => {
    const zone = space.floor_zone || 'Sin zona';
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(space);
    return acc;
  }, {} as Record<string, Space[]>);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Seleccionar Espacios
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Elige uno o más espacios disponibles para la reserva
        </p>
      </div>

      {/* Resumen de selección */}
      {selectedSpaces.length > 0 && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Espacios seleccionados
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {selectedSpaces.length}
              </p>
            </div>
            <Badge variant="default" className="text-lg px-4 py-2">
              {nights} noche{nights !== 1 ? 's' : ''}
            </Badge>
          </div>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Buscando espacios disponibles...</span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-4" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Espacios disponibles */}
      {!isLoading && availableSpaces.length > 0 && (
        <div className="space-y-6">
          {Object.entries(spacesByZone).map(([zone, spaces]) => (
            <div key={zone}>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-gray-500" />
                {zone}
                <Badge variant="secondary">{spaces.length}</Badge>
              </h3>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {spaces.map((space) => {
                  const isSelected = selectedSpaces.includes(space.id);
                  const isAvailable = space.isAvailable !== false; // Default true si no está definido
                  const basePrice = space.space_types?.base_rate || 0;
                  const total = calculateTotal(basePrice);

                  return (
                    <Card
                      key={space.id}
                      className={`p-4 transition-all ${
                        !isAvailable
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                          : isSelected
                          ? 'cursor-pointer border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                          : 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                      onClick={() => isAvailable && onSpaceToggle(space.id)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              !isAvailable
                                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                                : isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            <DoorOpen className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className={`font-semibold ${!isAvailable ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                              {space.label}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {space.space_types?.name}
                            </p>
                          </div>
                        </div>
                        {!isAvailable ? (
                          <Badge variant="secondary" className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            Ocupado
                          </Badge>
                        ) : isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        ) : null}
                      </div>

                      {space.capacity && (
                        <div className={`flex items-center gap-1 text-sm mb-2 ${!isAvailable ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}>
                          <Users className="h-4 w-4" />
                          <span>Capacidad: {space.capacity}</span>
                        </div>
                      )}

                      {basePrice > 0 && (
                        <div className="pt-2 border-t dark:border-gray-700">
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${!isAvailable ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}>
                              ${basePrice} × {nights} noche{nights !== 1 ? 's' : ''}
                            </span>
                            <span className={`text-lg font-bold ${!isAvailable ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                              ${total}
                            </span>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No hay espacios disponibles */}
      {!isLoading && availableSpaces.length === 0 && (
        <Card className="p-12 text-center">
          <DoorOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No hay espacios disponibles
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            No se encontraron espacios disponibles para las fechas seleccionadas.
            Intenta con otras fechas o tipo de alojamiento.
          </p>
        </Card>
      )}

      {/* Botones de navegación */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Continuar
        </Button>
      </div>
    </div>
  );
}
