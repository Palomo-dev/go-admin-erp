'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { format, addDays, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Building2,
  AlertTriangle,
  Plus,
  CalendarRange,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export interface ShiftTemplateOption {
  id: string;
  name: string;
  code: string | null;
  start_time: string;
  end_time: string;
  color: string | null;
}

export interface EmployeeOption {
  id: string;
  name: string;
  code: string | null;
  branch_id: number | null;
}

export interface BranchOption {
  id: number;
  name: string;
}

export interface ShiftCreateFormData {
  employment_id: string;
  shift_template_id: string;
  branch_id: number | null;
  work_date: string;
  work_date_end?: string; // Para rango de fechas
  notes: string;
}

interface ConflictInfo {
  hasConflict: boolean;
  conflictType?: string;
  conflictInfo?: string;
}

interface ShiftCreateFormProps {
  onSubmit: (data: ShiftCreateFormData) => Promise<void>;
  onCancel: () => void;
  templates: ShiftTemplateOption[];
  employees: EmployeeOption[];
  branches: BranchOption[];
  checkConflict?: (employmentId: string, workDate: string) => Promise<ConflictInfo>;
  isLoading?: boolean;
}

export function ShiftCreateForm({
  onSubmit,
  onCancel,
  templates,
  employees,
  branches,
  checkConflict,
  isLoading,
}: ShiftCreateFormProps) {
  const [formData, setFormData] = useState<ShiftCreateFormData>({
    employment_id: '',
    shift_template_id: '',
    branch_id: null,
    work_date: format(new Date(), 'yyyy-MM-dd'),
    work_date_end: '',
    notes: '',
  });
  const [useRangeMode, setUseRangeMode] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  // Verificar conflictos cuando cambian empleado o fecha
  useEffect(() => {
    if (!formData.employment_id || !formData.work_date || !checkConflict) {
      setConflict(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingConflict(true);
      try {
        const result = await checkConflict(formData.employment_id, formData.work_date);
        setConflict(result);
      } catch (error: any) {
        // Silently handle conflict check errors - not critical
        setConflict(null);
      } finally {
        setCheckingConflict(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.employment_id, formData.work_date, checkConflict]);

  // Auto-asignar sede del empleado
  useEffect(() => {
    if (formData.employment_id) {
      const employee = employees.find((e) => e.id === formData.employment_id);
      if (employee?.branch_id && !formData.branch_id) {
        setFormData((prev) => ({ ...prev, branch_id: employee.branch_id }));
      }
    }
  }, [formData.employment_id, formData.branch_id, employees]);

  const selectedTemplate = templates.find((t) => t.id === formData.shift_template_id);
  const selectedEmployee = employees.find((e) => e.id === formData.employment_id);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.employment_id) {
      newErrors.employment_id = 'Selecciona un empleado';
    }

    if (!formData.shift_template_id) {
      newErrors.shift_template_id = 'Selecciona un turno';
    }

    if (!formData.work_date) {
      newErrors.work_date = 'Selecciona una fecha';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    if (conflict?.hasConflict) {
      setSubmitError('No se puede crear el turno: ' + conflict.conflictInfo);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setSubmitSuccess(true);
    } catch (error: any) {
      setSubmitError(error.message || 'Error al crear el turno');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              ¡Turno Creado!
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              El turno se ha asignado correctamente a {selectedEmployee?.name}.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onCancel}>
                Volver al Calendario
              </Button>
              <Button
                onClick={() => {
                  setFormData({
                    employment_id: '',
                    shift_template_id: '',
                    branch_id: null,
                    work_date: format(addDays(new Date(formData.work_date), 1), 'yyyy-MM-dd'),
                    notes: '',
                  });
                  setSubmitSuccess(false);
                  setConflict(null);
                }}
              >
                Crear Otro Turno
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error general */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Conflicto */}
      {conflict?.hasConflict && (
        <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 dark:text-yellow-300">
            <strong>Conflicto detectado:</strong> {conflict.conflictInfo}
          </AlertDescription>
        </Alert>
      )}

      {/* Datos del Turno */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Clock className="h-5 w-5 text-blue-600" />
            Asignación de Turno
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Selecciona el empleado, turno y fecha para la asignación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Empleado */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Empleado <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.employment_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, employment_id: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger
                className={cn(
                  'bg-white dark:bg-gray-900',
                  errors.employment_id && 'border-red-500'
                )}
              >
                <SelectValue placeholder="Seleccionar empleado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar empleado...</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      {emp.name} {emp.code && <span className="text-xs text-gray-500">({emp.code})</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employment_id && (
              <p className="text-xs text-red-500">{errors.employment_id}</p>
            )}
          </div>

          {/* Plantilla de Turno */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 dark:text-gray-300">
                Tipo de Turno <span className="text-red-500">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-blue-600 hover:text-blue-700"
                onClick={() => window.open('/app/hrm/turnos/tipos/nuevo', '_blank')}
              >
                <Plus className="h-3 w-3 mr-1" />
                Crear nuevo tipo
              </Button>
            </div>
            <Select
              value={formData.shift_template_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, shift_template_id: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger
                className={cn(
                  'bg-white dark:bg-gray-900',
                  errors.shift_template_id && 'border-red-500'
                )}
              >
                <SelectValue placeholder="Seleccionar turno..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar turno...</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      {template.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: template.color }}
                        />
                      )}
                      <span>{template.name}</span>
                      <span className="text-xs text-gray-500">
                        ({template.start_time.substring(0, 5)} - {template.end_time.substring(0, 5)})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay tipos de turno. <a href="/app/hrm/turnos/tipos/nuevo" target="_blank" className="underline">Crear uno</a>
              </p>
            )}
            {errors.shift_template_id && (
              <p className="text-xs text-red-500">{errors.shift_template_id}</p>
            )}
          </div>

          {/* Preview del turno seleccionado */}
          {selectedTemplate && (
            <div
              className="p-3 rounded-lg border-l-4"
              style={{
                backgroundColor: selectedTemplate.color ? `${selectedTemplate.color}15` : '#3b82f615',
                borderLeftColor: selectedTemplate.color || '#3b82f6',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {selectedTemplate.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedTemplate.code && `Código: ${selectedTemplate.code}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg text-gray-900 dark:text-white">
                    {selectedTemplate.start_time.substring(0, 5)}
                  </p>
                  <p className="font-mono text-lg text-gray-900 dark:text-white">
                    {selectedTemplate.end_time.substring(0, 5)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Toggle para modo rango */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-blue-600" />
              <Label className="text-sm text-gray-700 dark:text-gray-300">
                Asignar múltiples días
              </Label>
            </div>
            <Switch
              checked={useRangeMode}
              onCheckedChange={(checked) => {
                setUseRangeMode(checked);
                if (!checked) {
                  setFormData({ ...formData, work_date_end: '' });
                }
              }}
            />
          </div>

          <div className={cn("grid gap-4", useRangeMode ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2")}>
            {/* Fecha Inicio */}
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                {useRangeMode ? 'Fecha Inicio' : 'Fecha'} <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-white dark:bg-gray-900',
                      !formData.work_date && 'text-muted-foreground',
                      errors.work_date && 'border-red-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.work_date
                      ? format(new Date(formData.work_date), "EEEE, d 'de' MMMM yyyy", { locale: es })
                      : 'Seleccionar fecha'}
                    {checkingConflict && (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.work_date ? new Date(formData.work_date) : undefined}
                    onSelect={(date: Date | undefined) =>
                      setFormData({
                        ...formData,
                        work_date: date ? format(date, 'yyyy-MM-dd') : '',
                      })
                    }
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
              {errors.work_date && (
                <p className="text-xs text-red-500">{errors.work_date}</p>
              )}
            </div>

            {/* Fecha Fin (solo en modo rango) */}
            {useRangeMode ? (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Fecha Fin <span className="text-red-500">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal bg-white dark:bg-gray-900',
                        !formData.work_date_end && 'text-muted-foreground',
                        errors.work_date_end && 'border-red-500'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.work_date_end
                        ? format(new Date(formData.work_date_end), "EEEE, d 'de' MMMM yyyy", { locale: es })
                        : 'Seleccionar fecha fin'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.work_date_end ? new Date(formData.work_date_end) : undefined}
                      onSelect={(date: Date | undefined) =>
                        setFormData({
                          ...formData,
                          work_date_end: date ? format(date, 'yyyy-MM-dd') : '',
                        })
                      }
                      disabled={(date) => formData.work_date ? date < new Date(formData.work_date) : false}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
                {errors.work_date_end && (
                  <p className="text-xs text-red-500">{errors.work_date_end}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Sede</Label>
                <Select
                  value={formData.branch_id?.toString() || 'none'}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      branch_id: value === 'none' ? null : parseInt(value),
                    })
                  }
                >
                  <SelectTrigger className="bg-white dark:bg-gray-900">
                    <SelectValue placeholder="Seleccionar sede..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          {branch.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Sede (cuando está en modo rango) */}
          {useRangeMode && (
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Sede</Label>
              <Select
                value={formData.branch_id?.toString() || 'none'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    branch_id: value === 'none' ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar sede..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        {branch.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Resumen de días seleccionados */}
          {useRangeMode && formData.work_date && formData.work_date_end && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <CalendarRange className="inline h-4 w-4 mr-1" />
                Se crearán turnos para <strong>
                  {eachDayOfInterval({
                    start: new Date(formData.work_date),
                    end: new Date(formData.work_date_end),
                  }).length}
                </strong> días (del {format(new Date(formData.work_date), "d 'de' MMMM", { locale: es })} al {format(new Date(formData.work_date_end), "d 'de' MMMM yyyy", { locale: es })})
              </p>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Notas</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Agregar notas adicionales..."
              rows={2}
              className="bg-white dark:bg-gray-900"
            />
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isLoading || checkingConflict || conflict?.hasConflict}
          className="min-w-[150px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creando...
            </>
          ) : (
            'Crear Turno'
          )}
        </Button>
      </div>
    </form>
  );
}

export default ShiftCreateForm;
