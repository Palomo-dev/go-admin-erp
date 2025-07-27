"use client";

import { useState, useEffect } from "react";
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

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  created_at: string;
  created_by?: string;
  metadata?: any;
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

  useEffect(() => {
    loadTimeline();
  }, [opportunityId]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      
      // Por ahora simulamos datos de timeline
      // En una implementación real, consultaríamos una tabla de eventos/actividades
      const mockEvents: TimelineEvent[] = [
        {
          id: '1',
          type: 'created',
          title: 'Oportunidad creada',
          description: 'La oportunidad fue creada en el pipeline',
          created_at: '2025-01-15T09:00:00Z',
          created_by: 'Juan Pérez'
        },
        {
          id: '2',
          type: 'stage_change',
          title: 'Cambio de etapa',
          description: 'Movida de "Contacto Inicial" a "Reunión Agendada"',
          created_at: '2025-01-16T14:30:00Z',
          created_by: 'María García'
        },
        {
          id: '3',
          type: 'call',
          title: 'Llamada telefónica',
          description: 'Llamada de seguimiento con el cliente. Mostró interés en la propuesta.',
          created_at: '2025-01-18T10:15:00Z',
          created_by: 'Juan Pérez'
        },
        {
          id: '4',
          type: 'email',
          title: 'Email enviado',
          description: 'Enviada cotización inicial por correo electrónico',
          created_at: '2025-01-20T16:45:00Z',
          created_by: 'María García'
        },
        {
          id: '5',
          type: 'meeting',
          title: 'Reunión programada',
          description: 'Reunión de presentación agendada para el 25 de enero',
          created_at: '2025-01-22T11:20:00Z',
          created_by: 'Juan Pérez'
        }
      ];
      
      setEvents(mockEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar la línea de tiempo');
    } finally {
      setLoading(false);
    }
  };

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
        created_by: 'Usuario Actual' // En una implementación real, obtendríamos del contexto de usuario
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
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
    }
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
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {event.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                    {event.created_by && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {event.created_by}
                      </div>
                    )}
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
