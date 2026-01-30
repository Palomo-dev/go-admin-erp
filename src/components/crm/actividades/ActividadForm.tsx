'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Activity,
  ActivityType,
  RelatedType,
  ACTIVITY_TYPE_CONFIG,
  CreateActivityInput,
  UpdateActivityInput,
} from './types';

interface ActividadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity | null;
  customers: { id: string; full_name: string; email?: string }[];
  opportunities: { id: string; title: string }[];
  onSave: (data: CreateActivityInput | UpdateActivityInput) => Promise<void>;
  isLoading?: boolean;
}

export function ActividadForm({
  open,
  onOpenChange,
  activity,
  customers,
  opportunities,
  onSave,
  isLoading,
}: ActividadFormProps) {
  const [activityType, setActivityType] = useState<ActivityType>('note');
  const [notes, setNotes] = useState('');
  const [relatedType, setRelatedType] = useState<RelatedType | ''>('');
  const [relatedId, setRelatedId] = useState('');
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());

  useEffect(() => {
    if (activity) {
      setActivityType(activity.activity_type);
      setNotes(activity.notes || '');
      setRelatedType(activity.related_type || '');
      setRelatedId(activity.related_id || '');
      setOccurredAt(new Date(activity.occurred_at));
    } else {
      setActivityType('note');
      setNotes('');
      setRelatedType('');
      setRelatedId('');
      setOccurredAt(new Date());
    }
  }, [activity, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateActivityInput | UpdateActivityInput = {
      activity_type: activityType,
      notes: notes || undefined,
      related_type: relatedType || undefined,
      related_id: relatedId || undefined,
      occurred_at: occurredAt.toISOString(),
    };

    await onSave(data);
  };

  const isEditing = !!activity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            {isEditing ? 'Editar Actividad' : 'Nueva Actividad'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de actividad */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Tipo de actividad *
            </Label>
            <Select value={activityType} onValueChange={(v) => setActivityType(v as ActivityType)}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTIVITY_TYPE_CONFIG)
                  .filter(([key]) => key !== 'system')
                  .map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha y hora */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Fecha y hora
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(occurredAt, "PPP 'a las' HH:mm", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={occurredAt}
                  onSelect={(date) => date && setOccurredAt(date)}
                  locale={es}
                  initialFocus
                />
                <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                  <Input
                    type="time"
                    value={format(occurredAt, 'HH:mm')}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':');
                      const newDate = new Date(occurredAt);
                      newDate.setHours(parseInt(hours), parseInt(minutes));
                      setOccurredAt(newDate);
                    }}
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Relacionar con */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Relacionar con
              </Label>
              <Select
                value={relatedType || 'none'}
                onValueChange={(v) => {
                  setRelatedType(v === 'none' ? '' : v as RelatedType);
                  setRelatedId('');
                }}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Ninguno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  <SelectItem value="customer">Cliente</SelectItem>
                  <SelectItem value="opportunity">Oportunidad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {relatedType && (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  {relatedType === 'customer' ? 'Cliente' : 'Oportunidad'}
                </Label>
                <Select value={relatedId} onValueChange={setRelatedId}>
                  <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {relatedType === 'customer'
                      ? customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name}
                          </SelectItem>
                        ))
                      : opportunities.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.title}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Notas / Descripción
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe la actividad..."
              rows={4}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>

          <DialogFooter>
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
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : isEditing ? (
                'Actualizar'
              ) : (
                'Crear Actividad'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
