'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// Interfaces para el componente
interface Tarea {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  assigned_name?: string;
}

interface TareasSidebarProps {
  clienteId: string;
  organizationId: number;
}

export default function TareasSidebar({ clienteId, organizationId }: TareasSidebarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [users, setUsers] = useState<{[key: string]: any}>({});
  
  useEffect(() => {
    const fetchTareas = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Obtener tareas relacionadas con el cliente
        const { data: tareasData, error: tareasError } = await supabase
          .from('tasks')
          .select('*')
          .eq('related_type', 'customer')
          .eq('related_id', clienteId)
          .eq('organization_id', organizationId)
          .in('status', ['pending', 'in_progress'])
          .order('due_date', { ascending: true })
          .order('priority', { ascending: false });
        
        if (tareasError) throw tareasError;
        
        if (tareasData) {
          // Recolectar IDs de usuarios únicos para asignados
          const userIds = tareasData
            .map(task => task.assigned_to)
            .filter(id => id !== null) as string[];
          
          const uniqueUserIds = [...new Set(userIds)];
          
          // Obtener información de los usuarios asignados
          if (uniqueUserIds.length > 0) {
            const { data: usersData, error: usersError } = await supabase
              .from('profiles')
              .select('id, first_name, last_name')
              .in('id', uniqueUserIds);
              
            if (usersError) throw usersError;
            
            // Crear mapa de usuarios para fácil acceso
            const usersMap: {[key: string]: any} = {};
            usersData?.forEach(user => {
              usersMap[user.id] = user;
            });
            
            setUsers(usersMap);
          }
          
          setTareas(tareasData);
        }
      } catch (err: any) {
        console.error('Error al cargar tareas:', err);
        setError(err.message || 'Error al cargar las tareas');
      } finally {
        setLoading(false);
      }
    };

    fetchTareas();
  }, [clienteId, organizationId]);

  // Formatear fecha relativa
  const formatRelativeDate = (dateString: string | null) => {
    if (!dateString) return 'Sin fecha';
    
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  // Obtener color según prioridad
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/20';
      case 'medium':
        return 'text-amber-500 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20';
      case 'low':
        return 'text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20';
      default:
        return 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
    }
  };

  // Obtener icono según estado
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
      case 'in_progress':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  // Obtener nombre del asignado
  const getAssigneeName = (userId: string | null) => {
    if (!userId) return 'Sin asignar';
    
    const user = users[userId];
    if (!user) return 'Usuario';
    
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuario';
  };

  // Obtener texto de prioridad
  const getPriorityText = (priority: string) => {
    switch (priority) {
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

  // Obtener texto de estado
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'in_progress':
        return 'En progreso';
      case 'completed':
        return 'Completada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  // Mostrar estado de carga
  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
        <h3 className="font-medium text-lg mb-4 text-gray-900 dark:text-white">Tareas</h3>
        <div className="flex justify-center py-4">
          <div className="loading loading-spinner loading-sm"></div>
        </div>
      </div>
    );
  }

  // Mostrar error si existe
  if (error) {
    return (
      <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
        <h3 className="font-medium text-lg mb-4 text-gray-900 dark:text-white">Tareas</h3>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-lg text-gray-900 dark:text-white">
          Tareas Pendientes
        </h3>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {tareas.length}
        </span>
      </div>

      {tareas.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No hay tareas pendientes para este cliente
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {tareas.map(tarea => (
            <div 
              key={tarea.id} 
              className="p-3 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                  {getStatusIcon(tarea.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {tarea.title}
                  </h4>
                  
                  {tarea.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {tarea.description}
                    </p>
                  )}
                  
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(tarea.priority)}`}>
                      {getPriorityText(tarea.priority)}
                    </span>
                    
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {getStatusText(tarea.status)}
                    </span>
                    
                    {tarea.due_date && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        new Date(tarea.due_date) < new Date() 
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' 
                          : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      }`}>
                        {formatRelativeDate(tarea.due_date)}
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate">
                      {getAssigneeName(tarea.assigned_to)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          <div className="pt-2 flex justify-center">
            <a href="/app/tareas" className="text-xs text-primary hover:underline">
              Ver todas las tareas
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
