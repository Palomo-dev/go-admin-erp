'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, MapPin } from 'lucide-react';
import { RouteStop, TransportStop, RouteStopInput } from '@/lib/services/transportRoutesService';

interface RouteStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeStop?: RouteStop | null;
  availableStops: TransportStop[];
  currentStopsCount: number;
  onSave: (data: RouteStopInput) => Promise<void>;
}

export function RouteStopDialog({
  open,
  onOpenChange,
  routeStop,
  availableStops,
  currentStopsCount,
  onSave,
}: RouteStopDialogProps) {
  const isEditing = !!routeStop;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<RouteStopInput>({
    stop_id: '',
    stop_order: currentStopsCount + 1,
    estimated_arrival_minutes: 0,
    estimated_departure_minutes: 0,
    dwell_time_minutes: 5,
    fare_from_origin: 0,
    is_boarding_allowed: true,
    is_alighting_allowed: true,
  });

  useEffect(() => {
    if (routeStop) {
      setFormData({
        stop_id: routeStop.stop_id,
        stop_order: routeStop.stop_order,
        estimated_arrival_minutes: routeStop.estimated_arrival_minutes || 0,
        estimated_departure_minutes: routeStop.estimated_departure_minutes || 0,
        dwell_time_minutes: routeStop.dwell_time_minutes || 5,
        fare_from_origin: routeStop.fare_from_origin || 0,
        is_boarding_allowed: routeStop.is_boarding_allowed,
        is_alighting_allowed: routeStop.is_alighting_allowed,
      });
    } else {
      setFormData({
        stop_id: '',
        stop_order: currentStopsCount + 1,
        estimated_arrival_minutes: 0,
        estimated_departure_minutes: 0,
        dwell_time_minutes: 5,
        fare_from_origin: 0,
        is_boarding_allowed: true,
        is_alighting_allowed: true,
      });
    }
  }, [routeStop, currentStopsCount, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.stop_id) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving route stop:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Parada' : 'Agregar Parada'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los datos de la parada en la ruta' : 'Agrega una parada al recorrido'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Parada *</Label>
            <Select
              value={formData.stop_id}
              onValueChange={(value) => setFormData({ ...formData, stop_id: value })}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar parada" />
              </SelectTrigger>
              <SelectContent>
                {availableStops.map((stop) => (
                  <SelectItem key={stop.id} value={stop.id}>
                    {stop.name} ({stop.city})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order">Orden</Label>
              <Input
                id="order"
                type="number"
                min={1}
                value={formData.stop_order}
                onChange={(e) => setFormData({ ...formData, stop_order: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dwell">Tiempo espera (min)</Label>
              <Input
                id="dwell"
                type="number"
                min={0}
                value={formData.dwell_time_minutes}
                onChange={(e) => setFormData({ ...formData, dwell_time_minutes: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="arrival">Llegada desde origen (min)</Label>
              <Input
                id="arrival"
                type="number"
                min={0}
                value={formData.estimated_arrival_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_arrival_minutes: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="departure">Salida desde origen (min)</Label>
              <Input
                id="departure"
                type="number"
                min={0}
                value={formData.estimated_departure_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_departure_minutes: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fare">Tarifa desde origen</Label>
            <Input
              id="fare"
              type="number"
              min={0}
              value={formData.fare_from_origin}
              onChange={(e) => setFormData({ ...formData, fare_from_origin: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label>Permite abordaje</Label>
              <Switch
                checked={formData.is_boarding_allowed}
                onCheckedChange={(checked) => setFormData({ ...formData, is_boarding_allowed: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Permite descenso</Label>
              <Switch
                checked={formData.is_alighting_allowed}
                onCheckedChange={(checked) => setFormData({ ...formData, is_alighting_allowed: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.stop_id}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
