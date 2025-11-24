'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MoreVertical, Edit, Trash2, MapPin, Users, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import type { Space } from '@/lib/services/spacesService';

interface SpaceCardProps {
  space: Space;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onEdit: (space: Space) => void;
  onDelete: (space: Space) => void;
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

export function SpaceCard({ space, selected, onSelect, onEdit, onDelete }: SpaceCardProps) {
  const router = useRouter();
  const statusInfo = getStatusInfo(space.status);

  const handleCardClick = (e: React.MouseEvent) => {
    // No navegar si se clickea el checkbox o el menú
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="checkbox"]')) {
      return;
    }
    router.push(`/app/pms/espacios/${space.id}`);
  };

  return (
    <Card 
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(space.id, checked as boolean)}
          className="mt-1"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {space.label}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {space.space_types?.name || 'Sin tipo'}
              </p>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/app/pms/espacios/${space.id}`);
                }}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Detalle
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onEdit(space);
                }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(space);
                  }}
                  className="text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Info */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
              
              {space.space_types?.category?.display_name && (
                <Badge variant="outline">
                  {space.space_types.category.display_name}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              {space.floor_zone && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{space.floor_zone}</span>
                </div>
              )}
              
              {space.space_types?.capacity && (
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{space.space_types.capacity} personas</span>
                </div>
              )}
            </div>

            {space.maintenance_notes && space.maintenance_notes.trim() !== '' && (
              <p className="text-sm text-orange-600 dark:text-orange-400 italic">
                ⚠️ {space.maintenance_notes}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
