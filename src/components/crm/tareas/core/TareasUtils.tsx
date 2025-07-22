'use client';

import { Task, TaskStatus, TaskStatusUI, TaskPriority, TaskPriorityUI, TaskType } from '@/types/task';

/**
 * Mapea un valor de estado de la UI a su equivalente en la base de datos
 * @param estado Estado en formato UI (pendiente, en_progreso, etc.)
 * @returns Estado en formato de base de datos (open, in_progress, etc.)
 */
export function mapStatusToDbValue(estado: TaskStatusUI): TaskStatus {
  switch (estado) {
    case 'pendiente':
      return 'open';
    case 'en_progreso':
      return 'in_progress';
    case 'completada':
      return 'done';
    case 'cancelada':
      return 'canceled';
    default:
      return 'open'; // Valor por defecto
  }
}

/**
 * Mapea un valor de estado de la base de datos a su equivalente en la UI
 * @param estado Estado en formato de base de datos (open, in_progress, etc.)
 * @returns Estado en formato UI (pendiente, en_progreso, etc.)
 */
export function mapStatusToUIValue(estado: TaskStatus): TaskStatusUI {
  switch (estado) {
    case 'open':
      return 'pendiente';
    case 'in_progress':
      return 'en_progreso';
    case 'done':
      return 'completada';
    case 'canceled':
      return 'cancelada';
    default:
      return 'pendiente'; // Valor por defecto
  }
}

/**
 * Mapea un valor de prioridad de la UI a su equivalente en la base de datos
 * @param prioridad Prioridad en formato UI (baja, media, etc.)
 * @returns Prioridad en formato de base de datos (low, med, etc.)
 */
export function mapPrioridadToBdValue(prioridad: TaskPriorityUI): TaskPriority {
  switch (prioridad) {
    case 'baja':
      return 'low';
    case 'media':
      return 'med';
    case 'alta':
      return 'high';
    case 'urgente':
      // La prioridad 'urgente' en UI se mapea a 'high' en BD ya que 'urgent' no es parte de TaskPriority
      return 'high';
    default:
      return 'med'; // Valor por defecto
  }
}

/**
 * Mapea un valor de prioridad de la base de datos a su equivalente en la UI
 * @param prioridad Prioridad en formato de base de datos (low, med, etc.)
 * @returns Prioridad en formato UI (baja, media, etc.)
 */
export function mapPrioridadToUIValue(prioridad: TaskPriority): TaskPriorityUI {
  switch (prioridad) {
    case 'low':
      return 'baja';
    case 'med':
      return 'media';
    case 'high':
      // Para 'high' podemos devolver 'alta' o 'urgente' según el contexto
      // Aquí elegimos 'alta' ya que es el valor directo correspondiente
      return 'alta';
    default:
      return 'media'; // Valor por defecto
  }
}

/**
 * Organiza las tareas por su estado para la vista de tablero
 * @param tareasData Lista de tareas a organizar
 * @returns Objeto con tareas organizadas por estado
 */
export function organizarTareasPorEstado(tareasData: Task[]) {
  // Objeto para almacenar tareas por columna
  const tareasOrganizadas: { [key in TaskStatusUI]: Task[] } = {
    pendiente: [],
    en_progreso: [],
    completada: [],
    cancelada: []
  };
  
  // Depurar llegada de datos

  
  // Distribuir tareas según su estado
  tareasData.forEach(tarea => {
    // Mapear estado de la DB a la UI
    let estadoUI: TaskStatusUI = mapStatusToUIValue(tarea.status as TaskStatus);
    
    // Caso especial para tareas canceladas (marcadas en título/descripción)
    if (
      tarea.status === 'done' && 
      (
        (tarea.title?.toLowerCase().includes('[cancelada]') || 
         tarea.description?.toLowerCase().includes('[cancelada]') || 
         tarea.title?.toLowerCase().includes('cancelada:') || 
         tarea.description?.toLowerCase().includes('cancelada:'))
      )
    ) {
      estadoUI = 'cancelada';
    }
    
    tareasOrganizadas[estadoUI].push(tarea);
  });
  

  
  return tareasOrganizadas;
}

/**
 * Obtiene el color CSS para una tarea según su prioridad
 * @param prioridad Prioridad de la tarea
 * @returns Clase CSS para el color
 */
export function getColorByPrioridad(prioridad?: TaskPriority | null): string {
  // Agregar log para diagnóstico

  
  switch (prioridad) {
    // Eliminamos 'urgent' ya que no es parte del tipo TaskPriority
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'med':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'low':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

/**
 * Obtiene el color CSS para un tipo de tarea
 * @param tipo Tipo de tarea
 * @returns Clase CSS para el color (unificado para todos los tipos)
 */
export function getColorByTipoTarea(tipo?: TaskType | null): string {
  // Agregar log para diagnóstico

  
  // Color unificado para todos los tipos de tareas - usando azul por su neutralidad y visibilidad
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  
  /* Versión anterior con colores diferentes por tipo:
  switch (tipo) {
    case 'llamada':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'reunion':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'email':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'visita':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
  */
}

/**
 * Traduce un tipo de tarea al formato de visualización
 * @param tipo Tipo de tarea en la base de datos
 * @returns Tipo de tarea formateado para visualización
 */
export function traducirTipoTarea(tipo?: TaskType | null): string {
  // Agregar log para depurar los valores recibidos

  
  switch (tipo) {
    // Valores reales utilizados en la aplicación
    case 'llamada':
      return 'Llamada';
    case 'reunion':
      return 'Reunión';
    case 'email':
      return 'Email';
    case 'visita':
      return 'Visita';
    // Ya no incluimos compatibilidad con valores en inglés porque no son parte de TaskType
    default:
      console.warn(`⚠️ Tipo de tarea no reconocido: [${tipo}]`);
      return tipo || 'Tarea';
  }
}

/**
 * Genera un resumen breve de una tarea para mostrar en UI
 * @param tarea La tarea a resumir
 * @returns String con el resumen de la tarea
 */
export function generarResumenTarea(tarea: Task): string {
  const tipoTarea = traducirTipoTarea(tarea.type as TaskType);
  const titulo = tarea.title || 'Sin título';
  const fechaStr = tarea.due_date ? new Date(tarea.due_date).toLocaleDateString('es-ES') : 'Sin fecha';
  
  return `${tipoTarea}: ${titulo} (${fechaStr})`;
}
