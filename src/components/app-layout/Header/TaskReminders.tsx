'use client';

import React from 'react';
import { Clock, AlertTriangle, User, Building } from 'lucide-react';
import { TaskReminder } from '@/lib/hooks/useTaskReminders';

interface TaskRemindersProps {
  taskReminders: TaskReminder[];
  loading: boolean;
  onTaskClick?: (taskId: string) => void;
}

export const TaskReminders: React.FC<TaskRemindersProps> = ({
  taskReminders,
  loading,
  onTaskClick
}) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400';
      case 'high':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'low':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'Urgente';
      case 'high':
        return 'Alta';
      case 'medium':
        return 'Media';
      case 'low':
        return 'Baja';
      default:
        return 'Normal';
    }
  };

  const getDueDateText = (daysUntilDue: number, isOverdue: boolean) => {
    if (isOverdue) {
      const overdueDays = Math.abs(daysUntilDue);
      return {
        text: `Vencida hace ${overdueDays} día${overdueDays !== 1 ? 's' : ''}`,
        className: 'text-red-600 dark:text-red-400 font-medium'
      };
    } else if (daysUntilDue === 0) {
      return {
        text: 'Vence hoy',
        className: 'text-orange-600 dark:text-orange-400 font-medium'
      };
    } else if (daysUntilDue === 1) {
      return {
        text: 'Vence mañana',
        className: 'text-yellow-600 dark:text-yellow-400 font-medium'
      };
    } else {
      return {
        text: `Vence en ${daysUntilDue} días`,
        className: 'text-blue-600 dark:text-blue-400'
      };
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <Clock className="h-4 w-4 animate-spin mx-auto mb-2" />
        Cargando recordatorios...
      </div>
    );
  }

  if (taskReminders.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No hay tareas próximas a vencer</p>
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto">
      {taskReminders.map((reminder) => {
        const dueDateInfo = getDueDateText(reminder.daysUntilDue, reminder.isOverdue);
        
        return (
          <div
            key={reminder.id}
            className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
              reminder.isOverdue ? 'bg-red-50 dark:bg-red-900/10' : ''
            }`}
            onClick={() => onTaskClick?.(reminder.id)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {reminder.title}
                </h4>
                <div className="flex items-center mt-1 space-x-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(reminder.priority)}`}>
                    {getPriorityLabel(reminder.priority)}
                  </span>
                  {reminder.isOverdue && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center text-xs">
                <Clock className="h-3 w-3 mr-1" />
                <span className={dueDateInfo.className}>
                  {dueDateInfo.text}
                </span>
              </div>

              {reminder.assigned_to_name && (
                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                  <User className="h-3 w-3 mr-1" />
                  <span>Asignado a: {reminder.assigned_to_name}</span>
                </div>
              )}

              {reminder.customer && (
                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                  <Building className="h-3 w-3 mr-1" />
                  <span>Cliente: {reminder.customer.name}</span>
                </div>
              )}
            </div>

            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Fecha límite: {new Date(reminder.due_date).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
