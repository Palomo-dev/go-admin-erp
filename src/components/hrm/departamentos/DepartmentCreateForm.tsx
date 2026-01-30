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
  Building2,
  Code,
  Users,
  DollarSign,
  FileText,
  ToggleLeft,
  FolderTree,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

export interface DepartmentOption {
  id: string;
  name: string;
  code: string | null;
}

export interface EmploymentOption {
  id: string;
  full_name: string;
  employee_code: string | null;
  position_name: string | null;
}

export interface DepartmentCreateFormData {
  name: string;
  code: string;
  description: string;
  parent_id: string | null;
  manager_employment_id: string | null;
  cost_center: string;
  is_active: boolean;
}

interface DepartmentCreateFormProps {
  onSubmit: (data: DepartmentCreateFormData) => Promise<void>;
  onCancel: () => void;
  departments: DepartmentOption[];
  employments: EmploymentOption[];
  preselectedParentId?: string | null;
  isLoading?: boolean;
  validateCode?: (code: string) => Promise<boolean>;
}

export function DepartmentCreateForm({
  onSubmit,
  onCancel,
  departments,
  employments,
  preselectedParentId,
  isLoading,
  validateCode,
}: DepartmentCreateFormProps) {
  const [formData, setFormData] = useState<DepartmentCreateFormData>({
    name: '',
    code: '',
    description: '',
    parent_id: preselectedParentId || null,
    manager_employment_id: null,
    cost_center: '',
    is_active: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Efecto para pre-seleccionar el padre si viene por query param
  useEffect(() => {
    if (preselectedParentId) {
      setFormData((prev) => ({ ...prev, parent_id: preselectedParentId }));
    }
  }, [preselectedParentId]);

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
      setSubmitError(error.message || 'Error al crear el departamento');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const upperValue = value.toUpperCase().replace(/[^A-Z0-9-_]/g, '');
    setFormData({ ...formData, code: upperValue });
  };

  // Obtener nombre del padre seleccionado
  const selectedParent = departments.find((d) => d.id === formData.parent_id);

  if (submitSuccess) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              ¡Departamento Creado!
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              El departamento &quot;{formData.name}&quot; se ha creado correctamente.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => {
                setFormData({
                  name: '',
                  code: '',
                  description: '',
                  parent_id: null,
                  manager_employment_id: null,
                  cost_center: '',
                  is_active: true,
                });
                setSubmitSuccess(false);
              }}>
                Crear Otro
              </Button>
              <Button onClick={onCancel}>
                Ir a Departamentos
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
            <Building2 className="h-5 w-5 text-blue-600" />
            Información Básica
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Datos principales del departamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
              Nombre del Departamento <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Recursos Humanos"
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
                placeholder="Ej: RRHH"
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
              placeholder="Describe las funciones y responsabilidades del departamento..."
              rows={3}
              className="bg-white dark:bg-gray-900"
              disabled={isLoading || isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      {/* Jerarquía */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <FolderTree className="h-5 w-5 text-blue-600" />
            Jerarquía
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Define la posición en la estructura organizacional
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="parent_id" className="text-gray-700 dark:text-gray-300">
              Departamento Padre
            </Label>
            <Select
              value={formData.parent_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, parent_id: value === 'none' ? null : value })
              }
              disabled={isLoading || isSubmitting}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar departamento padre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-gray-400" />
                    Sin padre (nivel raíz)
                  </span>
                </SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name} {dept.code && <span className="text-gray-400">[{dept.code}]</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedParent && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Este departamento será un sub-departamento de &quot;{selectedParent.name}&quot;
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Responsable y Costos */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Users className="h-5 w-5 text-blue-600" />
            Responsable y Costos
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Asigna un jefe y configura el centro de costos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Jefe */}
          <div className="space-y-2">
            <Label htmlFor="manager" className="text-gray-700 dark:text-gray-300">
              Jefe del Departamento
            </Label>
            <Select
              value={formData.manager_employment_id || 'none'}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  manager_employment_id: value === 'none' ? null : value,
                })
              }
              disabled={isLoading || isSubmitting}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar jefe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin jefe asignado</SelectItem>
                {employments.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    <div className="flex flex-col">
                      <span>{emp.full_name}</span>
                      {emp.position_name && (
                        <span className="text-xs text-gray-400">{emp.position_name}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              El jefe tendrá permisos especiales sobre este departamento
            </p>
          </div>

          {/* Centro de Costos */}
          <div className="space-y-2">
            <Label htmlFor="cost_center" className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Centro de Costos
            </Label>
            <Input
              id="cost_center"
              value={formData.cost_center}
              onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
              placeholder="Ej: CC-001"
              className="bg-white dark:bg-gray-900"
              disabled={isLoading || isSubmitting}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Código para asociar gastos contables a este departamento
            </p>
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
                Departamento Activo
              </Label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Los departamentos inactivos no aparecen en listados ni pueden asignarse empleados
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
          className="min-w-[150px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creando...
            </>
          ) : (
            'Crear Departamento'
          )}
        </Button>
      </div>
    </form>
  );
}

export default DepartmentCreateForm;
