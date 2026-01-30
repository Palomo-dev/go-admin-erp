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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Settings, Repeat, Calendar } from 'lucide-react';
import { GymClass, Instructor } from '@/lib/services/gymService';
import { Branch } from '@/types/branch';
import { cn } from '@/utils/Utils';

export interface RecurrenceConfig {
  enabled: boolean;
  type: 'daily' | 'weekly' | 'monthly';
  days: number[]; // 0=domingo, 1=lunes, etc.
  until?: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lun', fullLabel: 'Lunes' },
  { value: 2, label: 'Mar', fullLabel: 'Martes' },
  { value: 3, label: 'Mié', fullLabel: 'Miércoles' },
  { value: 4, label: 'Jue', fullLabel: 'Jueves' },
  { value: 5, label: 'Vie', fullLabel: 'Viernes' },
  { value: 6, label: 'Sáb', fullLabel: 'Sábado' },
  { value: 0, label: 'Dom', fullLabel: 'Domingo' },
];

interface ClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gymClass?: GymClass | null;
  onSave: (data: Partial<GymClass>) => Promise<void>;
  prefilledDate?: Date | null;
  branches?: Branch[];
  instructors?: Instructor[];
}

const CLASS_TYPES = [
  { value: 'spinning', label: 'Spinning' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'crossfit', label: 'CrossFit' },
  { value: 'zumba', label: 'Zumba' },
  { value: 'boxing', label: 'Boxeo' },
  { value: 'functional', label: 'Funcional' },
  { value: 'stretching', label: 'Estiramiento' },
  { value: 'aerobics', label: 'Aeróbicos' },
  { value: 'swimming', label: 'Natación' },
  { value: 'other', label: 'Otro' },
];

const DIFFICULTY_LEVELS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
  { value: 'all_levels', label: 'Todos los niveles' },
];

const DEFAULT_RECURRENCE: RecurrenceConfig = {
  enabled: false,
  type: 'weekly',
  days: [],
  until: '',
};

