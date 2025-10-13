'use client';

import { useState, useCallback } from 'react';
import { Task, TaskStatusUI, TaskStatus } from '@/types/task';
import { organizarTareasPorEstado } from './TareasUtils';
import { useToast } from '@/components/ui/use-toast';
import { changeTaskStatus } from '@/lib/services/taskService';

/**
 * Hook para gestionar el tablero Kanban de tareas
 * @returns Funciones y estados para la gestión del tablero
 */
export function useTareasTablero() {
  const [tareasTablero, setTareasTablero] = useState<{
    pendiente: Task[];
    en_progreso: Task[];
    completada: Task[];
    cancelada: Task[];
  }>({
    pendiente: [],
    en_progreso: [],
    completada: [],
    cancelada: []
  });
  
  const { toast } = useToast();
  
  /**
   * Actualiza el tablero con nuevas tareas
   * @param tareas Lista de tareas para organizar en el tablero
   */
  const actualizarTablero = useCallback((tareas: Task[]) => {
    const tareasOrganizadas = organizarTareasPorEstado(tareas);
    setTareasTablero(tareasOrganizadas);
  }, []);
  
  /**
   * Maneja el cambio de estado de una tarea en el tablero
   * @param tareaId ID de la tarea a cambiar
   * @param nuevoEstado Nuevo estado para la tarea
   * @param estadoAnterior Estado anterior de la tarea
   * @returns Promise que resuelve cuando se completa la operación
   */
  const manejarCambioEstado = useCallback(async (
    tareaId: string, 
    nuevoEstado: string, 
    estadoAnterior: TaskStatusUI
  ) => {
    try {

      
      // Convertir estado de UI a formato de base de datos
      const estadoDB = (() => {
        switch (nuevoEstado) {
          case 'pendiente': return 'open';
          case 'en_progreso': return 'in_progress';
          case 'completada': return 'done';
          case 'cancelada': return 'canceled';
          default: return 'open';
        }
      })();
      
      // Optimistic UI update
      setTareasTablero(prev => {
        // Crear copias para no mutar el estado directamente
        const resultado = {
          pendiente: [...prev.pendiente],
          en_progreso: [...prev.en_progreso],
          completada: [...prev.completada],
          cancelada: [...prev.cancelada]
        };
        
        // Mapear el nuevo estado a la clave correcta del objeto
        const estadoUI = (() => {
          switch (nuevoEstado) {
            case 'pendiente': return 'pendiente';
            case 'en_progreso': return 'en_progreso';
            case 'completada': return 'completada';
            case 'cancelada': return 'cancelada';
            default: return 'pendiente';
          }
        })() as TaskStatusUI;
        
        // Validar que el estado anterior y nuevo existen
        if (!resultado[estadoAnterior] || !resultado[estadoUI]) {
          console.error('Estados de tablero no válidos:', { estadoAnterior, estadoUI });
          return prev;
        }
        
        // Encontrar la tarea en el estado anterior
        const indexTarea = resultado[estadoAnterior].findIndex(t => t.id === tareaId);
        
        if (indexTarea >= 0) {
          // Extraer la tarea del estado anterior
          const tarea = resultado[estadoAnterior][indexTarea];
          resultado[estadoAnterior].splice(indexTarea, 1);
          
          // Actualizar estado de la tarea
          const tareaCopia = {...tarea, status: estadoDB as TaskStatus};
          
          // Añadir al nuevo estado
          resultado[estadoUI].push(tareaCopia);
        }
        
        return resultado;
      });
      
      // Llamar al API para actualizar el estado en la BD
      await changeTaskStatus(tareaId, estadoDB);
      
      toast({
        title: 'Estado actualizado',
        description: 'El estado de la tarea se cambió correctamente',
        duration: 2000
      });
      
    } catch (error: any) {
      console.error('Error al cambiar estado de la tarea:', error);
      
      // Revertir el cambio en la UI
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la tarea. Intente nuevamente.',
        variant: 'destructive'
      });
      
      // TODO: Implementar lógica para revertir el cambio en el estado
    }
  }, [toast]);
  
  /**
   * Maneja el arrastre (drag) dentro del tablero
   */
  const manejarDragStart = useCallback((e: React.DragEvent, tareaId: string, columna: TaskStatusUI) => {

    e.dataTransfer.setData('tareaId', tareaId);
    e.dataTransfer.setData('columnaOrigen', columna);
  }, []);
  
  /**
   * Maneja cuando una tarea es soltada en una columna del tablero
   */
  const manejarDrop = useCallback((e: React.DragEvent, columnaDestino: TaskStatusUI) => {
    e.preventDefault();
    const tareaId = e.dataTransfer.getData('tareaId');
    const columnaOrigen = e.dataTransfer.getData('columnaOrigen') as TaskStatusUI;
    
    // Si la tarea se suelta en la misma columna, no hacer nada
    if (columnaOrigen === columnaDestino) {
      return;
    }
    

    
    // Actualizar el estado en la BD y en el tablero local
    manejarCambioEstado(tareaId, columnaDestino, columnaOrigen);
  }, [manejarCambioEstado]);

  return {
    tareasTablero,
    actualizarTablero,
    manejarCambioEstado,
    manejarDragStart,
    manejarDrop
  };
}
