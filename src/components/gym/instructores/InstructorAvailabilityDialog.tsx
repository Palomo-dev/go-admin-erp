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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Calendar,
  Clock,
  Plus,
  Trash2,
  Loader2,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { Instructor } from '@/lib/services/gymService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

interface InstructorAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Instructor | null;
}

interface TimeSlot {
  id: string;
  start: string;
  end: string;
}

interface DayAvailability {
  enabled: boolean;
  slots: TimeSlot[];
}

interface WeekAvailability {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

const defaultDayAvailability: DayAvailability = {
  enabled: false,
  slots: []
};

const defaultWeekAvailability: WeekAvailability = {
  monday: { enabled: true, slots: [{ id: '1', start: '06:00', end: '22:00' }] },
  tuesday: { enabled: true, slots: [{ id: '1', start: '06:00', end: '22:00' }] },
  wednesday: { enabled: true, slots: [{ id: '1', start: '06:00', end: '22:00' }] },
  thursday: { enabled: true, slots: [{ id: '1', start: '06:00', end: '22:00' }] },
  friday: { enabled: true, slots: [{ id: '1', start: '06:00', end: '22:00' }] },
  saturday: { enabled: false, slots: [] },
  sunday: { enabled: false, slots: [] },
};

const dayLabels: Record<keyof WeekAvailability, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const timeOptions = Array.from({ length: 34 }, (_, i) => {
  const hour = Math.floor(i / 2) + 5;
  const minute = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minute}`;
});

export function InstructorAvailabilityDialog({ open, onOpenChange, instructor }: InstructorAvailabilityDialogProps) {
  const { organization } = useOrganization();
  const [availability, setAvailability] = useState<WeekAvailability>(defaultWeekAvailability);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && instructor) {
      loadAvailability();
    }
  }, [open, instructor]);

  const loadAvailability = async () => {
    if (!instructor || !organization?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('settings')
        .eq('organization_id', organization.id)
        .eq('key', `instructor_availability_${instructor.user_id}`)
        .single();

      if (data?.settings) {
        setAvailability(data.settings as WeekAvailability);
      } else {
        setAvailability(defaultWeekAvailability);
      }
    } catch (error) {
      console.error('Error cargando disponibilidad:', error);
      setAvailability(defaultWeekAvailability);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAvailability = async () => {
    if (!instructor || !organization?.id) return;
    setIsSaving(true);
    try {
      const key = `instructor_availability_${instructor.user_id}`;
      
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('key', key)
        .single();

      if (existing) {
        await supabase
          .from('settings')
          .update({ settings: availability, updated_at: new Date().toISOString() })
          .eq('organization_id', organization.id)
          .eq('key', key);
      } else {
        await supabase.from('settings').insert({
          organization_id: organization.id,
          key,
          settings: availability,
        });
      }

      toast.success('Disponibilidad guardada correctamente');
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando disponibilidad:', error);
      toast.error('Error al guardar la disponibilidad');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (day: keyof WeekAvailability) => {
    setAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled,
        slots: !prev[day].enabled ? [{ id: Date.now().toString(), start: '06:00', end: '22:00' }] : []
      }
    }));
  };

  const addSlot = (day: keyof WeekAvailability) => {
    setAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, { id: Date.now().toString(), start: '09:00', end: '17:00' }]
      }
    }));
  };

  const removeSlot = (day: keyof WeekAvailability, slotId: string) => {
    setAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.filter(s => s.id !== slotId)
      }
    }));
  };

  const updateSlot = (day: keyof WeekAvailability, slotId: string, field: 'start' | 'end', value: string) => {
    setAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.map(s => s.id === slotId ? { ...s, [field]: value } : s)
      }
    }));
  };

  if (!instructor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Disponibilidad de {instructor.profiles?.first_name} {instructor.profiles?.last_name}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Define los horarios en los que el instructor está disponible para impartir clases.
            </p>

            {(Object.keys(dayLabels) as Array<keyof WeekAvailability>).map((day) => (
              <Card key={day} className="bg-gray-50 dark:bg-gray-900">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={availability[day].enabled}
                        onCheckedChange={() => toggleDay(day)}
                      />
                      <Label className="font-medium">{dayLabels[day]}</Label>
                    </div>
                    {availability[day].enabled && (
                      <Badge variant="outline" className="text-xs">
                        {availability[day].slots.length} horario(s)
                      </Badge>
                    )}
                  </div>

                  {availability[day].enabled && (
                    <div className="space-y-2 mt-3">
                      {availability[day].slots.map((slot) => (
                        <div key={slot.id} className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <Select
                            value={slot.start}
                            onValueChange={(v) => updateSlot(day, slot.id, 'start', v)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {timeOptions.map((time) => (
                                <SelectItem key={time} value={time}>{time}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-gray-400">a</span>
                          <Select
                            value={slot.end}
                            onValueChange={(v) => updateSlot(day, slot.id, 'end', v)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {timeOptions.map((time) => (
                                <SelectItem key={time} value={time}>{time}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {availability[day].slots.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              onClick={() => removeSlot(day, slot.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-600 hover:text-blue-700"
                        onClick={() => addSlot(day)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar horario
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={saveAvailability} 
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
