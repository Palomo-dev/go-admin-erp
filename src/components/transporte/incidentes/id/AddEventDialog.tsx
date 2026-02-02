'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (eventData: {
    event_type: string;
    description: string;
    actor_type: string;
    location_text?: string;
  }) => Promise<void>;
}

const EVENT_TYPES = [
  { value: 'note', label: 'Nota / Comentario' },
  { value: 'update', label: 'Actualización' },
  { value: 'location', label: 'Actualización de ubicación' },
  { value: 'escalation', label: 'Escalamiento' },
  { value: 'evidence', label: 'Evidencia agregada' },
  { value: 'status_change', label: 'Cambio de estado' },
  { value: 'assigned', label: 'Asignación' },
  { value: 'other', label: 'Otro' },
];

const ACTOR_TYPES = [
  { value: 'user', label: 'Usuario del sistema' },
  { value: 'driver', label: 'Conductor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'customer', label: 'Cliente' },
  { value: 'external', label: 'Externo' },
  { value: 'system', label: 'Sistema' },
];

export function AddEventDialog({ open, onOpenChange, onSubmit }: AddEventDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventType, setEventType] = useState('note');
  const [actorType, setActorType] = useState('user');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');

  const handleSubmit = async () => {
    if (!description.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        event_type: eventType,
        description: description.trim(),
        actor_type: actorType,
        location_text: locationText.trim() || undefined,
      });
      
      // Reset form
      setEventType('note');
      setActorType('user');
      setDescription('');
      setLocationText('');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setEventType('note');
      setActorType('user');
      setDescription('');
      setLocationText('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600" />
            Agregar Entrada a Bitácora
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tipo de evento */}
          <div className="space-y-2">
            <Label htmlFor="event_type">Tipo de evento</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger id="event_type">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de actor */}
          <div className="space-y-2">
            <Label htmlFor="actor_type">Registrado por</Label>
            <Select value={actorType} onValueChange={setActorType}>
              <SelectTrigger id="actor_type">
                <SelectValue placeholder="Seleccionar actor" />
              </SelectTrigger>
              <SelectContent>
                {ACTOR_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el evento o la actualización..."
              rows={4}
            />
          </div>

          {/* Ubicación (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="location">Ubicación (opcional)</Label>
            <Input
              id="location"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="Ej: Km 45 Autopista Norte"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !description.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Agregar entrada'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
