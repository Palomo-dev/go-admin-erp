'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import {
  Loader2,
  Briefcase,
  Code,
  Building2,
  DollarSign,
  FileText,
  ToggleLeft,
  GraduationCap,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface JobPositionCreateFormData {
  name: string;
  code: string;
  description: string;
  department_id: string | null;
  level: string;
  min_salary: number | null;
  max_salary: number | null;
  requirements: Record<string, any>;
  is_active: boolean;
}

interface JobPositionCreateFormProps {
  onSubmit: (data: JobPositionCreateFormData) => Promise<void>;
  onCancel: () => void;
  departments: DepartmentOption[];
  levels: string[];
  isLoading?: boolean;
  validateCode?: (code: string) => Promise<boolean>;
}

const DEFAULT_LEVELS = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'C-Level'];

export function JobPositionCreateForm({
  onSubmit,
  onCancel,
  departments,
  levels,
  isLoading,
  validateCode,
}: JobPositionCreateFormProps) {
  const [formData, setFormData] = useState<JobPositionCreateFormData>({
    name: '',
    code: '',
    description: '',
    department_id: null,
    level: '',
    min_salary: null,
    max_salary: null,
    requirements: {},
    is_active: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Combinar niveles existentes con los predeterminados
  const allLevels = Array.from(new Set([...DEFAULT_LEVELS, ...levels])).sort();

  // Validar código único con debounce
  useEffect(() => {
    if (!formData.code || formData.code.length < 2) {
      setCodeStatus('idle');
      return;
    }

    const timer = setTimeout(async () => {
      if (validateCode) {
        setCodeStatus('checking');
        try {
          const isUnique = await validateCode(formData.code);
          setCodeStatus(isUnique ? 'valid' : 'invalid');
          if (!isUnique) {
            setErrors((prev) => ({ ...prev, code: 'Este código ya está en uso' }));
          } else {
            setErrors((prev) => {
              const { code, ...rest } = prev;
              return rest;
            });
          }
        } catch {
          setCodeStatus('idle');
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.code, validateCode]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    } else if (formData.name.length < 2) {
      newErrors.name = 'El nombre debe tener al menos 2 caracteres';
    }

    if (formData.code && formData.code.length < 2) {
      newErrors.code = 'El código debe tener al menos 2 caracteres';
    }

    if (codeStatus === 'invalid') {
      newErrors.code = 'Este código ya está en uso';
    }

    if (formData.min_salary !== null && formData.max_salary !== null) {
      if (formData.min_salary > formData.max_salary) {
        newErrors.min_salary = 'El salario mínimo no puede ser mayor al máximo';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setSubmitSuccess(true);
    } catch (error: any) {
      setSubmitError(error.message || 'Error al crear el cargo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const upperValue = value.toUpperCase().replace(/[^A-Z0-9-_]/g, '');
    setFormData({ ...formData, code: upperValue });
  };

  const handleSalaryChange = (field: 'min_salary' | 'max_salary', value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setFormData({ ...formData, [field]: numValue });
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
              ¡Cargo Creado!
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              El cargo &quot;{formData.name}&quot; se ha creado correctamente.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFormData({
                    name: '',
                    code: '',
                    description: '',
                    department_id: null,
                    level: '',
                    min_salary: null,
                    max_salary: null,
                    requirements: {},
                    is_active: true,
                  });
                  setSubmitSuccess(false);
                }}
              >
                Crear Otro
              </Button>
              <Button onClick={onCancel}>
                Volver a Lista
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

      {/* Información Básica */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Información Básica
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Datos principales del cargo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
              Nombre del Cargo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Desarrollador Senior"
              className={cn(
                'bg-white dark:bg-gray-900',
                errors.name && 'border-red-500 focus:ring-red-500'
              )}
              disabled={isLoading || isSubmitting}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Código */}
          <div className="space-y-2">
            <Label htmlFor="code" className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Code className="h-4 w-4" />
              Código Único
            </Label>
            <div className="relative">
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="Ej: DEV-SR"
                className={cn(
                  'font-mono uppercase bg-white dark:bg-gray-900 pr-10',
                  errors.code && 'border-red-500 focus:ring-red-500',
                  codeStatus === 'valid' && 'border-green-500'
                )}
                disabled={isLoading || isSubmitting}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {codeStatus === 'checking' && (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
                {codeStatus === 'valid' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {codeStatus === 'invalid' && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>
            {errors.code ? (
              <p className="text-xs text-red-500">{errors.code}</p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Identificador único. Solo letras, números y guiones.
              </p>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Descripción
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe las funciones y responsabilidades del cargo..."
              rows={3}
              className="bg-white dark:bg-gray-900"
              disabled={isLoading || isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      {/* Departamento y Nivel */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Building2 className="h-5 w-5 text-blue-600" />
            Departamento y Nivel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Departamento */}
          <div className="space-y-2">
            <Label htmlFor="department_id" className="text-gray-700 dark:text-gray-300">
              Departamento
            </Label>
            <Select
              value={formData.department_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, department_id: value === 'none' ? null : value })
              }
              disabled={isLoading || isSubmitting}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin departamento asignado</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Nivel */}
          <div className="space-y-2">
            <Label htmlFor="level" className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Nivel
            </Label>
            <Select
              value={formData.level || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, level: value === 'none' ? '' : value })
              }
              disabled={isLoading || isSubmitting}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin nivel definido</SelectItem>
                {allLevels.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Rango Salarial */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Rango Salarial
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Define el rango salarial para este cargo (opcional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_salary" className="text-gray-700 dark:text-gray-300">
                Salario Mínimo
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="min_salary"
                  type="number"
                  value={formData.min_salary ?? ''}
                  onChange={(e) => handleSalaryChange('min_salary', e.target.value)}
                  placeholder="0"
                  className={cn(
                    'pl-9 bg-white dark:bg-gray-900',
                    errors.min_salary && 'border-red-500'
                  )}
                  disabled={isLoading || isSubmitting}
                  min="0"
                  step="1000"
                />
              </div>
              {errors.min_salary && (
                <p className="text-xs text-red-500">{errors.min_salary}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_salary" className="text-gray-700 dark:text-gray-300">
                Salario Máximo
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="max_salary"
                  type="number"
                  value={formData.max_salary ?? ''}
                  onChange={(e) => handleSalaryChange('max_salary', e.target.value)}
                  placeholder="0"
                  className="pl-9 bg-white dark:bg-gray-900"
                  disabled={isLoading || isSubmitting}
                  min="0"
                  step="1000"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estado */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <ToggleLeft className="h-5 w-5 text-blue-600" />
            Estado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <div>
              <Label htmlFor="is_active" className="text-gray-900 dark:text-white font-medium">
                Cargo Activo
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Los cargos inactivos no aparecen en listados ni pueden asignarse a empleados
              </p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              disabled={isLoading || isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isLoading || codeStatus === 'checking'}
          className="min-w-[120px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creando...
            </>
          ) : (
            'Crear Cargo'
          )}
        </Button>
      </div>
    </form>
  );
}

export default JobPositionCreateForm;
