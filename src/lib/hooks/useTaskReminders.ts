'use client';

/**
 * Recordatorios de tareas de la campana del header: vencidas y las que vencen
 * en los próximos 7 días.
 *
 * Alcance: la campana es personal, así que solo entran las tareas que le
 * tocan a quien la mira —asignadas a esa persona— y las que creó y siguen sin
 * responsable (si no, nadie las vería). La vista de toda la organización es
 * /app/pm/tareas, que ya lista todas con filtro por responsable.
 *
 * Fechas: `tasks.due_date` es timestamptz; «hoy» y los días hasta el
 * vencimiento se calculan en la zona de la organización (useOrgTimezone), no
 * en la del navegador. Ver src/lib/utils/taskReminderDates.ts.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { diasHastaVencimiento, ventanaRecordatorios } from '@/lib/utils/taskReminderDates';

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
  project_id?: string | null;
  related_to_type?: string | null;
}

interface UseTaskRemindersReturn {
  taskReminders: TaskReminder[];
  loading: boolean;
  error: string | null;
  refreshReminders: () => void;
}

/** `related_to_type` con el que se enlaza una tarea a un cliente (ambos existen en BD). */
const TIPOS_CLIENTE = new Set(['cliente', 'customer']);

/** Prioridades de BD (CHECK: low, med, high, critical) a las de la UI. */
const mapPriority = (dbPriority: string | null): TaskReminder['priority'] => {
  switch (dbPriority) {
    case 'low':
      return 'low';
    case 'high':
      return 'high';
    case 'critical':
    case 'urgent':
      return 'urgent';
    default:
      return 'medium';
  }
};

export const useTaskReminders = (organizationId: string | null): UseTaskRemindersReturn => {
  const [taskReminders, setTaskReminders] = useState<TaskReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { timezone, isLoading: cargandoZona } = useOrgTimezone();

  const fetchTaskReminders = useCallback(async () => {
    // Sin la zona de la organización, «hoy» saldría del fallback.
    if (!organizationId || cargandoZona) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuario no autenticado');
      }

      const { hoy, hastaExclusivo } = ventanaRecordatorios(timezone);

      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, assigned_to, related_to_id, related_to_type, status, project_id')
        .eq('organization_id', organizationId)
        .or(`assigned_to.eq.${user.id},and(assigned_to.is.null,created_by.eq.${user.id})`)
        .not('status', 'in', '(done,canceled)')
        .not('due_date', 'is', null)
        .lt('due_date', hastaExclusivo)
        .order('due_date', { ascending: true })
        .limit(10);

      if (tasksError) throw tasksError;

      if (!tasks || tasks.length === 0) {
        setTaskReminders([]);
        return;
      }

      const assignedUserIds = Array.from(new Set(
        tasks.map(task => task.assigned_to).filter((id): id is string => Boolean(id))
      ));
      const customerIds = Array.from(new Set(
        tasks
          .filter(task => task.related_to_type && TIPOS_CLIENTE.has(task.related_to_type))
          .map(task => task.related_to_id)
          .filter((id): id is string => Boolean(id))
      ));

      const [resUsuarios, resClientes] = await Promise.all([
        assignedUserIds.length > 0
          ? supabase.from('profiles').select('id, first_name, last_name').in('id', assignedUserIds)
          : Promise.resolve({ data: [], error: null }),
        // `customers` no tiene `name`: el nombre es `full_name` (GENERATED).
        customerIds.length > 0
          ? supabase.from('customers').select('id, full_name').in('id', customerIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (resUsuarios.error) console.warn('[TaskReminders] responsables', resUsuarios.error.message);
      if (resClientes.error) console.warn('[TaskReminders] clientes', resClientes.error.message);

      const userNames = new Map<string, string>(
        (resUsuarios.data ?? []).map((u: { id: string; first_name: string | null; last_name: string | null }) => [
          u.id,
          `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Usuario sin nombre',
        ])
      );
      const customers = new Map<string, { id: string; name: string }>(
        (resClientes.data ?? []).map((c: { id: string; full_name: string | null }) => [
          c.id,
          { id: c.id, name: c.full_name || 'Cliente sin nombre' },
        ])
      );

      setTaskReminders(tasks.map(task => {
        const daysUntilDue = diasHastaVencimiento(task.due_date, hoy, timezone);
        return {
          id: task.id,
          title: task.title,
          due_date: task.due_date,
          priority: mapPriority(task.priority),
          assigned_to_name: task.assigned_to ? userNames.get(task.assigned_to) : undefined,
          customer: task.related_to_type && TIPOS_CLIENTE.has(task.related_to_type) && task.related_to_id
            ? customers.get(task.related_to_id)
            : undefined,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
          project_id: task.project_id,
          related_to_type: task.related_to_type,
        };
      }));
    } catch (err) {
      console.error('Error al cargar recordatorios de tareas:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [organizationId, timezone, cargandoZona]);

  // La consulta se rehace cuando cambia la organización o llega su zona.
  const fetchRef = useRef(fetchTaskReminders);
  useEffect(() => {
    fetchRef.current = fetchTaskReminders;
    void fetchTaskReminders();
  }, [fetchTaskReminders]);

  // La suscripción depende solo de la organización: recrear un canal con el
  // mismo nombre mientras el anterior se está cerrando devuelve el viejo.
  // El nombre incluye organizationId para no recibir eventos de otra
  // organización tras cambiar de una a otra. No se limpia el estado aquí para
  // no vaciar las tareas cuando el componente se re-monta al navegar.
  useEffect(() => {
    if (!organizationId) return;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const tasksSubscription = supabase
      .channel(`task-reminders-changes-${organizationId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          clearTimeout(temporizador);
          temporizador = setTimeout(() => void fetchRef.current(), 1000);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(temporizador);
      void supabase.removeChannel(tasksSubscription);
    };
  }, [organizationId]);

  return {
    taskReminders,
    loading,
    error,
    refreshReminders: () => void fetchTaskReminders(),
  };
};
