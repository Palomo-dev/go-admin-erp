'use client';

import React, { useState } from 'react';
import { Task } from '@/types/task';
import { ChevronDown, ChevronRight, Plus, Users, Calendar, AlertCircle, MoreVertical, Edit, Check, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Componente Progress simple para reemplazar el que no existe
const SimpleProgress: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div 
      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

interface TaskHierarchyListProps {
  tasks: Task[];
  onCreateSubtask: (parentId: string) => void;
  onTaskUpdate: (task: Task) => void;
  onTaskClick?: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onCompleteTask?: (task: Task) => void;
  onCancelTask?: (task: Task) => void;
  expandByDefault?: boolean;
}

const TaskHierarchyList: React.FC<TaskHierarchyListProps> = ({
  tasks,
  onCreateSubtask,
  onTaskUpdate,
  onTaskClick,
  onEditTask,
  onCompleteTask,
  onCancelTask,
  expandByDefault = false
}) => {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(
    expandByDefault ? new Set(tasks.map(t => t.id)) : new Set()
  );
  
  const toggleExpanded = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'canceled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'done': return 'Completada';
      case 'in_progress': return 'En progreso';
      case 'canceled': return 'Cancelada';
      case 'open': return 'Pendiente';
      default: return status;
    }
  };
  
  const TaskItem = ({ task, depth = 0 }: { task: Task; depth?: number }) => {
    const hasSubtasks = (task.subtasks?.length || 0) > 0;
    const isExpanded = expandedTasks.has(task.id);
    const marginLeft = depth * 24; // 24px por nivel
    
    return (
      <div className="mb-3" style={{ marginLeft: `${marginLeft}px` }}>
        
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              {/* Botón expandir/contraer */}
              {hasSubtasks ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExpanded(task.id)}
                  className="p-1 h-6 w-6"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <div className="w-6" /> 
              )}
              
              {/* Información principal de la tarea */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h4 
                    className="font-medium text-sm cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 truncate"
                    onClick={() => onTaskClick?.(task)}
                  >
                    {task.title}
                  </h4>
                  
                  {/* Badge de estado */}
                  <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                    {getStatusText(task.status)}
                  </Badge>
                </div>
                
                {/* Descripción (si existe) */}
                {task.description && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {task.description}
                  </p>
                )}
                
                {/* Información adicional */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {/* Usuario asignado */}
                  {task.assigned_to_name && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{task.assigned_to_name}</span>
                    </div>
                  )}
                  
                  {/* Fecha límite */}
                  {task.due_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(task.due_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  
                  {/* Cliente */}
                  {task.customer?.full_name && (
                    <div className="flex items-center gap-1">
                      <span>Cliente: {task.customer.full_name}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Información de subtareas y acciones */}
              <div className="flex items-center gap-2">
                {/* Progreso de subtareas */}
                {hasSubtasks && (
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-xs font-medium">
                        {task.completed_subtasks}/{task.subtask_count}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(task.progress || 0)}%
                      </div>
                    </div>
                    <SimpleProgress 
                      value={task.progress || 0} 
                      className="w-16"
                    />
                  </div>
                )}
                
                {/* Botón de acciones */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      title="Acciones"
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onTaskClick?.(task)}>
                      <Eye className="h-4 w-4 mr-2" />
                      Ver detalles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditTask?.(task)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    {task.status !== 'done' && (
                      <DropdownMenuItem onClick={() => onCompleteTask?.(task)}>
                        <Check className="h-4 w-4 mr-2" />
                        Completar
                      </DropdownMenuItem>
                    )}
                    {task.status !== 'canceled' && (
                      <DropdownMenuItem onClick={() => onCancelTask?.(task)}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Botón agregar subtarea */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCreateSubtask(task.id)}
                  className="h-8 px-2"
                  title="Agregar subtarea"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          {/* Barra de progreso completa para tareas con subtareas */}
          {hasSubtasks && (
            <CardContent className="pt-0 pb-3">
              <div className="space-y-2">
                <SimpleProgress 
                  value={task.progress || 0} 
                  className=""
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{task.completed_subtasks} de {task.subtask_count} completadas</span>
                  <span>{Math.round(task.progress || 0)}% progreso</span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        
        {/* Subtareas */}
        {isExpanded && hasSubtasks && (
          <div className="mt-3 space-y-2">
            {task.subtasks?.map(subtask => (
              <TaskItem 
                key={subtask.id}
                task={subtask}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };
  
  // Filtrar solo tareas padre para la vista principal
  const parentTasks = tasks.filter(task => !task.parent_task_id);
  
  // Función para obtener todas las tareas que tienen subtareas (recursivamente)
  const getAllTasksWithSubtasks = (taskList: Task[]): string[] => {
    const tasksWithSubtasks: string[] = [];
    
    const processTask = (task: Task) => {
      if (task.subtasks && task.subtasks.length > 0) {
        tasksWithSubtasks.push(task.id);
        task.subtasks.forEach(processTask);
      }
    };
    
    taskList.forEach(processTask);
    return tasksWithSubtasks;
  };
  
  if (parentTasks.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No hay tareas disponibles
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Crea una nueva tarea para comenzar
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Encabezado con estadísticas */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium">Vista Jerárquica</h3>
          <Badge variant="secondary">
            {parentTasks.length} tarea{parentTasks.length !== 1 ? 's' : ''} principal{parentTasks.length !== 1 ? 'es' : ''}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpandedTasks(new Set(getAllTasksWithSubtasks(parentTasks)))}
          >
            Expandir todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpandedTasks(new Set())}
          >
            Contraer todas
          </Button>
        </div>
      </div>
      
      {/* Lista de tareas */}
      <div className="space-y-4 relative">
        {parentTasks.map(task => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};

export default TaskHierarchyList;
