'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RotateCw,
  AlertCircle,
  Save,
  Plus,
  Minus,
  Calendar,
} from 'lucide-react';
import type { ShiftRotation, RotationDayPattern, CreateShiftRotationDTO } from '@/lib/services/shiftRotationsService';
import { ShiftRotationsService } from '@/lib/services/shiftRotationsService';

interface TemplateOption {
  id: string;
  name: string;
  color: string | null;
}

interface RotationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rotation?: ShiftRotation | null;
  templates: TemplateOption[];
  onSubmit: (data: CreateShiftRotationDTO) => Promise<void>;
}

export function RotationForm({
  open,
  onOpenChange,
  rotation,
  templates,
  onSubmit,
}: RotationFormProps) {
  const isEdit = !!rotation;
  const presets = ShiftRotationsService.getPresetPatterns();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cycle_days: 7,
    pattern: [] as RotationDayPattern[],
    is_active: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>('');

  // Reset form
  useEffect(() => {
    if (open) {
      if (rotation) {
        setFormData({
          name: rotation.name,
          description: rotation.description || '',
          cycle_days: rotation.cycle_days,
          pattern: rotation.pattern,
          is_active: rotation.is_active,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          cycle_days: 7,
          pattern: [],
          is_active: true,
        });
        setSelectedPreset('');
      }
      setError(null);
      if (templates.length > 0) {
        setDefaultTemplateId(templates[0].id);
      }
    }
  }, [open, rotation, templates]);

  // Generate pattern when cycle_days changes
  useEffect(() => {
    if (!isEdit && formData.cycle_days > 0 && formData.pattern.length !== formData.cycle_days) {
      const newPattern: RotationDayPattern[] = [];
      for (let i = 0; i < formData.cycle_days; i++) {
        newPattern.push({
          day: i + 1,
          shift_template_id: null,
          is_off: true,
        });
      }
      setFormData((prev) => ({ ...prev, pattern: newPattern }));
    }
  }, [formData.cycle_days, formData.pattern.length, isEdit]);

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = presets.find((p) => p.name === presetName);
    if (preset && defaultTemplateId) {
      const pattern = ShiftRotationsService.generatePattern(
        preset.cycleDays,
        preset.workDays,
        defaultTemplateId
      );
      setFormData((prev) => ({
        ...prev,
        name: prev.name || preset.name,
        description: prev.description || preset.description,
        cycle_days: preset.cycleDays,
        pattern,
      }));
    }
  };

  const handlePatternDayChange = (index: number, templateId: string | null) => {
    const newPattern = [...formData.pattern];
    newPattern[index] = {
      ...newPattern[index],
      shift_template_id: templateId,
      is_off: templateId === null,
    };
    setFormData({ ...formData, pattern: newPattern });
  };

  const handleCycleDaysChange = (days: number) => {
    if (days < 1 || days > 60) return;

    const newPattern: RotationDayPattern[] = [];
    for (let i = 0; i < days; i++) {
      if (i < formData.pattern.length) {
        newPattern.push({ ...formData.pattern[i], day: i + 1 });
      } else {
        newPattern.push({ day: i + 1, shift_template_id: null, is_off: true });
      }
    }
    setFormData({ ...formData, cycle_days: days, pattern: newPattern });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    if (formData.pattern.length === 0) {
      setError('Debes definir al menos un día en el patrón');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: formData.name,
        description: formData.description || undefined,
        cycle_days: formData.cycle_days,
        pattern: formData.pattern,
        is_active: formData.is_active,
      });
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTemplateColor = (templateId: string | null) => {
    if (!templateId) return null;
    return templates.find((t) => t.id === templateId)?.color || '#3b82f6';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <RotateCw className="h-5 w-5 text-blue-600" />
            {isEdit ? 'Editar Rotación' : 'Nueva Rotación'}
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Define el patrón de rotación de turnos
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Presets */}
          {!isEdit && (
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Plantilla Rápida</Label>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.name}
                    type="button"
                    variant={selectedPreset === preset.name ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePresetChange(preset.name)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
              {!isEdit && templates.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-gray-500">Turno por defecto para plantillas:</Label>
                  <Select value={defaultTemplateId} onValueChange={setDefaultTemplateId}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-gray-900 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: t.color || '#3b82f6' }}
                            />
                            {t.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Nombre y Descripción */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Rotación 4x4"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Días del Ciclo</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCycleDaysChange(formData.cycle_days - 1)}
                  disabled={formData.cycle_days <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={formData.cycle_days}
                  onChange={(e) => handleCycleDaysChange(parseInt(e.target.value) || 1)}
                  min="1"
                  max="60"
                  className="bg-white dark:bg-gray-900 text-center w-20"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCycleDaysChange(formData.cycle_days + 1)}
                  disabled={formData.cycle_days >= 60}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ej: 4 días trabajo, 4 días libres"
              rows={2}
              className="bg-white dark:bg-gray-900"
            />
          </div>

          {/* Pattern Editor */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Editor de Patrón
            </Label>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="grid grid-cols-7 gap-2">
                {formData.pattern.map((day, idx) => (
                  <div key={idx} className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Día {day.day}</div>
                    <Select
                      value={day.shift_template_id || 'off'}
                      onValueChange={(val) =>
                        handlePatternDayChange(idx, val === 'off' ? null : val)
                      }
                    >
                      <SelectTrigger
                        className="h-12 p-1"
                        style={{
                          backgroundColor: day.is_off
                            ? undefined
                            : getTemplateColor(day.shift_template_id) || '#3b82f6',
                          color: day.is_off ? undefined : 'white',
                        }}
                      >
                        <SelectValue>
                          {day.is_off ? (
                            <span className="text-xs">Libre</span>
                          ) : (
                            <span className="text-xs">
                              {templates.find((t) => t.id === day.shift_template_id)?.name?.substring(0, 6) || 'Turno'}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">
                          <span className="text-gray-500">Día Libre</span>
                        </SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: t.color || '#3b82f6' }}
                              />
                              {t.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                <span>
                  {formData.pattern.filter((d) => !d.is_off).length} días trabajo
                </span>
                <span>
                  {formData.pattern.filter((d) => d.is_off).length} días libres
                </span>
              </div>
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
                  {isEdit ? 'Guardar Cambios' : 'Crear Rotación'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RotationForm;
