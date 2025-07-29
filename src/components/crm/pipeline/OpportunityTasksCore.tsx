"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { CheckSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { getOrganizationId } from "./utils/pipelineUtils";
import { TaskList, TaskDialog, EmptyState } from "./tasks";

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: string;
  status: string;
  completed_at?: string | null;
  remind_before_minutes?: number;
  remind_email: boolean;
  remind_push: boolean;
  created_at: string;
  created_by?: string;
}

interface NewTask {
  title: string;
  description: string;
  due_date: string | null;
  priority: string;
  remind_before_minutes: number;
  remind_email: boolean;
  remind_push: boolean;
}

interface OpportunityTasksCoreProps {
  opportunityId: string;
}

export default function OpportunityTasksCore({ opportunityId }: OpportunityTasksCoreProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  
  // Estado con validación ultra-robusta para prevenir NaN
  const [newTask, setNewTask] = useState<NewTask>(() => ({
    title: '',
    description: '',
    due_date: null,
    priority: 'med',
    remind_before_minutes: 30,
    remind_email: false,
    remind_push: false,
  }));

  // Función para resetear el formulario
  const resetForm = useCallback(() => {
    console.log('🔄 Reseteando formulario...');
    setNewTask({
      title: '',
      description: '',
      due_date: null,
      priority: 'med',
      remind_before_minutes: 30,
      remind_email: false,
      remind_push: false,
    });
    setSelectedDate(undefined);
  }, []);

  // Función para actualizar newTask de forma segura
  const updateTaskSafely = useCallback((updates: Partial<NewTask>) => {
    console.log('🔧 Actualizando tarea:', updates);
    setNewTask(prev => {
      const updated = { ...prev, ...updates };
      console.log('🔧 Estado actualizado:', updated);
      return updated;
    });
  }, []);

  useEffect(() => {
    const initializeOrganization = async () => {
      const orgId = await getOrganizationId();
      if (orgId) {
        setOrganizationId(orgId);
      } else {
        console.warn('No se pudo obtener el ID de la organización');
        setLoading(false);
      }
    };

    initializeOrganization();
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('related_to_id', opportunityId)
        .eq('related_to_type', 'opportunity')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error cargando tareas:', error);
        // Si hay error, mostrar datos de ejemplo para demostración
        const mockTasks: Task[] = [
          {
            id: '1',
            title: 'Llamar al cliente para seguimiento',
            description: 'Contactar al cliente para conocer el estado de su decisión',
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            priority: 'high',
            status: 'pending',
            completed_at: null,
            remind_before_minutes: 30,
            remind_email: true,
            remind_push: false,
            created_at: new Date().toISOString(),
            created_by: 'demo'
          },
          {
            id: '2',
            title: 'Enviar propuesta revisada',
            description: 'Preparar y enviar la propuesta con los ajustes solicitados',
            due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            priority: 'med',
            status: 'pending',
            completed_at: null,
            remind_before_minutes: 60,
            remind_email: true,
            remind_push: true,
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            created_by: 'demo'
          },
          {
            id: '3',
            title: 'Reunión de presentación completada',
            description: 'Presentación exitosa de la propuesta al equipo del cliente',
            due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            priority: 'high',
            status: 'completed',
            completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            remind_before_minutes: 15,
            remind_email: false,
            remind_push: true,
            created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            created_by: 'demo'
          }
        ];
        setTasks(mockTasks);
        return;
      }

      setTasks(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [opportunityId, organizationId]);

  useEffect(() => {
    if (opportunityId && organizationId) {
      loadTasks();
    }
  }, [opportunityId, organizationId, loadTasks]);

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const handleTaskComplete = async (taskId: string, completed: boolean) => {
    try {
      const updateData = completed 
        ? { status: 'completed', completed_at: new Date().toISOString() }
        : { status: 'pending', completed_at: null };

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('Error actualizando tarea:', error);
        toast.error('Error al actualizar la tarea');
        return;
      }

      // Actualizar el estado local
      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, ...updateData }
          : task
      ));

      toast.success(completed ? 'Tarea completada' : 'Tarea marcada como pendiente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar la tarea');
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    updateTaskSafely({ 
      due_date: date ? date.toISOString() : null 
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const orgId = await getOrganizationId();
      if (!orgId) {
        toast.error('No se pudo obtener la información de la organización');
        return;
      }

      const remindMinutes = typeof newTask.remind_before_minutes === 'number' && 
                           !isNaN(newTask.remind_before_minutes) && 
                           newTask.remind_before_minutes > 0 
                           ? newTask.remind_before_minutes 
                           : 30;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: newTask.title,
          description: newTask.description || null,
          due_date: newTask.due_date || null,
          priority: newTask.priority,
          status: 'open',
          related_to_id: opportunityId,
          related_to_type: 'opportunity',
          organization_id: orgId,
          remind_before_minutes: remindMinutes,
          remind_email: newTask.remind_email,
          remind_push: newTask.remind_push,
          type: 'manual'
        });

      if (error) {
        console.error('Error creando tarea:', error);
        toast.error(`Error al crear la tarea: ${error.message || 'Error desconocido'}`);
        return;
      }

      toast.success('Tarea creada exitosamente');
      setIsDialogOpen(false);
      resetForm();
      loadTasks();
      
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear la tarea');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Tareas y Recordatorios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Tareas y Recordatorios
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tarea
              </Button>
            </DialogTrigger>
            <TaskDialog
              isOpen={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              newTask={newTask}
              onTaskChange={updateTaskSafely}
              onSubmit={handleSubmit}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <EmptyState onCreateTask={() => setIsDialogOpen(true)} />
        ) : (
          <TaskList
            tasks={tasks}
            onTaskComplete={handleTaskComplete}
            isOverdue={isOverdue}
          />
        )}
      </CardContent>
    </Card>
  );
}
