'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Car,
  Bike,
  Truck,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ParkingSpace, SpaceState } from './types';

interface EspaciosGridProps {
  spaces: ParkingSpace[];
  selectedSpaces: string[];
  onSelectSpace: (id: string, selected: boolean) => void;
  onEdit: (space: ParkingSpace) => void;
  onDuplicate: (space: ParkingSpace) => void;
  onDelete: (space: ParkingSpace) => void;
  isLoading: boolean;
  viewMode?: 'grid' | 'list';
}

const stateConfig: Record<SpaceState, { label: string; color: string; bg: string }> = {
  free: {
    label: 'Libre',
    color: 'text-green-700 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
  },
  occupied: {
    label: 'Ocupado',
    color: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700',
  },
  reserved: {
    label: 'Reservado',
    color: 'text-yellow-700 dark:text-yellow-400',
    bg: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700',
  },
  maintenance: {
    label: 'Mantenimiento',
    color: 'text-orange-700 dark:text-orange-400',
    bg: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
  },
  disabled: {
    label: 'Deshabilitado',
    color: 'text-gray-700 dark:text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700',
  },
};

const typeIcons: Record<string, React.ReactNode> = {
  car: <Car className="h-6 w-6" />,
  motorcycle: <Bike className="h-6 w-6" />,
  truck: <Truck className="h-6 w-6" />,
  bicycle: <Bike className="h-5 w-5" />,
};

const typeLabels: Record<string, string> = {
  car: 'Auto',
  motorcycle: 'Moto',
  truck: 'Camión',
  bicycle: 'Bici',
};

export function EspaciosGrid({
  spaces,
  selectedSpaces,
  onSelectSpace,
  onEdit,
  onDuplicate,
  onDelete,
  isLoading,
  viewMode = 'grid',
}: EspaciosGridProps) {
  if (isLoading) {
    if (viewMode === 'list') {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[...Array(12)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded mx-auto" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mx-auto" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (spaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <Car className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay espacios
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Agrega espacios de parqueo para comenzar
        </p>
      </div>
    );
  }

  // Vista de lista (tabla)
  if (viewMode === 'list') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedSpaces.length === spaces.length && spaces.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      spaces.forEach((s) => onSelectSpace(s.id, true));
                    } else {
                      spaces.forEach((s) => onSelectSpace(s.id, false));
                    }
                  }}
                />
              </TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spaces.map((space) => {
              const state = stateConfig[space.state] || stateConfig.free;
              const isSelected = selectedSpaces.includes(space.id);

              return (
                <TableRow 
                  key={space.id}
                  className={isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => onSelectSpace(space.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={state.color}>
                        {typeIcons[space.type] || <Car className="h-4 w-4" />}
                      </span>
                      <span className="font-medium">{space.label}</span>
                    </div>
                  </TableCell>
                  <TableCell>{typeLabels[space.type] || space.type}</TableCell>
                  <TableCell>
                    {space.parking_zones?.name ? (
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        {space.parking_zones.name}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${state.bg} ${state.color} border`}>
                      {state.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(space)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicate(space)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onDelete(space)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Vista de grid (tarjetas)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {spaces.map((space) => {
        const state = stateConfig[space.state] || stateConfig.free;
        const isSelected = selectedSpaces.includes(space.id);

        return (
          <Card
            key={space.id}
            className={`cursor-pointer transition-all hover:shadow-md ${state.bg} border-2 ${
              isSelected ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => onSelectSpace(space.id, !isSelected)}
          >
            <CardContent className="p-4 relative">
              <div className="absolute top-2 right-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(space); }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(space); }}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={(e) => { e.stopPropagation(); onDelete(space); }}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-col items-center text-center pt-2">
                <div className={`mb-2 ${state.color}`}>
                  {typeIcons[space.type] || <Car className="h-6 w-6" />}
                </div>
                <p className="font-bold text-lg text-gray-900 dark:text-white">
                  {space.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {typeLabels[space.type] || space.type}
                </p>
                {space.parking_zones?.name && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {space.parking_zones.name}
                  </p>
                )}
                <p className={`text-xs font-medium mt-1 ${state.color}`}>
                  {state.label}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
