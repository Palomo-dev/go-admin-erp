'use client';

import { useState, useEffect } from 'react';
import type { CreatePeriodDTO } from '@/lib/services/payrollService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Calendar, Save, X, Loader2 } from 'lucide-react';

interface PeriodFormProps {
  frequencies: { value: string; label: string }[];
  onSubmit: (data: CreatePeriodDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PeriodForm({
  frequencies,
  onSubmit,
  onCancel,
  isLoading,
}: PeriodFormProps) {
  const [formData, setFormData] = useState<CreatePeriodDTO>({
    name: '',
    period_start: '',
    period_end: '',
    payment_date: '',
    frequency: 'monthly',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Auto-calculate dates based on frequency
  useEffect(() => {
    if (formData.frequency && !formData.period_start) {
      const today = new Date();
      let start: Date;
      let end: Date;

      if (formData.frequency === 'monthly') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      } else if (formData.frequency === 'biweekly') {
        if (today.getDate() <= 15) {
          start = new Date(today.getFullYear(), today.getMonth(), 1);
          end = new Date(today.getFullYear(), today.getMonth(), 15);
        } else {
          start = new Date(today.getFullYear(), today.getMonth(), 16);
          end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }
      } else {
        const dayOfWeek = today.getDay();
        start = new Date(today);
        start.setDate(today.getDate() - dayOfWeek + 1);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
      }

      const paymentDate = new Date(end);
      paymentDate.setDate(paymentDate.getDate() + 5);

      setFormData(prev => ({
        ...prev,
        period_start: start.toISOString().split('T')[0],
        period_end: end.toISOString().split('T')[0],
        payment_date: paymentDate.toISOString().split('T')[0],
      }));
    }
  }, [formData.frequency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.period_start || !formData.period_end || !formData.frequency) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreatePeriodDTO, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Calendar className="h-5 w-5 text-blue-600" />
          Nuevo Periodo de Nómina
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure el periodo para cálculo de nómina
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Frequency */}
          <div className="space-y-2">
            <Label htmlFor="frequency" className="text-gray-700 dark:text-gray-300">
              Frecuencia de Pago *
            </Label>
            <Select
              value={formData.frequency}
              onValueChange={(value) => {
                setFormData(prev => ({
                  ...prev,
                  frequency: value,
                  period_start: '',
                  period_end: '',
                  payment_date: '',
                }));
              }}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Seleccionar frecuencia" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                {frequencies.map((freq) => (
                  <SelectItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
              Nombre del Periodo
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Se generará automáticamente si se deja vacío"
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period_start" className="text-gray-700 dark:text-gray-300">
                Fecha Inicio *
              </Label>
              <Input
                id="period_start"
                type="date"
                value={formData.period_start}
                onChange={(e) => handleChange('period_start', e.target.value)}
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end" className="text-gray-700 dark:text-gray-300">
                Fecha Fin *
              </Label>
              <Input
                id="period_end"
                type="date"
                value={formData.period_end}
                onChange={(e) => handleChange('period_end', e.target.value)}
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_date" className="text-gray-700 dark:text-gray-300">
                Fecha de Pago
              </Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleChange('payment_date', e.target.value)}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
              Notas
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Notas adicionales del periodo"
              rows={3}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !formData.period_start || !formData.period_end}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Crear Periodo
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
