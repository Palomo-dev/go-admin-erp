'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreVertical, Edit, Trash2, Users, DollarSign, MapPin, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SpaceType } from '@/lib/services/spaceTypesService';
import { formatCurrency } from '@/utils/Utils';

interface SpaceTypeCardProps {
  spaceType: SpaceType;
  onEdit: (spaceType: SpaceType) => void;
  onDelete: (spaceType: SpaceType) => void;
  onToggleActive: (spaceType: SpaceType, isActive: boolean) => void;
}

const getCategoryColor = (categoryCode: string) => {
  const colors: Record<string, string> = {
    room: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    suite: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    cabin: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    glamping: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    apartment: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    house: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    office: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    meeting_room: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    event_hall: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  };
  return colors[categoryCode] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
};

export function SpaceTypeCard({
  spaceType,
  onEdit,
  onDelete,
  onToggleActive,
}: SpaceTypeCardProps) {
  const categoryColor = getCategoryColor(spaceType.category_code);

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start gap-2 mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {spaceType.name}
                </h3>
                {!spaceType.is_active && (
                  <Badge variant="outline" className="text-xs">
                    Inactivo
                  </Badge>
                )}
              </div>
              {spaceType.short_name && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {spaceType.short_name}
                </p>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge className={categoryColor}>
                {spaceType.category?.display_name || spaceType.category_code}
              </Badge>
              
              {spaceType.spaces_count !== undefined && (
                <Badge variant="outline">
                  {spaceType.spaces_count} {spaceType.spaces_count === 1 ? 'espacio' : 'espacios'}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <DollarSign className="h-4 w-4" />
                <span className="font-medium">{formatCurrency(Number(spaceType.base_rate))}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Users className="h-4 w-4" />
                <span>{spaceType.capacity} {spaceType.capacity === 1 ? 'persona' : 'personas'}</span>
              </div>

              {spaceType.area_sqm && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <MapPin className="h-4 w-4" />
                  <span>{spaceType.area_sqm} m²</span>
                </div>
              )}
            </div>

            {/* Amenities */}
            {spaceType.amenities && Object.keys(spaceType.amenities).length > 0 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Amenidades:
                </p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(spaceType.amenities).map(([key, value]) => (
                    value && (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {key}
                      </Badge>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(spaceType)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onToggleActive(spaceType, !spaceType.is_active)}
            >
              {spaceType.is_active ? (
                <>
                  <ToggleLeft className="h-4 w-4 mr-2" />
                  Desactivar
                </>
              ) : (
                <>
                  <ToggleRight className="h-4 w-4 mr-2" />
                  Activar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(spaceType)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
