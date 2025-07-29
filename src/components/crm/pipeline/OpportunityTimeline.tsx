"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Plus, User, Phone, Mail, FileText, Calendar, MessageSquare, Target } from "lucide-react";
import { toast } from "sonner";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { getOrganizationId } from "./utils/pipelineUtils";

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  created_at: string;
  occurred_at?: string;
  author: string;
  source: 'activity' | 'task' | 'manual';
  metadata?: Record<string, unknown>;
}

interface OpportunityTimelineProps {
  opportunityId: string;
}

export default function OpportunityTimeline({ opportunityId }: OpportunityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    type: '',
    title: '',
    description: ''
  });

  // Funciones auxiliares para mapear tipos de actividades
  const mapActivityType = (activityType: string): string => {
    switch (activityType) {
      case 'system':
        return 'stage_change';
      case 'call':
        return 'call';
      case 'email':
        return 'email';
      case 'meeting':
        return 'meeting';
      case 'note':
        return 'note';
      default:
        return 'note';
    }
  };

  const getActivityTitle = (activityType: string, notes: string): string => {
    switch (activityType) {
      case 'system':
        return notes.includes('Cambio de etapa') ? 'Cambio de etapa' : 'Evento del sistema';
      case 'call':
        return 'Llamada telefónica';
      case 'email':
        return 'Email enviado';
      case 'meeting':
        return 'Reunión programada';
      case 'note':
        return 'Nota agregada';
      default:
        return 'Actividad registrada';
    }
  };

  const getTaskEventType = (status: string): string => {
    switch (status) {
      case 'done':
        return 'task_completed';
      case 'canceled':
        return 'task_canceled';
      default:
        return 'task_created';
    }
  };

  const getTaskEventTitle = (status: string, title: string): string => {
    switch (status) {
      case 'done':
        return `✅ Tarea completada: ${title}`;
      case 'canceled':
        return `❌ Tarea cancelada: ${title}`;
      case 'in_progress':
        return `🔄 Tarea en progreso: ${title}`;
      default:
        return `📋 Tarea creada: ${title}`;
    }
  };

  const loadTimeline = useCallback(async () => {
    try {
      setLoading(true);

      const organizationId = getOrganizationId();
      if (!organizationId) {
        toast.error('No se encontró la organización');
        return;
      }

      console.log('🔍 Cargando timeline para oportunidad:', opportunityId, 'organización:', organizationId);

      // Cargar actividades de la tabla activities
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select(`
          id,
          activity_type,
          notes,
          occurred_at,
          created_at,
          metadata,
          user_id
        `)
        .eq('organization_id', organizationId)
        .eq('related_type', 'opportunity')
        .eq('related_id', opportunityId)
        .order('occurred_at', { ascending: false });

      if (activitiesError) {
        console.error('❌ Error cargando actividades:', {
          error: activitiesError,
          message: activitiesError?.message,
          details: activitiesError?.details,
          hint: activitiesError?.hint,
          code: activitiesError?.code
        });
      } else {
        console.log('✅ Actividades cargadas:', activities?.length || 0);
      }

      // Cargar tareas relacionadas con validación adicional
      console.log('🔍 Consultando tareas con filtros:', {
        organization_id: organizationId,
        opportunity_id: opportunityId
      });

      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          description,
          status,
          priority,
          due_date,
          completed_at,
          created_at,
          updated_at
        `)
        .eq('organization_id', organizationId)
        .eq('related_to_id', opportunityId)
        .eq('related_to_type', 'opportunity')
        .order('created_at', { ascending: false });

      if (tasksError) {
        console.error('❌ Error cargando tareas:', {
          error: tasksError,
          message: tasksError?.message,
          details: tasksError?.details,
          hint: tasksError?.hint,
          code: tasksError?.code,
          filters: {
            organization_id: organizationId,
            opportunity_id: opportunityId
          }
        });
        toast.error('Error al cargar las tareas de la oportunidad');
      } else {
        console.log('✅ Tareas cargadas:', tasks?.length || 0);
        if (tasks && tasks.length > 0) {
          console.log('📋 Primeras tareas:', tasks.slice(0, 3));
        }
      }

      // Convertir actividades a eventos de timeline
      const activityEvents: TimelineEvent[] = (activities || []).map(activity => ({
        id: activity.id,
        type: mapActivityType(activity.activity_type),
        title: getActivityTitle(activity.activity_type, activity.notes),
        description: activity.notes || undefined,
        created_at: activity.created_at,
        occurred_at: activity.occurred_at,
        author: 'Usuario', // TODO: Obtener nombre real del usuario
        source: 'activity' as const,
        metadata: activity.metadata || {}
      }));

      // Convertir tareas a eventos de timeline
      const taskEvents: TimelineEvent[] = (tasks || []).map(task => ({
        id: `task-${task.id}`,
        type: getTaskEventType(task.status),
        title: getTaskEventTitle(task.status, task.title),
        description: task.description || undefined,
        created_at: task.status === 'done' && task.completed_at ? task.completed_at : task.created_at,
        author: 'Usuario', // TODO: Obtener nombre real del usuario
        source: 'task' as const,
        metadata: {
          priority: task.priority,
          due_date: task.due_date,
          original_task_id: task.id
        }
      }));

      // Combinar y ordenar todos los eventos
      const allEvents = [...activityEvents, ...taskEvents];
      allEvents.sort((a, b) => {
        const dateA = new Date(a.occurred_at || a.created_at).getTime();
        const dateB = new Date(b.occurred_at || b.created_at).getTime();
        return dateB - dateA;
      });

      setEvents(allEvents);
    } catch (error) {
      console.error('Error cargando timeline:', error);
      toast.error('Error al cargar la línea de tiempo');
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEvent.type || !newEvent.title.trim()) {
      toast.error('El tipo y título son requeridos');
      return;
    }

    try {
      const newEventData: TimelineEvent = {
        id: Date.now().toString(),
        type: newEvent.type,
        title: newEvent.title,
        description: newEvent.description,
        created_at: new Date().toISOString(),
        author: 'Usuario Actual', // En una implementación real, obtendríamos del contexto de usuario
        source: 'manual' as const,
        metadata: {}
      };

      setEvents(prev => [newEventData, ...prev]);
      setNewEvent({ type: '', title: '', description: '' });
      setIsDialogOpen(false);
      toast.success('Evento agregado a la línea de tiempo');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al agregar el evento');
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <Target className="h-4 w-4" />;
      case 'stage_change':
        return <Target className="h-4 w-4" />;
      case 'call':
        return <Phone className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      case 'quote':
        return <FileText className="h-4 w-4" />;
      case 'note':
        return <MessageSquare className="h-4 w-4" />;
      case 'task_completed':
        return <Target className="h-4 w-4" />;
      case 'task_canceled':
        return <Target className="h-4 w-4" />;
      case 'task_created':
        return <Target className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'created':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'stage_change':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      case 'call':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100';
      case 'email':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100';
      case 'meeting':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100';
      case 'quote':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
      case 'task_completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'task_canceled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      case 'task_created':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Línea de Tiempo
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
            <Clock className="h-5 w-5" />
            Línea de Tiempo
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Evento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Agregar Evento a la Línea de Tiempo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="type">Tipo de Evento *</Label>
                  <Select value={newEvent.type} onValueChange={(value) => setNewEvent(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Llamada</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Reunión</SelectItem>
                      <SelectItem value="quote">Cotización</SelectItem>
                      <SelectItem value="note">Nota</SelectItem>
                      <SelectItem value="stage_change">Cambio de Etapa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ej: Llamada de seguimiento"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Detalles adicionales del evento"
                    rows={3}
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Agregar Evento
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay eventos registrados</h3>
            <p className="text-muted-foreground mb-4">
              Agrega eventos para hacer seguimiento de la oportunidad
            </p>
            <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Primer Evento
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => (
              <div key={event.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`p-2 rounded-full ${getEventColor(event.type)}`}>
                    {getEventIcon(event.type)}
                  </div>
                  {index < events.length - 1 && (
                    <div className="w-px h-8 bg-border mt-2" />
                  )}
                </div>
                
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{event.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {event.type.replace('_', ' ')}
                    </Badge>
                    {event.source === 'activity' && (
                      <Badge variant="secondary" className="text-xs">
                        Sistema
                      </Badge>
                    )}
                    {event.source === 'task' && (
                      <Badge variant="secondary" className="text-xs">
                        Tarea
                      </Badge>
                    )}
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {event.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{event.author}</span>
                    <span>•</span>
                    <span>{formatDate(event.occurred_at || event.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
