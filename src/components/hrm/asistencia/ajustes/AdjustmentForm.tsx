'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Loader2, Save, FileText, Upload } from 'lucide-react';
import type { CreateAdjustmentDTO, AdjustmentType } from '@/lib/services/timesheetAdjustmentsService';

interface TimesheetOption {
  id: string;
  label: string;
}

interface AdjustmentFormProps {
  timesheets: TimesheetOption[];
  preselectedTimesheetId?: string;
  onSubmit: (data: CreateAdjustmentDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string }[] = [
  { value: 'add_time', label: 'Agregar tiempo' },
  { value: 'remove_time', label: 'Restar tiempo' },
  { value: 'change_check_in', label: 'Cambiar hora de entrada' },
  { value: 'change_check_out', label: 'Cambiar hora de salida' },
  { value: 'add_break', label: 'Agregar tiempo de descanso' },
  { value: 'other', label: 'Otro' },
];

export function AdjustmentForm({
  timesheets,
  preselectedTimesheetId,
  onSubmit,
  onCancel,
  isLoading,
}: AdjustmentFormProps) {
  const [formData, setFormData] = useState<CreateAdjustmentDTO>({
    timesheet_id: preselectedTimesheetId || '',
    adjustment_type: 'add_time',
    minutes_delta: 0,
    reason: '',
  });

  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.timesheet_id) {
      setError('Selecciona un timesheet');
      return;
    }

    if (!formData.reason.trim()) {
      setError('Ingresa una razón para el ajuste');
      return;
    }

    // Calculate total minutes delta
    let totalMinutes = hours * 60 + minutes;
    if (formData.adjustment_type === 'remove_time' || formData.adjustment_type === 'add_break') {
      totalMinutes = -totalMinutes;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        minutes_delta: totalMinutes,
      });
    } catch (err: any) {
      setError(err.message || 'Error al crear el ajuste');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showTimeDelta = ['add_time', 'remove_time', 'add_break'].includes(formData.adjustment_type);
  const showTimeChange = ['change_check_in', 'change_check_out'].includes(formData.adjustment_type);

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FileText className="h-5 w-5 text-blue-600" />
            Nuevo Ajuste de Timesheet
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Solicita un ajuste al registro de tiempo
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timesheet" className="text-gray-700 dark:text-gray-300">
                Timesheet *
              </Label>
              <Select
                value={formData.timesheet_id}
                onValueChange={(value) => setFormData({ ...formData, timesheet_id: value })}
                disabled={!!preselectedTimesheetId}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar timesheet" />
                </SelectTrigger>
                <SelectContent>
                  {timesheets.map((ts) => (
                    <SelectItem key={ts.id} value={ts.id}>
                      {ts.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="text-gray-700 dark:text-gray-300">
                Tipo de Ajuste *
              </Label>
              <Select
                value={formData.adjustment_type}
                onValueChange={(value) => setFormData({ ...formData, adjustment_type: value as AdjustmentType })}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showTimeDelta && (
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Tiempo a {formData.adjustment_type === 'add_time' ? 'agregar' : 'restar'}
              </Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(parseInt(e.target.value) || 0)}
                    className="w-20 bg-white dark:bg-gray-900"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">horas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
                    className="w-20 bg-white dark:bg-gray-900"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">minutos</span>
                </div>
              </div>
            </div>
          )}

          {showTimeChange && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="previousValue" className="text-gray-700 dark:text-gray-300">
                  Hora Anterior
                </Label>
                <Input
                  type="time"
                  value={formData.previous_value || ''}
                  onChange={(e) => setFormData({ ...formData, previous_value: e.target.value })}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newValue" className="text-gray-700 dark:text-gray-300">
                  Nueva Hora
                </Label>
                <Input
                  type="time"
                  value={formData.new_value || ''}
                  onChange={(e) => setFormData({ ...formData, new_value: e.target.value })}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-gray-700 dark:text-gray-300">
              Razón del Ajuste *
            </Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Describe la razón del ajuste..."
              className="min-h-[100px] bg-white dark:bg-gray-900"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Crear Ajuste
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
