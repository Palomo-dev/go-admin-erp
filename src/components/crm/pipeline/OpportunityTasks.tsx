"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Plus, Calendar, Clock, Bell } from "lucide-react";
import { toast } from "sonner";
import LoadingSpinner from "@/components/ui/loading-spinner";

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

interface OpportunityTasksProps {
  opportunityId: string;
}

export default function OpportunityTasks({ opportunityId }: OpportunityTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    remind_before_minutes: 30,
    remind_email: true,
    remind_push: false
  });

  useEffect(() => {
    // Obtener organización desde localStorage
    const storedOrg = localStorage.getItem('selectedOrganization');
    if (storedOrg) {
      const org = JSON.parse(storedOrg);
      setOrganizationId(org.id);
    }
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
        toast.error('Error al cargar las tareas');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTask.title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    if (!organizationId) {
      toast.error('No se pudo obtener la organización');
      return;
    }

    try {
      const taskData = {
        organization_id: organizationId,
        title: newTask.title,
        description: newTask.description || null,
        due_date: newTask.due_date || null,
        priority: newTask.priority,
        status: 'pending',
        related_to_id: opportunityId,
        related_to_type: 'opportunity',
        remind_before_minutes: newTask.remind_before_minutes,
        remind_email: newTask.remind_email,
        remind_push: newTask.remind_push,
        type: 'manual'
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select()
        .single();

      if (error) {
        console.error('Error creando tarea:', error);
        toast.error('Error al crear la tarea');
        return;
      }

      setTasks(prev => [data, ...prev]);
      setNewTask({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        remind_before_minutes: 30,
        remind_email: true,
        remind_push: false
      });
      setIsDialogOpen(false);
      toast.success('Tarea creada exitosamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear la tarea');
    }
  };

  const handleTaskComplete = async (taskId: string, completed: boolean) => {
    try {
      const updateData: {
        status: string;
        updated_at: string;
        completed_at?: string | null;
      } = {
        status: completed ? 'completed' : 'pending',
        updated_at: new Date().toISOString()
      };

      if (completed) {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('Error actualizando tarea:', error);
        toast.error('Error al actualizar la tarea');
        return;
      }

      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, status: updateData.status, completed_at: updateData.completed_at || null }
          : task
      ));

      toast.success(`Tarea marcada como ${completed ? 'completada' : 'pendiente'}`);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar la tarea');
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Alta</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Media</Badge>;
      case 'low':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Baja</Badge>;
      default:
        return <Badge variant="outline">Media</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Completada</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">En Progreso</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">Cancelada</Badge>;
      default:
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100">Pendiente</Badge>;
    }
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
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

  const pendingTasks = tasks.filter(task => task.status !== 'completed');
  const completedTasks = tasks.filter(task => task.status === 'completed');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Tareas y Recordatorios
            {pendingTasks.length > 0 && (
              <Badge variant="outline">{pendingTasks.length} pendientes</Badge>
            )}
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tarea
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Crear Nueva Tarea</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={newTask.title}
                    onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ej: Llamar al cliente para seguimiento"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Detalles adicionales de la tarea"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="due_date">Fecha Límite</Label>
                    <Input
                      id="due_date"
                      type="datetime-local"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask(prev => ({ ...prev, due_date: e.target.value }))}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="priority">Prioridad</Label>
                    <Select value={newTask.priority} onValueChange={(value) => setNewTask(prev => ({ ...prev, priority: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label>Recordatorios</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remind_email"
                        checked={newTask.remind_email}
                        onCheckedChange={(checked) => setNewTask(prev => ({ ...prev, remind_email: !!checked }))}
                      />
                      <Label htmlFor="remind_email" className="text-sm">Recordatorio por email</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remind_push"
                        checked={newTask.remind_push}
                        onCheckedChange={(checked) => setNewTask(prev => ({ ...prev, remind_push: !!checked }))}
                      />
                      <Label htmlFor="remind_push" className="text-sm">Notificación push</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="remind_minutes" className="text-sm">Recordar</Label>
                      <Select 
                        value={newTask.remind_before_minutes.toString()} 
                        onValueChange={(value) => setNewTask(prev => ({ ...prev, remind_before_minutes: parseInt(value) }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 min antes</SelectItem>
                          <SelectItem value="30">30 min antes</SelectItem>
                          <SelectItem value="60">1 hora antes</SelectItem>
                          <SelectItem value="1440">1 día antes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Crear Tarea
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay tareas registradas</h3>
            <p className="text-muted-foreground mb-4">
              Crea tareas y recordatorios para hacer seguimiento
            </p>
            <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primera Tarea
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tareas Pendientes */}
            {pendingTasks.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Tareas Pendientes ({pendingTasks.length})
                </h4>
                <div className="space-y-3">
                  {pendingTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <Checkbox
                        checked={false}
                        onCheckedChange={(checked) => handleTaskComplete(task.id, !!checked)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-medium">{task.title}</h5>
                          {getPriorityBadge(task.priority)}
                          {task.due_date && isOverdue(task.due_date) && (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                              Vencida
                            </Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {task.due_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(task.due_date).toLocaleString()}
                            </div>
                          )}
                          {(task.remind_email || task.remind_push) && (
                            <div className="flex items-center gap-1">
                              <Bell className="h-3 w-3" />
                              {task.remind_before_minutes} min antes
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tareas Completadas */}
            {completedTasks.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Tareas Completadas ({completedTasks.length})
                </h4>
                <div className="space-y-3">
                  {completedTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 p-3 border rounded-lg opacity-75">
                      <Checkbox
                        checked={true}
                        onCheckedChange={(checked) => handleTaskComplete(task.id, !!checked)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-medium line-through">{task.title}</h5>
                          {getStatusBadge(task.status)}
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-through">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {task.completed_at && (
                            <div className="flex items-center gap-1">
                              <CheckSquare className="h-3 w-3" />
                              Completada: {new Date(task.completed_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