export function ClassDialog({ 
  open, 
  onOpenChange, 
  gymClass, 
  onSave,
  prefilledDate,
  branches = [],
  instructors = [],
}: ClassDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    class_type: 'other' as GymClass['class_type'],
    capacity: 20,
    duration_minutes: 60,
    start_date: '',
    start_time: '',
    end_time: '',
    room: '',
    difficulty_level: 'all_levels' as GymClass['difficulty_level'],
    equipment_needed: '',
    branch_id: '',
    instructor_id: '',
  });
  const [recurrence, setRecurrence] = useState<RecurrenceConfig>(DEFAULT_RECURRENCE);

  // Calcular hora de fin desde hora de inicio + duración
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    if (!startTime) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  // Calcular duración desde hora de inicio y fin
  const calculateDuration = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 60;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let duration = (endH * 60 + endM) - (startH * 60 + startM);
    if (duration <= 0) duration += 24 * 60; // Si termina al día siguiente
    return Math.max(15, Math.min(duration, 480)); // Entre 15 min y 8 horas
  };

  // Handler para cambio de hora de inicio
  const handleStartTimeChange = (newStartTime: string) => {
    const newEndTime = calculateEndTime(newStartTime, formData.duration_minutes);
    setFormData({ ...formData, start_time: newStartTime, end_time: newEndTime });
  };

  // Handler para cambio de duración
  const handleDurationChange = (newDuration: number) => {
    const newEndTime = calculateEndTime(formData.start_time, newDuration);
    setFormData({ ...formData, duration_minutes: newDuration, end_time: newEndTime });
  };

  // Handler para cambio de hora de fin
  const handleEndTimeChange = (newEndTime: string) => {
    const newDuration = calculateDuration(formData.start_time, newEndTime);
    setFormData({ ...formData, end_time: newEndTime, duration_minutes: newDuration });
  };

  useEffect(() => {
    if (gymClass) {
      const startAt = new Date(gymClass.start_at);
      const duration = gymClass.duration_minutes || 60;
      const startTime = startAt.toTimeString().slice(0, 5);
      setFormData({
        title: gymClass.title || '',
        description: gymClass.description || '',
        class_type: gymClass.class_type || 'other',
        capacity: gymClass.capacity || 20,
        duration_minutes: duration,
        start_date: startAt.toISOString().split('T')[0],
        start_time: startTime,
        end_time: calculateEndTime(startTime, duration),
        room: gymClass.room || gymClass.location || '',
        difficulty_level: gymClass.difficulty_level || 'all_levels',
        equipment_needed: gymClass.equipment_needed || '',
        branch_id: gymClass.branch_id?.toString() || '',
        instructor_id: gymClass.instructor_id || '',
      });
      // Cargar recurrencia si existe
      if (gymClass.recurrence && typeof gymClass.recurrence === 'object') {
        const rec = gymClass.recurrence as Record<string, unknown>;
        setRecurrence({
          enabled: true,
          type: (rec.type as RecurrenceConfig['type']) ?? 'weekly',
          days: (rec.days as number[]) ?? [],
          until: (rec.until as string) ?? '',
        });
      } else {
        setRecurrence(DEFAULT_RECURRENCE);
      }
    } else {
      // Usar fecha prellenada si existe, si no usar ahora + 1 hora
      const dateToUse = prefilledDate || new Date();
      if (!prefilledDate) {
        dateToUse.setHours(dateToUse.getHours() + 1, 0, 0, 0);
      }
      const startTime = dateToUse.toTimeString().slice(0, 5);
      const defaultDuration = 60;
      setFormData({
        title: '',
        description: '',
        class_type: 'other',
        capacity: 20,
        duration_minutes: defaultDuration,
        start_date: dateToUse.toISOString().split('T')[0],
        start_time: startTime,
        end_time: calculateEndTime(startTime, defaultDuration),
        room: '',
        difficulty_level: 'all_levels',
        equipment_needed: '',
        branch_id: branches.length === 1 ? branches[0].id.toString() : '',
        instructor_id: '',
      });
      setRecurrence(DEFAULT_RECURRENCE);
    }
    setActiveTab('general');
  }, [gymClass, open, prefilledDate, branches]);

  const toggleDayOfWeek = (day: number) => {
    setRecurrence((prev: RecurrenceConfig) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d: number) => d !== day)
        : [...prev.days, day].sort((a, b) => a - b)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.start_date || !formData.start_time) return;

    setIsLoading(true);
    try {
      const startAt = new Date(`${formData.start_date}T${formData.start_time}`);
      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + formData.duration_minutes);

      await onSave({
        title: formData.title,
        description: formData.description || undefined,
        class_type: formData.class_type,
        capacity: formData.capacity,
        duration_minutes: formData.duration_minutes,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        room: formData.room || undefined,
        difficulty_level: formData.difficulty_level,
        equipment_needed: formData.equipment_needed || undefined,
        branch_id: formData.branch_id ? parseInt(formData.branch_id) : undefined,
        instructor_id: formData.instructor_id || undefined,
        recurrence: recurrence.enabled ? {
          type: recurrence.type,
          days: recurrence.days,
          until: recurrence.until || undefined,
        } : undefined,
      });
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {gymClass ? 'Editar Clase' : 'Nueva Clase'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="recurrence" className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Repetición
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 max-h-[55vh] overflow-y-auto pr-2">
              <TabsContent value="general" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label htmlFor="title">Nombre de la Clase *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Ej: Spinning Intensivo"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="class_type">Tipo de Clase *</Label>
                    <Select
                      value={formData.class_type}
                      onValueChange={(value) => setFormData({ ...formData, class_type: value as GymClass['class_type'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="difficulty_level">Dificultad</Label>
                    <Select
                      value={formData.difficulty_level || 'all_levels'}
                      onValueChange={(value) => setFormData({ ...formData, difficulty_level: value as GymClass['difficulty_level'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {branches.length > 0 && (
                    <div>
                      <Label htmlFor="branch_id">Sede</Label>
                      <Select
                        value={formData.branch_id}
                        onValueChange={(value) => setFormData({ ...formData, branch_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar sede" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id.toString()}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {instructors.length > 0 && (
                    <div>
                      <Label htmlFor="instructor_id">Instructor</Label>
                      <Select
                        value={formData.instructor_id}
                        onValueChange={(value) => setFormData({ ...formData, instructor_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar instructor" />
                        </SelectTrigger>
                        <SelectContent>
                          {instructors.map((instructor) => (
                            <SelectItem key={instructor.user_id} value={instructor.user_id}>
                              {instructor.profiles?.first_name} {instructor.profiles?.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <Label htmlFor="start_date">Fecha *</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="start_time">Hora de Inicio *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="end_time">Hora de Fin *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => handleEndTimeChange(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="duration_minutes">Duración (minutos)</Label>
                    <Input
                      id="duration_minutes"
                      type="number"
                      min={15}
                      max={480}
                      value={formData.duration_minutes}
                      onChange={(e) => handleDurationChange(parseInt(e.target.value) || 60)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {Math.floor(formData.duration_minutes / 60)}h {formData.duration_minutes % 60}min
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="capacity">Capacidad</Label>
                    <Input
                      id="capacity"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 20 })}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor="room">Sala / Ubicación</Label>
                    <Input
                      id="room"
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="Ej: Sala de Spinning"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor="equipment_needed">Equipo Necesario</Label>
                    <Input
                      id="equipment_needed"
                      value={formData.equipment_needed}
                      onChange={(e) => setFormData({ ...formData, equipment_needed: e.target.value })}
                      placeholder="Ej: Bicicleta, toalla, agua"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descripción de la clase..."
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="recurrence" className="space-y-4 mt-0">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Programación Recurrente</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Repetir esta clase automáticamente
                    </p>
                  </div>
                  <Switch
                    checked={recurrence.enabled}
                    onCheckedChange={(checked) => setRecurrence({ ...recurrence, enabled: checked })}
                  />
                </div>

                {recurrence.enabled && (
                  <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                      <Label>Frecuencia</Label>
                      <Select
                        value={recurrence.type}
                        onValueChange={(value) => setRecurrence({ 
                          ...recurrence, 
                          type: value as RecurrenceConfig['type'] 
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diario</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {recurrence.type === 'weekly' && (
                      <div>
                        <Label className="mb-2 block">Días de la Semana</Label>
                        <div className="flex flex-wrap gap-2">
                          {DAYS_OF_WEEK.map((day) => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleDayOfWeek(day.value)}
                              className={cn(
                                "w-10 h-10 rounded-full text-sm font-medium transition-colors",
                                recurrence.days.includes(day.value)
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                              )}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                        {recurrence.days.length === 0 && (
                          <p className="text-xs text-orange-500 mt-2">
                            Selecciona al menos un día
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <Label htmlFor="until">Repetir hasta (opcional)</Label>
                      <Input
                        id="until"
                        type="date"
                        value={recurrence.until || ''}
                        onChange={(e) => setRecurrence({ ...recurrence, until: e.target.value })}
                        min={formData.start_date}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Dejar vacío para repetir indefinidamente
                      </p>
                    </div>

                    {recurrence.enabled && recurrence.type === 'weekly' && recurrence.days.length > 0 && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <Calendar className="h-4 w-4 inline mr-2" />
                          La clase se repetirá cada semana los días:{' '}
                          <strong>
                            {recurrence.days
                              .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.fullLabel)
                              .join(', ')}
                          </strong>
                          {recurrence.until && (
                            <> hasta el <strong>{new Date(recurrence.until).toLocaleDateString('es-ES')}</strong></>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.title || (recurrence.enabled && recurrence.type === 'weekly' && recurrence.days.length === 0)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {gymClass ? 'Guardar Cambios' : 'Crear Clase'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
