'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

export interface TaskReminder {
  id: string;
  title: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_name?: string;
  customer?: {
    id: string;
    name: string;
  };
  daysUntilDue: number;
  isOverdue: boolean;
}

interface UseTaskRemindersReturn {
  taskReminders: TaskReminder[];
  loading: boolean;
  error: string | null;
  refreshReminders: () => void;
}

export const useTaskReminders = (organizationId: string | null): UseTaskRemindersReturn => {
  const [taskReminders, setTaskReminders] = useState<TaskReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTaskReminders = async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      // Obtener usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuario no autenticado');
      }

      // Calcular fechas para el filtro (próximas 7 días y vencidas)
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(now.getDate() + 7);
      
      // Formatear fechas para la consulta
      const todayStr = now.toISOString().split('T')[0];
      const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];
      


      // Consultar tareas próximas a vencer o vencidas (incluye tareas de hoy)
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          due_date,
          priority,
          assigned_to,
          related_to_id,
          related_to_type,
          status
        `)
        .eq('organization_id', organizationId)
        .not('status', 'in', '("completed", "canceled")')
        .not('due_date', 'is', null)
        .lte('due_date', sevenDaysStr)
        .order('due_date', { ascending: true })
        .limit(10);

      if (tasksError) {
        console.error('❌ [TaskReminders] Error en consulta:', tasksError);
        throw tasksError;
      }
      

      if (!tasks || tasks.length === 0) {
        console.log('ℹ️ [TaskReminders] No hay tareas próximas a vencer');
        setTaskReminders([]);
        return;
      }

      // Obtener IDs únicos de usuarios asignados
      const assignedUserIds = Array.from(new Set(
        tasks
          .filter(task => task.assigned_to)
          .map(task => task.assigned_to)
      ));

      // Obtener nombres de usuarios asignados
      let userNames: Record<string, string> = {};
      if (assignedUserIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', assignedUserIds);

        if (!usersError && users) {
          userNames = users.reduce((acc, user) => {
            acc[user.id] = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuario sin nombre';
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Obtener IDs únicos de clientes relacionados
      const customerIds = Array.from(new Set(
        tasks
          .filter(task => task.related_to_type === 'cliente' && task.related_to_id)
          .map(task => task.related_to_id)
      ));

      // Obtener datos de clientes
      let customers: Record<string, { id: string; name: string }> = {};
      if (customerIds.length > 0) {
        const { data: customerData, error: customersError } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds);

        if (!customersError && customerData) {
          customers = customerData.reduce((acc, customer) => {
            acc[customer.id] = {
              id: customer.id,
              name: customer.name
            };
            return acc;
          }, {} as Record<string, { id: string; name: string }>);
        }
      }

      // Función para mapear prioridades de BD a tipos esperados
      const mapPriority = (dbPriority: string): 'low' | 'medium' | 'high' | 'urgent' => {
        switch (dbPriority) {
          case 'low':
            return 'low';
          case 'med':
          case 'medium':
            return 'medium';
          case 'high':
            return 'high';
          case 'urgent':
            return 'urgent';
          default:
            return 'medium'; // valor por defecto
        }
      };

      // Procesar tareas y calcular días hasta vencimiento
      const processedReminders: TaskReminder[] = tasks.map(task => {
        const dueDate = new Date(task.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(timeDiff / (1000 * 3600 * 24));
        const isOverdue = daysUntilDue < 0;
        


        return {
          id: task.id,
          title: task.title,
          due_date: task.due_date,
          priority: mapPriority(task.priority),
          assigned_to_name: task.assigned_to ? userNames[task.assigned_to] : undefined,
          customer: task.related_to_type === 'cliente' && task.related_to_id 
            ? customers[task.related_to_id] 
            : undefined,
          daysUntilDue,
          isOverdue
        };
      });
      


      setTaskReminders(processedReminders);
    } catch (err) {
      console.error('Error al cargar recordatorios de tareas:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const refreshReminders = () => {
    fetchTaskReminders();
  };

  useEffect(() => {
    if (organizationId) {
      fetchTaskReminders();

      // Configurar suscripción a cambios en tareas
      const tasksSubscription = supabase
        .channel('task-reminders-changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'tasks',
            filter: `organization_id=eq.${organizationId}`
          },
          () => {
            // Refrescar recordatorios cuando hay cambios en tareas
            setTimeout(fetchTaskReminders, 1000);
          }
        )
        .subscribe();

      return () => {
        tasksSubscription.unsubscribe();
      };
    }
  }, [organizationId]);

  return {
    taskReminders,
    loading,
    error,
    refreshReminders
  };
};
