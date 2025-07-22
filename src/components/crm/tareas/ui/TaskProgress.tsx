'use client';

import React from 'react';
import { Task } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, Clock, XCircle, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Componente Progress simple para reemplazar el que no existe
const SimpleProgress: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div 
      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

interface TaskProgressProps {
  task: Task;
  showDetails?: boolean;
  variant?: 'compact' | 'detailed' | 'card';
  className?: string;
}

const TaskProgress: React.FC<TaskProgressProps> = ({ 
  task, 
  showDetails = true, 
  variant = 'detailed',
  className = ''
}) => {
  if (!task.is_parent || !task.subtasks?.length) {
    return null;
  }
  
  const progress = task.progress || 0;
  const completed = task.completed_subtasks || 0;
  const total = task.subtask_count || 0;
  const pending = task.subtasks?.filter(s => s.status === 'open').length || 0;
  const inProgress = task.subtasks?.filter(s => s.status === 'in_progress').length || 0;
  const canceled = task.subtasks?.filter(s => s.status === 'canceled').length || 0;

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-gray-400';
  };

  const getProgressTextColor = (progress: number) => {
    if (progress === 100) return 'text-green-600 dark:text-green-400';
    if (progress >= 75) return 'text-blue-600 dark:text-blue-400';
    if (progress >= 50) return 'text-yellow-600 dark:text-yellow-400';
    if (progress >= 25) return 'text-orange-600 dark:text-orange-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <SimpleProgress 
          value={progress} 
          className="flex-1"
        />
        <Badge variant={progress === 100 ? "default" : "secondary"} className="text-xs">
          {completed}/{total}
        </Badge>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Progreso de Subtareas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Completadas</span>
            <Badge variant={progress === 100 ? "default" : "secondary"}>
              {completed}/{total}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <SimpleProgress 
              value={progress} 
              className=""
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span className={`font-medium ${getProgressTextColor(progress)}`}>
                {Math.round(progress)}%
              </span>
              <span>100%</span>
            </div>
          </div>

          {showDetails && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span className="text-muted-foreground">Completadas:</span>
                <span className="font-medium">{completed}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3 text-blue-500" />
                <span className="text-muted-foreground">En progreso:</span>
                <span className="font-medium">{inProgress}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Circle className="h-3 w-3 text-gray-500" />
                <span className="text-muted-foreground">Pendientes:</span>
                <span className="font-medium">{pending}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <XCircle className="h-3 w-3 text-red-500" />
                <span className="text-muted-foreground">Canceladas:</span>
                <span className="font-medium">{canceled}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Variant 'detailed' (default)
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Progreso de subtareas
        </span>
        <Badge variant={progress === 100 ? "default" : "secondary"}>
          {completed}/{total}
        </Badge>
      </div>
      
      <div className="space-y-2">
        <SimpleProgress 
          value={progress} 
          className=""
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span className={`font-medium ${getProgressTextColor(progress)}`}>
            {Math.round(progress)}%
          </span>
          <span>100%</span>
        </div>
      </div>

      {showDetails && (
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span>{completed} completadas</span>
          </div>
          {inProgress > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-blue-500" />
              <span>{inProgress} en progreso</span>
            </div>
          )}
          {pending > 0 && (
            <div className="flex items-center gap-1">
              <Circle className="h-3 w-3 text-gray-500" />
              <span>{pending} pendientes</span>
            </div>
          )}
          {canceled > 0 && (
            <div className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              <span>{canceled} canceladas</span>
            </div>
          )}
        </div>
      )}

      {/* Mensaje de estado */}
      {progress === 100 && (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 p-2 rounded">
          <CheckCircle className="h-3 w-3" />
          <span>¡Todas las subtareas completadas!</span>
        </div>
      )}
    </div>
  );
};

export default TaskProgress;
