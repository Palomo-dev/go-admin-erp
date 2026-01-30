'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Building2, 
  Calendar, 
  Moon,
  DollarSign,
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, formatCurrency } from '@/utils/Utils';
import type { Group } from '@/lib/services/groupReservationsService';

interface GroupsListProps {
  groups: Group[];
  onView: (group: Group) => void;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
  isLoading?: boolean;
}

function GroupCard({ 
  group, 
  onView, 
  onEdit, 
  onDelete 
}: { 
  group: Group;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const isActive = !group.releaseDate || group.releaseDate >= today;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {group.name}
              </h3>
              <Badge 
                variant={isActive ? 'default' : 'secondary'}
                className={isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}
              >
                {isActive ? 'Activo' : 'Finalizado'}
              </Badge>
            </div>
            {group.company && (
              <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <Building2 className="h-3.5 w-3.5" />
                <span className="truncate">{group.company}</span>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>
                <Eye className="h-4 w-4 mr-2" />
                Ver detalles
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600 dark:text-red-400">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Users className="h-4 w-4" />
            <span>{group.reservationsCount} reserva(s)</span>
          </div>
          {group.roomNights && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Moon className="h-4 w-4" />
              <span>{group.roomNights} room nights</span>
            </div>
          )}
          {group.pickupDate && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              <span>Desde {formatDate(group.pickupDate)}</span>
            </div>
          )}
          {group.releaseDate && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              <span>Hasta {formatDate(group.releaseDate)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-white">
            <DollarSign className="h-4 w-4 text-green-600" />
            {formatCurrency(group.totalEstimated)}
          </div>
          <Button variant="ghost" size="sm" onClick={onView}>
            Ver más
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
            <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

export function GroupsList({ groups, onView, onEdit, onDelete, isLoading = false }: GroupsListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <GroupSkeleton />
        <GroupSkeleton />
        <GroupSkeleton />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
              <Users className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No hay grupos
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Crea un nuevo grupo para empezar a gestionar reservas grupales
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          onView={() => onView(group)}
          onEdit={() => onEdit(group)}
          onDelete={() => onDelete(group)}
        />
      ))}
    </div>
  );
}
