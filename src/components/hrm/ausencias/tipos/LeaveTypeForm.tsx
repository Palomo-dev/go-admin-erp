'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Calendar } from 'lucide-react';
import type { LeaveType, CreateLeaveTypeDTO, UpdateLeaveTypeDTO } from '@/lib/services/leaveTypesService';

interface LeaveTypeFormProps {
  leaveType?: LeaveType | null;
  onSubmit: (data: CreateLeaveTypeDTO | UpdateLeaveTypeDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function LeaveTypeForm({
  leaveType,
  onSubmit,
  onCancel,
  isLoading,
}: LeaveTypeFormProps) {
  const isEditing = !!leaveType;

  const [formData, setFormData] = useState<CreateLeaveTypeDTO>({
    code: '',
    name: '',
    description: '',
    paid: true,
    affects_attendance: true,
    requires_document: false,
    requires_approval: true,
    max_days_per_year: undefined,
    max_consecutive_days: undefined,
    min_notice_days: 0,
    accrues_monthly: false,
    accrual_rate: undefined,
    can_carry_over: false,
    max_carry_over_days: undefined,
    color: '#3B82F6',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leaveType) {
      setFormData({
        code: leaveType.code,
        name: leaveType.name,
        description: leaveType.description || '',
        paid: leaveType.paid,
        affects_attendance: leaveType.affects_attendance,
        requires_document: leaveType.requires_document,
        requires_approval: leaveType.requires_approval,
        max_days_per_year: leaveType.max_days_per_year || undefined,
        max_consecutive_days: leaveType.max_consecutive_days || undefined,
        min_notice_days: leaveType.min_notice_days,
        accrues_monthly: leaveType.accrues_monthly,
        accrual_rate: leaveType.accrual_rate || undefined,
        can_carry_over: leaveType.can_carry_over,
        max_carry_over_days: leaveType.max_carry_over_days || undefined,
        color: leaveType.color || '#3B82F6',
      });
    }
  }, [leaveType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code.trim()) {
      setError('El código es requerido');
      return;
    }

    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Calendar className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Tipo de Ausencia' : 'Nuevo Tipo de Ausencia'}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Código *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="VAC"
                className="bg-white dark:bg-gray-900"
                maxLength={10}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-gray-700 dark:text-gray-300">Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Vacaciones"
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción del tipo de ausencia..."
              className="bg-white dark:bg-gray-900"
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="text-gray-700 dark:text-gray-300">Color</Label>
            <Input
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-16 h-10 p-1 cursor-pointer"
            />
          </div>

          {/* Options Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <Label className="text-sm text-gray-700 dark:text-gray-300">Pagado</Label>
              <Switch
                checked={formData.paid}
                onCheckedChange={(checked) => setFormData({ ...formData, paid: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <Label className="text-sm text-gray-700 dark:text-gray-300">Afecta Asistencia</Label>
              <Switch
                checked={formData.affects_attendance}
                onCheckedChange={(checked) => setFormData({ ...formData, affects_attendance: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <Label className="text-sm text-gray-700 dark:text-gray-300">Requiere Documento</Label>
              <Switch
                checked={formData.requires_document}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_document: checked })}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <Label className="text-sm text-gray-700 dark:text-gray-300">Requiere Aprobación</Label>
              <Switch
                checked={formData.requires_approval}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_approval: checked })}
              />
            </div>
          </div>

          {/* Limits */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Máx. Días/Año</Label>
              <Input
                type="number"
                min="0"
                value={formData.max_days_per_year || ''}
                onChange={(e) => setFormData({ ...formData, max_days_per_year: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Sin límite"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Máx. Días Consecutivos</Label>
              <Input
                type="number"
                min="0"
                value={formData.max_consecutive_days || ''}
                onChange={(e) => setFormData({ ...formData, max_consecutive_days: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Sin límite"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Días Aviso Previo</Label>
              <Input
                type="number"
                min="0"
                value={formData.min_notice_days}
                onChange={(e) => setFormData({ ...formData, min_notice_days: Number(e.target.value) || 0 })}
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          {/* Accrual */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 dark:text-gray-300">Acumulación Mensual</Label>
              <Switch
                checked={formData.accrues_monthly}
                onCheckedChange={(checked) => setFormData({ ...formData, accrues_monthly: checked })}
              />
            </div>
            {formData.accrues_monthly && (
              <div className="space-y-2">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Tasa de Acumulación (días/mes)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.accrual_rate || ''}
                  onChange={(e) => setFormData({ ...formData, accrual_rate: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="1.25"
                  className="bg-white dark:bg-gray-800 w-32"
                />
              </div>
            )}
          </div>

          {/* Carry Over */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 dark:text-gray-300">Permite Arrastre</Label>
              <Switch
                checked={formData.can_carry_over}
                onCheckedChange={(checked) => setFormData({ ...formData, can_carry_over: checked })}
              />
            </div>
            {formData.can_carry_over && (
              <div className="space-y-2">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Máx. Días Arrastre</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.max_carry_over_days || ''}
                  onChange={(e) => setFormData({ ...formData, max_carry_over_days: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Sin límite"
                  className="bg-white dark:bg-gray-800 w-32"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isEditing ? 'Actualizar' : 'Crear'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
