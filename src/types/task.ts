// Definición de tipos para el módulo de tareas del CRM

// Tipos de tareas soportados
export type TaskType = 'llamada' | 'reunion' | 'email' | 'visita' | null;

// Estados posibles de una tarea
export type TaskStatusUI = 'pendiente' | 'en_progreso' | 'completada' | 'cancelada';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'canceled'; // Valores aceptados por la BD

// Prioridad de una tarea
// En frontend usamos valores en español, pero en BD son: 'low', 'med', 'high'
export type TaskPriorityUI = 'baja' | 'media' | 'alta' | 'urgente';
export type TaskPriority = 'low' | 'med' | 'high';  // Valores aceptados por la BD

// Tipo relacionado (cliente, oportunidad, etc.)
// Incluimos tanto valores en español como en inglés para compatibilidad
export type RelatedType = 'cliente' | 'oportunidad' | 'proyecto' | 'otro' | 'customer' | 'opportunity' | 'project' | 'other';

// Interfaz para los datos del cliente obtenidos del JOIN
export interface TaskCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  identification_type: string | null;
  identification_number: string | null;
}

// Interfaz para la tarea según la tabla tasks de Supabase
export interface Task {
  id: string;
  organization_id: number;
  title: string;
  description: string;
  due_date: string; // ISO date string
  assigned_to: string | null; // UUID del usuario asignado o null
  assigned_to_name?: string | null; // Nombre del usuario asignado (calculado, no en BD)
  priority: TaskPriority; // 'low', 'med', 'high' en la BD
  status: TaskStatus; // 'open', 'done' en la BD
  related_type: RelatedType;
  // related_id: string | null; // Este campo no existe en la BD, se usa related_to_id en su lugar
  created_at: string;
  updated_at: string;
  created_by: string; // UUID del creador
  start_time: string | null; // ISO date string para hora de inicio
  related_to_id: string | null; // UUID adicional para relaciones
  related_to_type: string | null; // Tipo adicional para relaciones
  related_entity_name?: string | null; // Nombre de la entidad relacionada (calculado, no en BD)
  remind_before_minutes: number | null; // Minutos antes para recordatorio
  remind_email: boolean; // Enviar recordatorio por email
  remind_push: boolean; // Enviar recordatorio por push
  type: TaskType; // Tipo de tarea (puede ser null en la BD)
  completed_at: string | null; // ISO date string
  completed_by: string | null; // UUID del usuario que completó
  cancellation_reason: string | null; // Motivo de la cancelación
  customer_id: string | null; // ID del cliente (si aplica)
  customer?: TaskCustomer | null; // Datos del cliente obtenidos del JOIN
  parent_task_id: string | null; // ID de la tarea padre (para subtareas)
  
  // Campos calculados para jerarquía de subtareas (no están en BD)
  subtasks?: Task[]; // Array de subtareas
  subtask_count?: number; // Contador de subtareas
  completed_subtasks?: number; // Subtareas completadas
  is_parent?: boolean; // Indica si tiene subtareas
  depth?: number; // Nivel de anidación (0 = tarea padre)
  progress?: number; // Progreso de subtareas (0-100)
}

// Interfaz para filtros de tareas
export interface TaskFilter {
  // Campos originales
  status?: TaskStatus | 'todas';
  type?: TaskType | 'todas';
  timeframe?: 'todos' | 'hoy' | 'semana' | 'mes' | 'todas';
  assigned_to?: string | 'todos';
  priority?: string | 'todas';
  
  // Campos adicionales para FiltrosTareas (UI)
  texto?: string;                               // Búsqueda en título/descripción
  estado?: TaskStatusUI | string;              // Estado en UI (pendiente, en_progreso, etc)
  tipo?: TaskType | string;                    // Tipo de tarea
  prioridad?: TaskPriorityUI | string;         // Prioridad en UI
  fecha?: string;                              // Fecha límite (ISO string)
  asignado?: string;                           // Usuario asignado
  organization_id?: number;                    // ID de la organización
  
  // Campos para filtros de subtareas
  parent_task_id?: string | null;             // Filtrar por tarea padre específica
  include_subtasks?: boolean;                  // Incluir subtareas en los resultados
  only_parent_tasks?: boolean;                 // Solo mostrar tareas padre (sin subtareas)
  only_subtasks?: boolean;                     // Solo mostrar subtareas
}

// Interfaz para nueva tarea
export interface NewTask {
  organization_id: number;
  title: string;
  description: string;
  due_date: string;
  assigned_to: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  related_type: RelatedType;
  related_to_id: string | null; // Cambiado de related_id a related_to_id para mantener consistencia
  start_time: string | null;
  customer_id?: string | null;
  remind_before_minutes?: number | null;
  remind_email: boolean;
  remind_push: boolean;
  type: TaskType;
  parent_task_id?: string | null; // Para crear subtareas
}

// Interfaz para jerarquía de tareas
export interface TaskHierarchy {
  parent: Task;
  children: Task[];
  totalSubtasks: number;
  completedSubtasks: number;
  progress: number; // 0-100
  depth: number;
}

// Interfaz para estadísticas de subtareas
export interface SubtaskStats {
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  canceled: number;
  progress_percentage: number;
}

// Interfaz para operaciones de subtareas
export interface SubtaskOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  parentId: string;
  subtaskId?: string;
  data?: Partial<Task>;
}

// Tipo para vista de tareas (lista, jerarquía, kanban)
export type TaskViewMode = 'list' | 'hierarchy' | 'kanban';

// Interfaz para configuración de vista de subtareas
export interface SubtaskViewConfig {
  showProgress: boolean;
  showSubtaskCount: boolean;
  expandByDefault: boolean;
  maxDepth: number;
  sortBy: 'created_at' | 'due_date' | 'priority' | 'title';
  sortOrder: 'asc' | 'desc';
}
