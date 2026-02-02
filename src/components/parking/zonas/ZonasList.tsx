'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  MapPin,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Users,
  Umbrella,
  Star,
  Car,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ParkingZone } from './types';

interface ZonasListProps {
  zones: ParkingZone[];
  onEdit: (zone: ParkingZone) => void;
  onDuplicate: (zone: ParkingZone) => void;
  onDelete: (zone: ParkingZone) => void;
  onToggleActive: (zone: ParkingZone) => void;
  isLoading: boolean;
}

export function ZonasList({
  zones,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  isLoading,
}: ZonasListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <MapPin className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay zonas
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Agrega zonas de parqueo para organizar los espacios
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {zones.map((zone) => (
        <Card
          key={zone.id}
          className={`transition-all hover:shadow-md ${
            !zone.is_active ? 'opacity-60' : ''
          }`}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  zone.is_vip 
                    ? 'bg-yellow-100 dark:bg-yellow-900/30' 
                    : 'bg-blue-100 dark:bg-blue-900/30'
                }`}>
                  <MapPin className={`h-5 w-5 ${
                    zone.is_vip 
                      ? 'text-yellow-600 dark:text-yellow-400' 
                      : 'text-blue-600 dark:text-blue-400'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {zone.name}
                  </h3>
                  {zone.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                      {zone.description}
                    </p>
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(zone)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(zone)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete(zone)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <Users className="h-4 w-4" />
                  <span>Capacidad: {zone.capacity}</span>
                </div>
                {zone.spaces_count !== undefined && (
                  <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                    <Car className="h-4 w-4" />
                    <span>{zone.spaces_count} espacios</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {zone.is_vip && (
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <Star className="h-3 w-3 mr-1" />
                    VIP
                  </Badge>
                )}
                {zone.is_covered && (
                  <Badge className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
                    <Umbrella className="h-3 w-3 mr-1" />
                    Cubierta
                  </Badge>
                )}
                {zone.rate_multiplier !== 1 && (
                  <Badge variant="outline">
                    x{zone.rate_multiplier} tarifa
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {zone.is_active ? 'Activa' : 'Inactiva'}
                </span>
                <Switch
                  checked={zone.is_active}
                  onCheckedChange={() => onToggleActive(zone)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
