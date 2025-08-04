'use client';

import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, TaskStatusUI } from '@/types/task';
import TareaCard from './TareaCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { changeTaskStatus } from '@/lib/services/taskService';
import { toast } from '@/components/ui/use-toast';
import { MoveHorizontal, Plus, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Función auxiliar para combinar clases
const cn = (...classes: (string | undefined | boolean)[]) => {
  return classes.filter(Boolean).join(' ');
};

interface TableroKanbanProps {
  tareas: {
    pendiente: Task[];
    en_progreso: Task[];
    completada: Task[];
    cancelada: Task[];
  };
  onStatusChange: (tareaId: string, nuevoEstado: TaskStatusUI, estadoAnterior: TaskStatusUI) => void;
  onTaskEdit?: (tarea: Task) => void;
  onViewDetails?: (tarea: Task) => void;
}

// Tipo para las columnas UI del Kanban
type TareasColumnasUI = {
  [key in TaskStatusUI]: Task[];
};

// Nombres legibles de las columnas
const columnas: Record<TaskStatusUI, string> = {
  pendiente: 'Pendientes',
  en_progreso: 'En Progreso',
  completada: 'Completadas',
  cancelada: 'Canceladas'
};

const TableroKanban: React.FC<TableroKanbanProps> = ({
  tareas,
  onStatusChange,
  onTaskEdit,
  onViewDetails
}) => {
  const [draggedOver, setDraggedOver] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  // Usar directamente las tareas del props sin estado local
  // Esto permite que la actualización optimista del componente padre funcione correctamente

  // Función para manejar el inicio del arrastre
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    setDraggedItem(taskId);
    
    // Efecto visual para el elemento arrastrado
    const element = document.getElementById(`tarea-${taskId}`);
    if (element) {
      setTimeout(() => {
        element.style.opacity = '0.6';
      }, 0);
    }
  };
  
  // Función para manejar el fin del arrastre
  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedItem(null);
    setDraggedOver(null);
    
    // Restaurar opacidad del elemento
    const element = document.getElementById(`tarea-${taskId}`);
    if (element) {
      setTimeout(() => {
        element.style.opacity = '1';
      }, 0);
    }
  };

  // Función para manejar cuando un elemento está sobre una columna
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    e.preventDefault();
    setDraggedOver(columnId);
  };
  
  // Función para manejar cuando un elemento sale de una columna
  const handleDragLeave = () => {
    setDraggedOver(null);
  };

  // Función para mapear estado en español a valores aceptados por la BD
  const mapStatusToDbValue = (status: TaskStatusUI): TaskStatus => {
    switch(status) {
      case 'pendiente': return 'open';
      case 'en_progreso': return 'in_progress';
      case 'completada': return 'done';
      case 'cancelada': return 'canceled';
      default: return 'open'; // Valor por defecto
    }
  };

  // Función para manejar el drop de una tarea en una columna
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStatusUI: TaskStatusUI) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    setDraggedOver(null);
    setDraggedItem(null);
    
    // Buscar la tarea que se está moviendo en las tareas del props
    let tareaMovida: Task | undefined = undefined;
    let estadoAnterior: TaskStatusUI | undefined = undefined;
    
    // Buscar en todas las columnas de tareas para encontrar la tarea y su estado actual
    Object.entries(tareas).forEach(([estado, tareasCol]) => {
      const tarea = tareasCol.find((t: Task) => t.id === taskId);
      if (tarea) {
        tareaMovida = tarea;
        estadoAnterior = estado as TaskStatusUI;
      }
    });
    
    if (!tareaMovida || !estadoAnterior) {
      console.warn('No se encontró la tarea a mover o su estado anterior:', { taskId, tareaMovida, estadoAnterior });
      return;
    }
    
    // Si la tarea ya está en el estado destino, no hacer nada
    if (estadoAnterior === targetStatusUI) {
      console.log('La tarea ya está en el estado destino:', targetStatusUI);
      return;
    }
    
    try {
      // Mapear del estado UI al valor de BD antes de enviarlo
      const targetStatusDB = mapStatusToDbValue(targetStatusUI);
      
      console.log(`Moviendo tarea ${taskId} de ${estadoAnterior} a ${targetStatusUI} (BD: ${targetStatusDB})`);
      
      // Llamar a la función para cambiar el estado en la base de datos
      // Pasar los 3 parámetros requeridos: tareaId, nuevoEstado, estadoAnterior
      await onStatusChange(taskId, targetStatusUI, estadoAnterior);
      
    } catch (error) {
      console.error('Error al cambiar estado durante el drag & drop:', error);
      // El manejo de errores se centraliza en TareasContent
    }
  };

  // Mapeo de columnas con sus títulos e iconos
  const columnas: Record<TaskStatusUI, string> = {
    pendiente: 'Pendientes',
    en_progreso: 'En Progreso',
    completada: 'Completadas',
    cancelada: 'Canceladas'
  };
  
  // Iconos para cada columna
  const iconosColumna: Record<TaskStatusUI, React.ReactNode> = {
    pendiente: <Clock className="h-5 w-5 mr-2 text-yellow-500" />,
    en_progreso: <MoveHorizontal className="h-5 w-5 mr-2 text-blue-500" />,
    completada: <CheckCircle className="h-5 w-5 mr-2 text-green-500" />,
    cancelada: <XCircle className="h-5 w-5 mr-2 text-slate-500" />
  };
  
  // Se eliminaron los colores de borde para las columnas



  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-4 min-h-[70vh] w-full overflow-x-auto px-2">
      {Object.entries(columnas).map(([estado, titulo]) => {
        const estadoUI = estado as TaskStatusUI;
        const esDestinoDrop = draggedOver === estado;
        
        return (
          <Card 
            key={estadoUI} 
            className={cn(
              'rounded-xl h-full transition-all duration-300 min-w-[250px] w-full',
              esDestinoDrop ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
            )}
            onDragOver={(e) => handleDragOver(e, estado)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, estadoUI)}
          >
            <CardHeader className="flex flex-col space-y-1.5 p-4 py-3 bg-slate-50/70 dark:bg-slate-900/70 sticky top-0 z-10">
              <CardTitle className="tracking-tight flex items-center text-lg font-medium">
                {estadoUI === 'pendiente' && <Clock className="h-5 w-5 mr-2 text-yellow-500" />}
                {estadoUI === 'en_progreso' && <MoveHorizontal className="h-5 w-5 mr-2 text-blue-500" />}
                {estadoUI === 'completada' && <CheckCircle className="h-5 w-5 mr-2 text-green-500" />}
                {estadoUI === 'cancelada' && <XCircle className="h-5 w-5 mr-2 text-red-500" />}
                <div className="whitespace-nowrap">
                  {titulo}
                  {(tareas[estadoUI]?.length ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {tareas[estadoUI]?.length ?? 0}
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className={cn(
              'p-4 overflow-y-auto max-h-[68vh] transition-all',
              esDestinoDrop ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
            )}>
              {esDestinoDrop && (!tareas[estadoUI] || tareas[estadoUI].length === 0) && (
                <div className="border-2 border-dashed border-blue-300 dark:border-blue-800 rounded-md p-6 flex flex-col items-center justify-center mb-2">
                  <Plus className="h-12 w-12 text-blue-400 dark:text-blue-600 mb-2" />
                  <p className="text-blue-500 dark:text-blue-400 text-sm font-medium">Suelta aquí</p>
                </div>
              )}
              
              {tareas[estadoUI] && tareas[estadoUI].length > 0 ? (
                tareas[estadoUI].map((tarea: Task) => (
                  <div
                    key={tarea.id}
                    id={`tarea-${tarea.id}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, tarea.id)}
                    onDragEnd={(e) => handleDragEnd(e, tarea.id)}
                    className={cn(
                      "mb-2 transition-all duration-200",
                      draggedItem === tarea.id ? "opacity-50" : "opacity-100"
                    )}
                  >
                    <TareaCard
                      tarea={tarea}
                      onEdit={onTaskEdit}
                      onViewDetails={onViewDetails}
                      draggable={false}
                    />
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm">No hay tareas</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default TableroKanban;
