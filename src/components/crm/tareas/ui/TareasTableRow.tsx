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
        return <Phone className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      case 'reunion':
        return <Users className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      case 'email':
        return <Mail className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      case 'visita':
        return <MapPin className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
      default:
        return <Phone className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'done':
        return <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 text-xs">Completada</Badge>;
      case 'canceled':
        return <Badge variant="outline" className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 text-xs">Cancelada</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 text-xs">En Progreso</Badge>;
      default:
        return <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 text-xs">Pendiente</Badge>;
    }
  };

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return <span className="text-gray-500 dark:text-gray-400">Sin fecha</span>;
    try {
      return new Date(fecha).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return <span className="text-gray-500 dark:text-gray-400">Sin fecha</span>;
    }
  };

  const getPrioridadBadge = (prioridad: string) => {
    const texto = prioridad === 'low' ? 'Baja' : 
                  prioridad === 'med' ? 'Media' : 
                  prioridad === 'high' ? 'Alta' : 'Media';
    
    // Colores adaptativos según prioridad y tema
    const colorClasses = {
      low: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
      med: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
      high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700'
    };
    
    const colorClass = colorClasses[prioridad as keyof typeof colorClasses] || colorClasses.med;
    
    return <Badge variant="outline" className={`text-xs ${colorClass}`}>{texto}</Badge>;
  };

  return (
    <tr className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
      <td className="p-2 sm:p-3 md:p-4">
        <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">{tarea.title}</div>
        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          {tarea.description && tarea.description.length > 50 
            ? `${tarea.description.substring(0, 50)}...` 
            : tarea.description
          }
        </div>
      </td>
      
      <td className="p-2 sm:p-3 md:p-4 text-center">
        <div className="flex items-center justify-center gap-1 sm:gap-2">
          {getIconoTipoTarea(tarea.type)}
          <span className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
            {traducirTipoTarea(tarea.type)}
          </span>
        </div>
      </td>
      
      <td className="p-2 sm:p-3 md:p-4 text-center">
        {getPrioridadBadge(tarea.priority)}
      </td>
      
      <td className="p-2 sm:p-3 md:p-4 text-center">
        {getEstadoBadge(tarea.status)}
      </td>
      
      <td className="p-2 sm:p-3 md:p-4 text-center">
        <div className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
          {formatearFecha(tarea.due_date)}
        </div>
      </td>
      
      <td className="p-2 sm:p-3 md:p-4 text-center">
        <div className="flex items-center justify-center gap-1">
          <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
            {tarea.assigned_to_name || (tarea.assigned_to ? 'Asignado' : 'No asignado')}
          </span>
        </div>
      </td>
      
      <td className="p-2 sm:p-3 md:p-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <DropdownMenuLabel className="text-gray-900 dark:text-gray-100">Acciones</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onViewDetails(tarea)} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              <Eye className="h-4 w-4 mr-2" />
              Ver detalles
            </DropdownMenuItem>
            {onEditTask && (
              <DropdownMenuItem onClick={() => onEditTask(tarea)} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <PenSquare className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
            <DropdownMenuItem 
              onClick={() => onCancelTask(tarea)}
              className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
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
