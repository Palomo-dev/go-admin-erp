'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Loader2, Clock } from 'lucide-react';
import { 
  RouteSchedule, 
  TransportRoute, 
  ScheduleInput,
} from '@/lib/services/transportRoutesService';

interface Vehicle {
  id: string;
  plate_number: string;
  model?: string;
  capacity_passengers?: number;
}

interface Driver {
  id: string;
  license_number: string;
  license_category?: string;
}

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: RouteSchedule | null;
  routes: TransportRoute[];
  vehicles: Vehicle[];
  drivers: Driver[];
  onSave: (data: ScheduleInput) => Promise<void>;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  routes,
  vehicles,
  drivers,
  onSave,
}: ScheduleDialogProps) {
  const isEditing = !!schedule;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<ScheduleInput>({
    route_id: '',
    schedule_name: '',
    recurrence_type: 'daily',
    days_of_week: [],
    specific_dates: [],
    departure_time: '08:00',
    arrival_time: '',
    default_vehicle_id: undefined,
    default_driver_id: undefined,
    available_seats: undefined,
    fare_override: undefined,
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: undefined,
    is_active: true,
  });

  useEffect(() => {
    if (schedule) {
      setFormData({
        route_id: schedule.route_id,
        schedule_name: schedule.schedule_name || '',
        recurrence_type: schedule.recurrence_type,
        days_of_week: schedule.days_of_week || [],
        specific_dates: schedule.specific_dates || [],
        departure_time: schedule.departure_time,
        arrival_time: schedule.arrival_time || '',
        default_vehicle_id: schedule.default_vehicle_id,
        default_driver_id: schedule.default_driver_id,
        available_seats: schedule.available_seats,
        fare_override: schedule.fare_override,
        valid_from: schedule.valid_from,
        valid_until: schedule.valid_until,
        is_active: schedule.is_active,
      });
    } else {
      setFormData({
        route_id: '',
        schedule_name: '',
        recurrence_type: 'daily',
        days_of_week: [],
        specific_dates: [],
        departure_time: '08:00',
        arrival_time: '',
        default_vehicle_id: undefined,
        default_driver_id: undefined,
        available_seats: undefined,
        fare_override: undefined,
        valid_from: new Date().toISOString().split('T')[0],
        valid_until: undefined,
        is_active: true,
      });
    }
  }, [schedule, open]);

  const handleDayToggle = (day: number) => {
    const currentDays = formData.days_of_week || [];
    if (currentDays.includes(day)) {
      setFormData({ ...formData, days_of_week: currentDays.filter((d) => d !== day) });
    } else {
      setFormData({ ...formData, days_of_week: [...currentDays, day].sort() });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.route_id || !formData.departure_time) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving schedule:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Horario' : 'Nuevo Horario'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los datos del horario' : 'Programa un nuevo horario de salida'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ruta y Nombre */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ruta *</Label>
              <Select
                value={formData.route_id}
                onValueChange={(value) => setFormData({ ...formData, route_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ruta" />
                </SelectTrigger>
                <SelectContent>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.name} ({route.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule_name">Nombre del horario</Label>
              <Input
                id="schedule_name"
                value={formData.schedule_name}
                onChange={(e) => setFormData({ ...formData, schedule_name: e.target.value })}
                placeholder="Ej: Mañana Express"
              />
            </div>
          </div>

          {/* Recurrencia */}
          <div className="space-y-4">
            <Label>Tipo de recurrencia *</Label>
            <Select
              value={formData.recurrence_type}
              onValueChange={(value: 'daily' | 'weekly' | 'specific_dates') => 
                setFormData({ ...formData, recurrence_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diario</SelectItem>
                <SelectItem value="weekly">Días específicos de la semana</SelectItem>
                <SelectItem value="specific_dates">Fechas específicas</SelectItem>
              </SelectContent>
            </Select>

            {formData.recurrence_type === 'weekly' && (
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <label
                    key={day.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      formData.days_of_week?.includes(day.value)
                        ? 'bg-blue-100 border-blue-500 dark:bg-blue-900/30'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Checkbox
                      checked={formData.days_of_week?.includes(day.value)}
                      onCheckedChange={() => handleDayToggle(day.value)}
                    />
                    <span className="text-sm">{day.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Horarios */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departure_time">Hora de salida *</Label>
              <Input
                id="departure_time"
                type="time"
                value={formData.departure_time}
                onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrival_time">Hora de llegada</Label>
              <Input
                id="arrival_time"
                type="time"
                value={formData.arrival_time}
                onChange={(e) => setFormData({ ...formData, arrival_time: e.target.value })}
              />
            </div>
          </div>

          {/* Vehículo y Conductor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vehículo por defecto</Label>
              <Select
                value={formData.default_vehicle_id || '__none__'}
                onValueChange={(value) => 
                  setFormData({ ...formData, default_vehicle_id: value === '__none__' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate_number} {vehicle.model && `- ${vehicle.model}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conductor por defecto</Label>
              <Select
                value={formData.default_driver_id || '__none__'}
                onValueChange={(value) => 
                  setFormData({ ...formData, default_driver_id: value === '__none__' ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.license_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cupos y Tarifa */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="seats">Cupos disponibles</Label>
              <Input
                id="seats"
                type="number"
                min={0}
                value={formData.available_seats || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  available_seats: e.target.value ? parseInt(e.target.value) : undefined 
                })}
                placeholder="Según vehículo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fare">Tarifa override</Label>
              <Input
                id="fare"
                type="number"
                min={0}
                value={formData.fare_override || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  fare_override: e.target.value ? parseFloat(e.target.value) : undefined 
                })}
                placeholder="Usar tarifa de ruta"
              />
            </div>
          </div>

          {/* Vigencia */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valid_from">Válido desde *</Label>
              <Input
                id="valid_from"
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valid_until">Válido hasta</Label>
              <Input
                id="valid_until"
                type="date"
                value={formData.valid_until || ''}
                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value || undefined })}
              />
            </div>
          </div>

          {/* Estado activo */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label>Estado del horario</Label>
              <p className="text-sm text-gray-500">Los horarios inactivos no generan viajes</p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
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
              disabled={isSubmitting || !formData.route_id || !formData.departure_time}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Horario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
