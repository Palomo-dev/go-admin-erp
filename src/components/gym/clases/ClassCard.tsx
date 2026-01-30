'use client';

import { Card, CardContent } from '@/components/ui/card';
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
  Copy, 
  Trash2, 
  XCircle, 
  Users, 
  Clock, 
  MapPin,
  Calendar
} from 'lucide-react';
import { GymClass, getClassTypeLabel, getClassStatusColor, getClassStatusLabel } from '@/lib/services/gymService';
import { formatDate } from '@/utils/Utils';

interface ClassCardProps {
  gymClass: GymClass;
  onEdit: (gymClass: GymClass) => void;
  onDuplicate: (gymClass: GymClass) => void;
  onCancel: (gymClass: GymClass) => void;
  onDelete: (gymClass: GymClass) => void;
  onViewReservations: (gymClass: GymClass) => void;
}

export function ClassCard({
  gymClass,
  onEdit,
  onDuplicate,
  onCancel,
  onDelete,
  onViewReservations,
}: ClassCardProps) {
  const startTime = new Date(gymClass.start_at);
  const endTime = new Date(gymClass.end_at);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {gymClass.title}
              </h3>
              <Badge className={getClassStatusColor(gymClass.status)}>
                {getClassStatusLabel(gymClass.status)}
              </Badge>
            </div>
            <Badge variant="outline" className="text-xs">
              {getClassTypeLabel(gymClass.class_type)}
            </Badge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(gymClass)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(gymClass)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewReservations(gymClass)}>
                <Users className="h-4 w-4 mr-2" />
                Ver Reservaciones
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {gymClass.status === 'scheduled' && (
                <DropdownMenuItem 
                  onClick={() => onCancel(gymClass)}
                  className="text-orange-600 dark:text-orange-400"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar Clase
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => onDelete(gymClass)}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {gymClass.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            {gymClass.description}
          </p>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(gymClass.start_at)}</span>
          </div>

          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            <span>{formatTime(startTime)} - {formatTime(endTime)}</span>
            <span className="text-gray-400">({gymClass.duration_minutes || 60} min)</span>
          </div>

          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Users className="h-4 w-4" />
            <span>Capacidad: {gymClass.capacity} personas</span>
          </div>

          {(gymClass.room || gymClass.location) && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4" />
              <span>{gymClass.room || gymClass.location}</span>
            </div>
          )}

          {gymClass.branches && (
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              Sede: {gymClass.branches.name}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
