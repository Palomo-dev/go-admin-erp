'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { HousekeepingTask } from '@/lib/services/housekeepingService';
import type { Space } from '@/lib/services/spacesService';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: HousekeepingTask | null;
  spaces: Space[];
  users: Array<{ id: string; email: string; name: string }>;
  onSave: (data: {
    space_id: string;
    task_date: string;
    notes?: string;
    assigned_to?: string;
    status?: 'pending' | 'in_progress' | 'done' | 'cancelled';
  }) => Promise<void>;
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  spaces,
  users,
  onSave,
}: TaskDialogProps) {
  const [spaceId, setSpaceId] = useState('');
  const [taskDate, setTaskDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('unassigned');
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'done' | 'cancelled'>('pending');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      setSpaceId(task.space_id);
      setTaskDate(new Date(task.task_date));
      setNotes(task.notes || '');
      setAssignedTo(task.assigned_to || 'unassigned');
      setStatus(task.status);
    } else {
      setSpaceId('');
      setTaskDate(new Date());
      setNotes('');
      setAssignedTo('unassigned');
      setStatus('pending');
    }
  }, [task, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSave({
        space_id: spaceId,
        task_date: taskDate.toISOString().split('T')[0],
        notes: notes || undefined,
        assigned_to: assignedTo === 'unassigned' ? undefined : assignedTo,
        status: task ? status : 'pending',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando tarea:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {task ? 'Editar Tarea' : 'Nueva Tarea de Limpieza'}
          </DialogTitle>
          <DialogDescription>
            {task
              ? 'Modifica los detalles de la tarea de limpieza.'
              : 'Crea una nueva tarea de limpieza para un espacio.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Espacio */}
          <div className="space-y-2">
            <Label htmlFor="space">Espacio *</Label>
            <Select value={spaceId} onValueChange={setSpaceId} required>
              <SelectTrigger id="space">
                <SelectValue placeholder="Seleccionar espacio" />
              </SelectTrigger>
              <SelectContent>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.label}
                    {space.space_types && ` - ${space.space_types.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-2">
            <Label>Fecha de la Tarea *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(taskDate, 'PPP', { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={taskDate}
                  onSelect={(date) => date && setTaskDate(date)}
                  initialFocus
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Asignar a */}
          <div className="space-y-2">
            <Label htmlFor="assigned">Asignar a</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger id="assigned">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} - {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estado (solo al editar) */}
          {task && (
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as 'pending' | 'in_progress' | 'done' | 'cancelled')}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="done">Completada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              placeholder="Notas adicionales sobre la limpieza..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
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
              disabled={isSubmitting || !spaceId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : task ? (
                'Guardar Cambios'
              ) : (
                'Crear Tarea'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
