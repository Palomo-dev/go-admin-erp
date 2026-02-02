'use client';

import { useState, useEffect } from 'react';
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
import { Loader2, Clock, MapPin, Play, Square, AlertTriangle } from 'lucide-react';
import { tripsService } from '@/lib/services/tripsService';

interface Stop {
  id: string;
  name: string;
  city?: string;
}

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  organizationId: number;
  stops?: Stop[];
  onSuccess: () => void;
}

const EVENT_TYPES = [
  { value: 'boarding_started', label: 'Abordaje Iniciado', icon: Clock },
  { value: 'departure', label: 'Salida', icon: Play },
  { value: 'stop_arrived', label: 'Llegada a Parada', icon: MapPin },
  { value: 'stop_departed', label: 'Salida de Parada', icon: MapPin },
  { value: 'delay', label: 'Retraso', icon: AlertTriangle },
  { value: 'arrival', label: 'Llegada Final', icon: Square },
  { value: 'completed', label: 'Viaje Completado', icon: Square },
];

export function AddEventDialog({
  open,
  onOpenChange,
  tripId,
  organizationId,
  stops = [],
  onSuccess,
}: AddEventDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    event_type: '',
    stop_id: '',
    description: '',
    location_text: '',
    event_time: '',
  });

  useEffect(() => {
    if (open) {
      const now = new Date();
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setFormData({
        event_type: '',
        stop_id: '',
        description: '',
        location_text: '',
        event_time: localDateTime,
      });
    }
  }, [open]);

  const needsStop = ['stop_arrived', 'stop_departed'].includes(formData.event_type);

  const handleSubmit = async () => {
    if (!formData.event_type) return;

    setIsSubmitting(true);
    try {
      await tripsService.createEvent({
        organization_id: organizationId,
        reference_type: 'trip',
        reference_id: tripId,
        event_type: formData.event_type,
        event_time: formData.event_time ? new Date(formData.event_time).toISOString() : undefined,
        stop_id: formData.stop_id || undefined,
        description: formData.description || undefined,
        location_text: formData.location_text || undefined,
        source: 'internal' as const,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating event:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Registrar Evento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event_type">Tipo de Evento *</Label>
            <Select
              value={formData.event_type}
              onValueChange={(v) => setFormData((p) => ({ ...p, event_type: v, stop_id: '' }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="h-4 w-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_time">Fecha y Hora</Label>
            <Input
              id="event_time"
              type="datetime-local"
              value={formData.event_time}
              onChange={(e) => setFormData((p) => ({ ...p, event_time: e.target.value }))}
            />
          </div>

          {needsStop && stops.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="stop">Parada</Label>
              <Select
                value={formData.stop_id || '__none__'}
                onValueChange={(v) => setFormData((p) => ({ ...p, stop_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar parada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin parada específica</SelectItem>
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      {stop.name} {stop.city && `(${stop.city})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.event_type === 'delay' && (
            <div className="space-y-2">
              <Label htmlFor="location">Ubicación del retraso</Label>
              <Input
                id="location"
                placeholder="Ej: Km 45 vía principal"
                value={formData.location_text}
                onChange={(e) => setFormData((p) => ({ ...p, location_text: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Descripción / Notas</Label>
            <Textarea
              id="description"
              placeholder="Detalles adicionales del evento..."
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.event_type}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Evento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
