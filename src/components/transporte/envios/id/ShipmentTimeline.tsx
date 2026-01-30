'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Clock,
  Plus,
  Package,
  Truck,
  MapPin,
  CheckCircle,
  XCircle,
  RotateCcw,
  FileCheck,
  AlertTriangle,
  Loader2,
  DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TransportEvent {
  id: string;
  event_type: string;
  event_time: string;
  description?: string;
  location_text?: string;
  transport_stops?: { id: string; name: string; city: string };
}

interface ShipmentTimelineProps {
  events: TransportEvent[];
  isLoading: boolean;
  canAddEvent: boolean;
  onAddEvent: (event: { event_type: string; description?: string; location_text?: string }) => Promise<void>;
}

const EVENT_TYPES = [
  { value: 'created', label: 'Creado', icon: Package, color: 'bg-gray-100 text-gray-800' },
  { value: 'received', label: 'Recibido en bodega', icon: Package, color: 'bg-blue-100 text-blue-800' },
  { value: 'picked', label: 'Preparado/Empacado', icon: Package, color: 'bg-indigo-100 text-indigo-800' },
  { value: 'dispatched', label: 'Despachado', icon: Truck, color: 'bg-purple-100 text-purple-800' },
  { value: 'in_transit', label: 'En tránsito', icon: Truck, color: 'bg-purple-100 text-purple-800' },
  { value: 'out_for_delivery', label: 'En reparto', icon: MapPin, color: 'bg-orange-100 text-orange-800' },
  { value: 'arrived', label: 'Llegó a destino', icon: MapPin, color: 'bg-indigo-100 text-indigo-800' },
  { value: 'delivered', label: 'Entregado', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  { value: 'failed_delivery', label: 'Entrega fallida', icon: XCircle, color: 'bg-red-100 text-red-800' },
  { value: 'returned', label: 'Devuelto', icon: RotateCcw, color: 'bg-orange-100 text-orange-800' },
  { value: 'cancelled', label: 'Cancelado', icon: XCircle, color: 'bg-gray-100 text-gray-500' },
  { value: 'pod_registered', label: 'POD registrado', icon: FileCheck, color: 'bg-green-100 text-green-800' },
  { value: 'cod_collected', label: 'COD cobrado', icon: DollarSign, color: 'bg-emerald-100 text-emerald-800' },
  { value: 'incident', label: 'Incidente', icon: AlertTriangle, color: 'bg-red-100 text-red-800' },
  { value: 'note', label: 'Nota', icon: Clock, color: 'bg-gray-100 text-gray-700' },
];

export function ShipmentTimeline({ events, isLoading, canAddEvent, onAddEvent }: ShipmentTimelineProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    event_type: 'note',
    description: '',
    location_text: '',
  });

  const handleSubmit = async () => {
    if (!formData.event_type) return;

    setIsSubmitting(true);
    try {
      await onAddEvent(formData);
      setShowDialog(false);
      setFormData({ event_type: 'note', description: '', location_text: '' });
    } catch (error) {
      console.error('Error adding event:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEventConfig = (eventType: string) => {
    return EVENT_TYPES.find(e => e.value === eventType) || EVENT_TYPES[EVENT_TYPES.length - 1];
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Timeline de Eventos ({events.length})
        </h3>
        {canAddEvent && (
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Evento
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No hay eventos registrados</p>
      ) : (
        <div className="relative pl-6 space-y-4">
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
          {events.map((event, index) => {
            const config = getEventConfig(event.event_type);
            const Icon = config.icon;
            const isLast = index === events.length - 1;

            return (
              <div key={event.id || index} className="relative">
                <div className={`absolute left-[-18px] w-4 h-4 rounded-full flex items-center justify-center ${isLast ? 'bg-blue-500' : 'bg-gray-400'}`}>
                  {isLast && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={config.color}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {format(new Date(event.event_time), "d MMM yyyy, HH:mm", { locale: es })}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{event.description}</p>
                  )}
                  {event.location_text && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {event.location_text}
                    </p>
                  )}
                  {event.transport_stops && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {event.transport_stops.name} - {event.transport_stops.city}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Evento</Label>
              <Select
                value={formData.event_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, event_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.filter(e => ['picked', 'dispatched', 'out_for_delivery', 'arrived', 'note'].includes(e.value)).map((type) => (
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
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descripción del evento..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Ubicación (opcional)</Label>
              <Input
                value={formData.location_text}
                onChange={(e) => setFormData((p) => ({ ...p, location_text: e.target.value }))}
                placeholder="Ej: Bogotá, Cra 10 # 20-30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
