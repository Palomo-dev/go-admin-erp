'use client';

import React from 'react';
import { Task } from '@/types/task';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Phone, Users, Mail, MapPin, User, MoreVertical, PenSquare, XCircle, Eye 
} from 'lucide-react';
import { getColorByPrioridad, getColorByTipoTarea, traducirTipoTarea } from '../core/TareasUtils';

interface TareasTableRowProps {
  tarea: Task;
  onEditTask?: (tarea: Task) => void;
  onViewDetails: (tarea: Task) => void;
  onCancelTask: (tarea: Task) => void;
}

const TareasTableRow: React.FC<TareasTableRowProps> = ({
  tarea,
  onEditTask,
  onViewDetails,
  onCancelTask
}) => {
  const getIconoTipoTarea = (tipo: string | null) => {
    switch (tipo) {
      case 'llamada':
        return <Phone className="h-4 w-4" />;
      case 'reunion':
        return <Users className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'visita':
        return <MapPin className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'done':
        return <Badge variant="default" className="bg-green-500 text-white">Completada</Badge>;
      case 'canceled':
        return <Badge variant="destructive">Cancelada</Badge>;
      case 'in_progress':
        return <Badge variant="default" className="bg-blue-500 text-white">En Progreso</Badge>;
      default:
        return <Badge variant="outline">Pendiente</Badge>;
    }
  };

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return 'Sin fecha';
    try {
      return new Date(fecha).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Sin fecha';
    }
  };

  const getPrioridadBadge = (prioridad: string) => {
    const color = getColorByPrioridad(prioridad as any);
    const texto = prioridad === 'low' ? 'Baja' : 
                  prioridad === 'med' ? 'Media' : 
                  prioridad === 'high' ? 'Alta' : 'Media';
    
    return <Badge variant="outline" style={{ color }}>{texto}</Badge>;
  };

  return (
    <tr className="border-b hover:bg-muted/50">
      <td className="p-4">
        <div className="font-medium">{tarea.title}</div>
        <div className="text-sm text-muted-foreground">
          {tarea.description && tarea.description.length > 50 
            ? `${tarea.description.substring(0, 50)}...` 
            : tarea.description
          }
        </div>
      </td>
      
      <td className="p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          {getIconoTipoTarea(tarea.type)}
          <span className="text-sm" style={{ color: getColorByTipoTarea(tarea.type) }}>
            {traducirTipoTarea(tarea.type)}
          </span>
        </div>
      </td>
      
      <td className="p-4 text-center">
        {getPrioridadBadge(tarea.priority)}
      </td>
      
      <td className="p-4 text-center">
        {getEstadoBadge(tarea.status)}
      </td>
      
      <td className="p-4 text-center">
        <div className="text-sm">
          {formatearFecha(tarea.due_date)}
        </div>
      </td>
      
      <td className="p-4 text-center">
        <div className="flex items-center justify-center gap-1">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {tarea.assigned_to_name || (tarea.assigned_to ? 'Asignado' : 'No asignado')}
          </span>
        </div>
      </td>
      
      <td className="p-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onViewDetails(tarea)}>
              <Eye className="h-4 w-4 mr-2" />
              Ver detalles
            </DropdownMenuItem>
            {onEditTask && (
              <DropdownMenuItem onClick={() => onEditTask(tarea)}>
                <PenSquare className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onCancelTask(tarea)}
              className="text-red-600"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
};

export default TareasTableRow;
