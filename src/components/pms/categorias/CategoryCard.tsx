'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  Bed,
  Home,
  Mountain,
  Tent,
  Building,
  Car,
  Warehouse,
} from 'lucide-react';
import type { SpaceCategory } from '@/lib/services/spaceCategoriesService';

interface CategoryCardProps {
  category: SpaceCategory;
  stats?: {
    total_types: number;
    total_spaces: number;
  };
  onEdit: () => void;
  onDelete: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  bed: <Bed className="h-5 w-5" />,
  home: <Home className="h-5 w-5" />,
  mountain: <Mountain className="h-5 w-5" />,
  tent: <Tent className="h-5 w-5" />,
  building: <Building className="h-5 w-5" />,
  car: <Car className="h-5 w-5" />,
  warehouse: <Warehouse className="h-5 w-5" />,
};

export function CategoryCard({ category, stats, onEdit, onDelete }: CategoryCardProps) {
  const icon = category.icon ? iconMap[category.icon] : <Building className="h-5 w-5" />;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow relative">
      {/* Menu de acciones */}
      <div className="absolute top-4 right-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onDelete}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Contenido */}
      <div className="flex items-start gap-4">
        {/* Icono */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
          {icon}
        </div>

        {/* Información */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {category.display_name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Código: <span className="font-mono">{category.code}</span>
          </p>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-3">
            {category.is_bookable ? (
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Reservable
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
                <XCircle className="h-3 w-3 mr-1" />
                No Reservable
              </Badge>
            )}

            {category.requires_checkin && (
              <Badge variant="outline">
                Check-in Requerido
              </Badge>
            )}

            {category.settings?.premium_service && (
              <Badge variant="default" className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                Premium
              </Badge>
            )}

            {category.settings?.eco_friendly && (
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Eco-Friendly
              </Badge>
            )}
          </div>

          {/* Estadísticas */}
          {stats && (
            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div>
                <span className="font-medium">{stats.total_types}</span> tipo{stats.total_types !== 1 ? 's' : ''}
              </div>
              <div>
                <span className="font-medium">{stats.total_spaces}</span> espacio{stats.total_spaces !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Configuraciones destacadas */}
          {category.settings && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {category.settings.max_nights && (
                <span className="mr-3">Máx: {category.settings.max_nights} noches</span>
              )}
              {category.settings.min_advance_hours && (
                <span>Anticipo: {category.settings.min_advance_hours}h</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
