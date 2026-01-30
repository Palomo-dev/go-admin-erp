'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Calendar, AlertTriangle } from 'lucide-react';
import type { CreateLeaveRequestDTO } from '@/lib/services/leaveRequestsService';

interface LeaveType {
  id: string;
  code: string;
  name: string;
  color: string | null;
}

interface Employee {
  id: string;
  name: string;
  code: string | null;
}

interface LeaveBalance {
  leave_type_id: string;
  available: number;
}

interface LeaveRequestFormProps {
  leaveTypes: LeaveType[];
  employees: Employee[];
  balances: LeaveBalance[];
  preselectedEmployeeId?: string;
  onSubmit: (data: CreateLeaveRequestDTO) => Promise<void>;
  onCancel: () => void;
  onCheckOverlap?: (employeeId: string, startDate: string, endDate: string) => Promise<boolean>;
  isLoading?: boolean;
  isSelfService?: boolean;
}

export function LeaveRequestForm({
  leaveTypes,
  employees,
  balances,
  preselectedEmployeeId,
  onSubmit,
  onCancel,
  onCheckOverlap,
  isLoading,
  isSelfService = false,
}: LeaveRequestFormProps) {
  const [formData, setFormData] = useState<CreateLeaveRequestDTO>({
    employment_id: preselectedEmployeeId || '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    start_half_day: false,
    end_half_day: false,
    total_days: 0,
    reason: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOverlap, setHasOverlap] = useState(false);
  const [availableDays, setAvailableDays] = useState<number | null>(null);

  // Calculate total days when dates change
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      
      if (end >= start) {
        let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        // Adjust for half days
        if (formData.start_half_day) days -= 0.5;
        if (formData.end_half_day) days -= 0.5;
        
        setFormData((prev) => ({ ...prev, total_days: days }));
      }
    }
  }, [formData.start_date, formData.end_date, formData.start_half_day, formData.end_half_day]);

  // Check overlap when dates change
  useEffect(() => {
    if (formData.employment_id && formData.start_date && formData.end_date && onCheckOverlap) {
      const checkOverlap = async () => {
        const overlap = await onCheckOverlap(
          formData.employment_id,
          formData.start_date,
          formData.end_date
        );
        setHasOverlap(overlap);
      };
      checkOverlap();
    }
  }, [formData.employment_id, formData.start_date, formData.end_date, onCheckOverlap]);

  // Update available days when employee or leave type changes
  useEffect(() => {
    if (formData.employment_id && formData.leave_type_id) {
      const balance = balances.find(
        (b) => b.leave_type_id === formData.leave_type_id
      );
      setAvailableDays(balance?.available ?? null);
    } else {
      setAvailableDays(null);
    }
  }, [formData.employment_id, formData.leave_type_id, balances]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.employment_id) {
      setError('Selecciona un empleado');
      return;
    }

    if (!formData.leave_type_id) {
      setError('Selecciona un tipo de ausencia');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      setError('Selecciona las fechas');
      return;
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setError('La fecha de fin debe ser posterior a la de inicio');
      return;
    }

    if (availableDays !== null && formData.total_days > availableDays) {
      setError(`No tienes suficientes días disponibles. Disponible: ${availableDays}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err: any) {
      setError(err.message || 'Error al crear la solicitud');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedLeaveType = leaveTypes.find((t) => t.id === formData.leave_type_id);

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Calendar className="h-5 w-5 text-blue-600" />
            Nueva Solicitud de Ausencia
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Completa el formulario para solicitar días de ausencia
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {hasOverlap && (
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                Ya existe una solicitud para estas fechas
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {!isSelfService && (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Empleado *</Label>
                <Select
                  value={formData.employment_id}
                  onValueChange={(value) => setFormData({ ...formData, employment_id: value })}
                  disabled={!!preselectedEmployeeId}
                >
                  <SelectTrigger className="bg-white dark:bg-gray-900">
                    <SelectValue placeholder="Seleccionar empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} {emp.code && `(${emp.code})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tipo de Ausencia *</Label>
              <Select
                value={formData.leave_type_id}
                onValueChange={(value) => setFormData({ ...formData, leave_type_id: value })}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        {type.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                        )}
                        {type.code} - {type.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableDays !== null && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Días disponibles: <span className="font-medium text-green-600">{availableDays}</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio *</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="bg-white dark:bg-gray-900"
              />
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  id="start_half"
                  checked={formData.start_half_day}
                  onCheckedChange={(checked) => setFormData({ ...formData, start_half_day: checked })}
                />
                <Label htmlFor="start_half" className="text-sm text-gray-600 dark:text-gray-400">
                  Medio día
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Fin *</Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                min={formData.start_date}
                className="bg-white dark:bg-gray-900"
              />
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  id="end_half"
                  checked={formData.end_half_day}
                  onCheckedChange={(checked) => setFormData({ ...formData, end_half_day: checked })}
                />
                <Label htmlFor="end_half" className="text-sm text-gray-600 dark:text-gray-400">
                  Medio día
                </Label>
              </div>
            </div>
          </div>

          {formData.total_days > 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-blue-700 dark:text-blue-400">
                Total: <span className="font-bold text-lg">{formData.total_days}</span> día(s)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Razón / Comentarios</Label>
            <Textarea
              value={formData.reason || ''}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Describe la razón de tu ausencia..."
              className="min-h-[100px] bg-white dark:bg-gray-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isLoading || hasOverlap}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Enviar Solicitud
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
