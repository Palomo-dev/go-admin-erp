'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Clock,
  Moon,
  Coffee,
  DollarSign,
  Palette,
  AlertCircle,
  Save,
} from 'lucide-react';
import type { ShiftTemplate, CreateShiftTemplateDTO } from '@/lib/services/shiftTemplatesService';

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

interface TemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ShiftTemplate | null;
  onSubmit: (data: CreateShiftTemplateDTO) => Promise<void>;
  validateCode?: (code: string, excludeId?: string) => Promise<boolean>;
}

export function TemplateForm({
  open,
  onOpenChange,
  template,
  onSubmit,
  validateCode,
}: TemplateFormProps) {
  const isEdit = !!template;

  const [formData, setFormData] = useState<CreateShiftTemplateDTO>({
    code: '',
    name: '',
    start_time: '08:00',
    end_time: '17:00',
    break_minutes: 60,
    paid_break: false,
    is_night_shift: false,
    is_split_shift: false,
    color: '#3b82f6',
    overtime_multiplier: 1.25,
    night_multiplier: 1.35,
    is_active: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeValid, setCodeValid] = useState(true);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (template) {
        setFormData({
          code: template.code || '',
          name: template.name,
          start_time: template.start_time,
          end_time: template.end_time,
          break_minutes: template.break_minutes,
          paid_break: template.paid_break,
          is_night_shift: template.is_night_shift,
          is_split_shift: template.is_split_shift,
          color: template.color || '#3b82f6',
          overtime_multiplier: template.overtime_multiplier,
          night_multiplier: template.night_multiplier,
          is_active: template.is_active,
        });
      } else {
        setFormData({
          code: '',
          name: '',
          start_time: '08:00',
          end_time: '17:00',
          break_minutes: 60,
          paid_break: false,
          is_night_shift: false,
          is_split_shift: false,
          color: '#3b82f6',
          overtime_multiplier: 1.25,
          night_multiplier: 1.35,
          is_active: true,
        });
      }
      setError(null);
      setCodeValid(true);
    }
  }, [open, template]);

  // Validate code
  useEffect(() => {
    if (!formData.code || !validateCode) {
      setCodeValid(true);
      return;
    }

    const timer = setTimeout(async () => {
      const isValid = await validateCode(formData.code!, template?.id);
      setCodeValid(isValid);
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.code, template?.id, validateCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    if (!codeValid) {
      setError('El código ya está en uso');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-gray-800 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            {isEdit ? 'Editar Plantilla de Turno' : 'Nueva Plantilla de Turno'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Define los horarios y configuraciones del turno
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Nombre y Código */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Turno Mañana"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Código</Label>
              <Input
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value.toUpperCase() })
                }
                placeholder="MAÑANA"
                className={`bg-white dark:bg-gray-900 ${!codeValid ? 'border-red-500' : ''}`}
              />
              {!codeValid && (
                <p className="text-xs text-red-500">Código ya en uso</p>
              )}
            </div>
          </div>

          {/* Horarios */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Hora Inicio</Label>
              <Input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Hora Fin</Label>
              <Input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          {/* Descanso */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Descanso (minutos)</Label>
              <Input
                type="number"
                value={formData.break_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, break_minutes: parseInt(e.target.value) || 0 })
                }
                min="0"
                max="240"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="flex items-center justify-between pt-6">
              <Label className="text-gray-700 dark:text-gray-300">Descanso pagado</Label>
              <Switch
                checked={formData.paid_break}
                onCheckedChange={(checked) => setFormData({ ...formData, paid_break: checked })}
              />
            </div>
          </div>

          {/* Tipos de turno */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-indigo-500" />
                <Label className="text-gray-700 dark:text-gray-300">Nocturno</Label>
              </div>
              <Switch
                checked={formData.is_night_shift}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_night_shift: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Coffee className="h-4 w-4 text-orange-500" />
                <Label className="text-gray-700 dark:text-gray-300">Partido</Label>
              </div>
              <Switch
                checked={formData.is_split_shift}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_split_shift: checked })
                }
              />
            </div>
          </div>

          {/* Multiplicadores */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Mult. Horas Extra
              </Label>
              <Input
                type="number"
                value={formData.overtime_multiplier}
                onChange={(e) =>
                  setFormData({ ...formData, overtime_multiplier: parseFloat(e.target.value) || 1 })
                }
                min="1"
                max="3"
                step="0.05"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            {formData.is_night_shift && (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  <Moon className="h-4 w-4" />
                  Mult. Nocturno
                </Label>
                <Input
                  type="number"
                  value={formData.night_multiplier}
                  onChange={(e) =>
                    setFormData({ ...formData, night_multiplier: parseFloat(e.target.value) || 1 })
                  }
                  min="1"
                  max="3"
                  step="0.05"
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            )}
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <Palette className="h-4 w-4" />
              Color
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    formData.color === color
                      ? 'border-gray-900 dark:border-white scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-8 h-8 p-0 border-0 cursor-pointer"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isEdit ? 'Guardar Cambios' : 'Crear Plantilla'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default TemplateForm;
