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
  MapPin,
  User,
  DollarSign,
  Calendar,
  AlertTriangle,
  PlayCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { MaintenanceOrder } from '@/lib/services/maintenanceService';

interface OrderCardProps {
  order: MaintenanceOrder;
  onStatusChange: (orderId: string, status: string) => void;
  onEdit: (order: MaintenanceOrder) => void;
  onDelete: (orderId: string) => void;
  onViewPhotos?: (order: MaintenanceOrder) => void;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'reported':
      return {
        label: 'Reportada',
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      };
    case 'assigned':
      return {
        label: 'Asignada',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      };
    case 'in_progress':
      return {
        label: 'En Progreso',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 'on_hold':
      return {
        label: 'En Espera',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 'completed':
      return {
        label: 'Completada',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      };
    case 'cancelled':
      return {
        label: 'Cancelada',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      };
  }
};

const getPriorityInfo = (priority: string) => {
  switch (priority) {
    case 'high':
      return {
        label: 'Alta',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      };
    case 'med':
      return {
        label: 'Media',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 'low':
      return {
        label: 'Baja',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      };
    default:
      return {
        label: priority,
        color: 'bg-gray-100 text-gray-800',
      };
  }
};

export function OrderCard({ order, onStatusChange, onEdit, onDelete, onViewPhotos }: OrderCardProps) {
  const statusInfo = getStatusInfo(order.status);
  const priorityInfo = getPriorityInfo(order.priority);

  return (
    <Card className="p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={priorityInfo.color}>{priorityInfo.label}</Badge>
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-medium line-clamp-2">
            {order.description}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(order)}>
              Editar
            </DropdownMenuItem>
            {order.status === 'reported' && (
              <DropdownMenuItem onClick={() => onStatusChange(order.id, 'assigned')}>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Asignar
              </DropdownMenuItem>
            )}
            {(order.status === 'assigned' || order.status === 'on_hold') && (
              <DropdownMenuItem onClick={() => onStatusChange(order.id, 'in_progress')}>
                <PlayCircle className="h-4 w-4 mr-2" />
                Iniciar
              </DropdownMenuItem>
            )}
            {order.status === 'in_progress' && (
              <DropdownMenuItem onClick={() => onStatusChange(order.id, 'completed')}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Completar
              </DropdownMenuItem>
            )}
            {order.status !== 'cancelled' && order.status !== 'completed' && (
              <DropdownMenuItem onClick={() => onStatusChange(order.id, 'cancelled')}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancelar
              </DropdownMenuItem>
            )}
            {onViewPhotos && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onViewPhotos(order)}>
                  Ver Fotos
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(order.id)}
              className="text-red-600 dark:text-red-400"
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2 text-sm">
        {order.spaces && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>
              {order.spaces.name}
              {order.spaces.space_types && ` - ${order.spaces.space_types.name}`}
              {order.spaces.floor_zone && ` (${order.spaces.floor_zone})`}
            </span>
          </div>
        )}

        {order.assigned_user && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <User className="h-4 w-4 flex-shrink-0" />
            <span>Asignado a: {order.assigned_user.email}</span>
          </div>
        )}

        {order.cost_estimate && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <DollarSign className="h-4 w-4 flex-shrink-0" />
            <span>Costo estimado: ${order.cost_estimate.toLocaleString()}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <Calendar className="h-4 w-4 flex-shrink-0" />
          <span>
            Reportado: {format(new Date(order.created_at), 'dd MMM yyyy', { locale: es })}
          </span>
        </div>

        {order.resolved_at && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>
              Resuelto: {format(new Date(order.resolved_at), 'dd MMM yyyy', { locale: es })}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
