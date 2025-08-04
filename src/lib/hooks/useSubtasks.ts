'use client';

import { useState, useCallback } from 'react';
import { Task, NewTask } from '@/types/task';
import { 
  createSubtask, 
  getTasksWithSubtasks, 
  changeTaskStatus, 
  validateTaskDeletion,
  checkParentCompletion,
  getSubtaskStats
} from '@/lib/services/taskService';
import { useToast } from '@/components/ui/use-toast';

export const useSubtasks = () => {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [validating, setValidating] = useState(false);
  const { toast } = useToast();
  
  /**
   * Crea una nueva subtarea
   */
  const createNewSubtask = useCallback(async (
    parentId: string, 
    subtaskData: Omit<NewTask, 'parent_task_id'>
  ) => {
    try {
      setCreating(true);
      
      console.log('🔄 Creando subtarea para padre:', parentId);
      const newSubtask = await createSubtask(parentId, subtaskData);
      
      toast({
        title: "Subtarea creada",
        description: `La subtarea "${subtaskData.title}" ha sido creada exitosamente.`,
      });
      
      console.log('✅ Subtarea creada:', newSubtask.id);
      return newSubtask;
      
    } catch (error) {
      console.error('❌ Error al crear subtarea:', error);
      toast({
        title: "Error",
        description: "No se pudo crear la subtarea. Inténtalo de nuevo.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setCreating(false);
    }
  }, [toast]);
  
  /**
   * Obtiene tareas con sus subtareas
   */
  const loadTasksWithSubtasks = useCallback(async (filter = {}) => {
    try {
      setLoading(true);
      
      console.log('🔄 Cargando tareas con subtareas...');
      const tasks = await getTasksWithSubtasks(filter);
      
      console.log('✅ Tareas cargadas:', tasks.length);
      return tasks;
      
    } catch (error) {
      console.error('❌ Error al cargar tareas con subtareas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las tareas. Inténtalo de nuevo.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  /**
   * Verifica si una tarea padre debería completarse automáticamente
   */
  const checkParentAutoCompletion = useCallback(async (parentTask: Task) => {
    try {
      if (!parentTask.subtasks?.length) return { shouldComplete: false };
      
      console.log('🔄 Verificando completado automático para:', parentTask.title);
      const result = await checkParentCompletion(parentTask.id);
      
      if (result.shouldComplete) {
        console.log('💡 Sugerencia de completado automático:', result.message);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error al verificar completado automático:', error);
      return { shouldComplete: false };
    }
  }, []);
  
  /**
   * Valida si una tarea puede ser eliminada
   */
  const validateDeletion = useCallback(async (task: Task) => {
    try {
      setValidating(true);
      
      console.log('🔄 Validando eliminación de tarea:', task.title);
      const result = await validateTaskDeletion(task.id);
      
      if (!result.canDelete) {
        console.log('⚠️ Tarea no puede eliminarse:', result.message);
        toast({
          title: "No se puede eliminar",
          description: result.message,
          variant: "destructive",
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error al validar eliminación:', error);
      toast({
        title: "Error",
        description: "No se pudo validar la eliminación de la tarea.",
        variant: "destructive",
      });
      return { canDelete: false, message: 'Error al validar la tarea' };
    } finally {
      setValidating(false);
    }
  }, [toast]);
  
  /**
   * Actualiza el estado de una subtarea y verifica completado del padre
   */
  const updateSubtaskStatus = useCallback(async (
    subtaskId: string, 
    newStatus: string, 
    parentTask?: Task,
    cancellationReason?: string
  ) => {
    try {
      console.log('🔄 Actualizando estado de subtarea:', { subtaskId, newStatus });
      
      // Actualizar estado de la subtarea
      await changeTaskStatus(subtaskId, newStatus as any, cancellationReason);
      
      // Si hay tarea padre, verificar si debería completarse automáticamente
      if (parentTask && newStatus === 'done') {
        const completionCheck = await checkParentCompletion(parentTask.id);
        
        if (completionCheck.shouldComplete) {
          // Mostrar notificación para sugerir completar la tarea padre
          toast({
            title: "¿Completar tarea padre?",
            description: `${completionCheck.message} Puedes completarla manualmente desde el gestor de tareas.`,
          });
        }
      }
      
      console.log('✅ Estado de subtarea actualizado');
      
    } catch (error) {
      console.error('❌ Error al actualizar estado de subtarea:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado de la subtarea.",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);
  
  /**
   * Obtiene estadísticas de subtareas para una tarea padre
   */
  const getStats = useCallback(async (parentId: string) => {
    try {
      console.log('🔄 Obteniendo estadísticas de subtareas para:', parentId);
      const stats = await getSubtaskStats(parentId);
      
      if (stats) {
        console.log('✅ Estadísticas obtenidas:', stats);
      }
      
      return stats;
      
    } catch (error) {
      console.error('❌ Error al obtener estadísticas:', error);
      return null;
    }
  }, []);
  
  /**
   * Calcula el progreso de una tarea basado en sus subtareas
   */
  const calculateProgress = useCallback((task: Task) => {
    if (!task.subtasks?.length) return 0;
    
    const completed = task.subtasks.filter(subtask => subtask.status === 'done').length;
    const total = task.subtasks.length;
    
    return Math.round((completed / total) * 100);
  }, []);
  
  /**
   * Filtra tareas por jerarquía
   */
  const filterByHierarchy = useCallback((tasks: Task[], options: {
    onlyParents?: boolean;
    onlySubtasks?: boolean;
    parentId?: string;
  }) => {
    let filtered = [...tasks];
    
    if (options.onlyParents) {
      filtered = filtered.filter(task => !task.parent_task_id);
    }
    
    if (options.onlySubtasks) {
      filtered = filtered.filter(task => task.parent_task_id);
    }
    
    if (options.parentId) {
      filtered = filtered.filter(task => task.parent_task_id === options.parentId);
    }
    
    return filtered;
  }, []);
  
  /**
   * Ordena tareas por jerarquía (padres primero, luego subtareas)
   */
  const sortByHierarchy = useCallback((tasks: Task[]) => {
    const parents = tasks.filter(task => !task.parent_task_id);
    const subtasks = tasks.filter(task => task.parent_task_id);
    
    // Ordenar padres por fecha de creación
    parents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Para cada padre, agregar sus subtareas ordenadas
    const result: Task[] = [];
    
    parents.forEach(parent => {
      result.push(parent);
      
      const parentSubtasks = subtasks
        .filter(subtask => subtask.parent_task_id === parent.id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      result.push(...parentSubtasks);
    });
    
    // Agregar subtareas huérfanas (sin padre encontrado)
    const orphanSubtasks = subtasks.filter(subtask => 
      !parents.some(parent => parent.id === subtask.parent_task_id)
    );
    
    result.push(...orphanSubtasks);
    
    return result;
  }, []);
  
  return {
    // Estados
    loading,
    creating,
    validating,
    
    // Funciones principales
    createNewSubtask,
    loadTasksWithSubtasks,
    updateSubtaskStatus,
    
    // Validaciones
    validateDeletion,
    checkParentAutoCompletion,
    
    // Utilidades
    getStats,
    calculateProgress,
    filterByHierarchy,
    sortByHierarchy,
  };
};

export default useSubtasks;
