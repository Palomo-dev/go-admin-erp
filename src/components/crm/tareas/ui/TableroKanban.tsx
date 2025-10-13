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
    <div className="mt-4 w-full">
      {/* Contenedor con scroll horizontal en móvil y grid en desktop */}
      <div className="
        flex lg:grid lg:grid-cols-4 
        gap-3 sm:gap-4 
        min-h-[70vh] 
        overflow-x-auto lg:overflow-x-visible 
        pb-4 px-1
      ">
        {Object.entries(columnas).map(([estado, titulo]) => {
          const estadoUI = estado as TaskStatusUI;
          const esDestinoDrop = draggedOver === estado;
          
          return (
            <Card 
              key={estadoUI} 
              className={cn(
                'rounded-xl transition-all duration-300 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                // Mobile: ancho fijo con scroll horizontal
                'min-w-[280px] w-[280px] sm:min-w-[320px] sm:w-[320px] flex-shrink-0',
                // Desktop: grid columnas iguales
                'lg:min-w-0 lg:w-auto',
                // Estado de drag
                esDestinoDrop ? 'ring-2 ring-blue-500 dark:ring-blue-400 shadow-lg' : 'shadow-sm'
              )}
              onDragOver={(e) => handleDragOver(e, estado)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, estadoUI)}
            >
              {/* Header sticky con mejor spacing */}
              <CardHeader className="
                flex flex-col space-y-1.5 
                p-3 sm:p-4 
                bg-gradient-to-r from-gray-50/90 to-gray-100/90 
                dark:from-gray-900/90 dark:to-gray-800/90 
                sticky top-0 z-10 
                border-b border-gray-200 dark:border-gray-700
                backdrop-blur-sm
              ">
                <CardTitle className="flex items-center justify-between text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                  <div className="flex items-center gap-2">
                    {estadoUI === 'pendiente' && <Clock className="h-4 w-4 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />}
                    {estadoUI === 'en_progreso' && <MoveHorizontal className="h-4 w-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />}
                    {estadoUI === 'completada' && <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 flex-shrink-0" />}
                    {estadoUI === 'cancelada' && <XCircle className="h-4 w-4 text-red-500 dark:text-red-400 flex-shrink-0" />}
                    <span className="whitespace-nowrap">{titulo}</span>
                  </div>
                  {(tareas[estadoUI]?.length ?? 0) > 0 && (
                    <Badge variant="secondary" className="text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-0.5">
                      {tareas[estadoUI]?.length ?? 0}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>

              {/* Content área con altura consistente */}
              <CardContent className={cn(
                'p-3 sm:p-4 overflow-y-auto transition-all',
                'min-h-[400px] max-h-[calc(70vh-60px)]',
                esDestinoDrop ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
              )}>
                {/* Zona de drop cuando está vacía */}
                {esDestinoDrop && (!tareas[estadoUI] || tareas[estadoUI].length === 0) && (
                  <div className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-6 flex flex-col items-center justify-center min-h-[200px]">
                    <Plus className="h-12 w-12 text-blue-400 dark:text-blue-500 mb-2" />
                    <p className="text-blue-600 dark:text-blue-400 text-sm font-medium">Suelta aquí</p>
                  </div>
                )}
                
                {/* Lista de tareas */}
                {tareas[estadoUI] && tareas[estadoUI].length > 0 ? (
                  <div className="space-y-2">
                    {tareas[estadoUI].map((tarea: Task) => (
                      <div
                        key={tarea.id}
                        id={`tarea-${tarea.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, tarea.id)}
                        onDragEnd={(e) => handleDragEnd(e, tarea.id)}
                        className={cn(
                          "transition-all duration-200 cursor-move",
                          draggedItem === tarea.id ? "opacity-50 scale-95" : "opacity-100"
                        )}
                      >
                        <TareaCard
                          tarea={tarea}
                          onEdit={onTaskEdit}
                          onViewDetails={onViewDetails}
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  !esDestinoDrop && (
                    <div className="flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-500 py-12 min-h-[200px]">
                      <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-3 mb-3">
                        {estadoUI === 'pendiente' && <Clock className="h-8 w-8" />}
                        {estadoUI === 'en_progreso' && <MoveHorizontal className="h-8 w-8" />}
                        {estadoUI === 'completada' && <CheckCircle className="h-8 w-8" />}
                        {estadoUI === 'cancelada' && <XCircle className="h-8 w-8" />}
                      </div>
                      <p className="text-sm font-medium">No hay tareas</p>
                      <p className="text-xs mt-1">Arrastra tareas aquí</p>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default TableroKanban;
