'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Loader2 } from 'lucide-react';

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_id: string | null;
  manager_employment_id: string | null;
  cost_center: string | null;
  is_active: boolean;
}

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

interface DepartmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: DepartmentFormData) => Promise<void>;
  department?: Department | null;
  parentId?: string | null;
  departments: DepartmentOption[];
  employments: EmploymentOption[];
  mode: 'create' | 'edit' | 'child';
}

export interface DepartmentFormData {
  name: string;
  code: string;
  description: string;
  parent_id: string | null;
  manager_employment_id: string | null;
  cost_center: string;
  is_active: boolean;
}

export function DepartmentForm({
  open,
  onOpenChange,
  onSubmit,
  department,
  parentId,
  departments,
  employments,
  mode,
}: DepartmentFormProps) {
  const [formData, setFormData] = useState<DepartmentFormData>({
    name: '',
    code: '',
    description: '',
    parent_id: null,
    manager_employment_id: null,
    cost_center: '',
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && department) {
        setFormData({
          name: department.name,
          code: department.code || '',
          description: department.description || '',
          parent_id: department.parent_id,
          manager_employment_id: department.manager_employment_id,
          cost_center: department.cost_center || '',
          is_active: department.is_active,
        });
      } else if (mode === 'child' && parentId) {
        setFormData({
          name: '',
          code: '',
          description: '',
          parent_id: parentId,
          manager_employment_id: null,
          cost_center: '',
          is_active: true,
        });
      } else {
        setFormData({
          name: '',
          code: '',
          description: '',
          parent_id: null,
          manager_employment_id: null,
          cost_center: '',
          is_active: true,
        });
      }
      setErrors({});
    }
  }, [open, mode, department, parentId]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    // Evitar referencia circular
    if (mode === 'edit' && department && formData.parent_id === department.id) {
      newErrors.parent_id = 'Un departamento no puede ser padre de sí mismo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'edit':
        return 'Editar Departamento';
      case 'child':
        return 'Nuevo Sub-departamento';
      default:
        return 'Nuevo Departamento';
    }
  };

  // Filtrar departamentos para evitar ciclos
  const availableParents = departments.filter(
    (d) => mode !== 'edit' || d.id !== department?.id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Recursos Humanos"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Código */}
          <div className="space-y-2">
            <Label htmlFor="code" className="text-gray-700 dark:text-gray-300">
              Código
            </Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="Ej: RRHH"
              className="font-mono"
            />
          </div>

          {/* Departamento Padre */}
          <div className="space-y-2">
            <Label htmlFor="parent_id" className="text-gray-700 dark:text-gray-300">
              Departamento Padre
            </Label>
            <Select
              value={formData.parent_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, parent_id: value === 'none' ? null : value })
              }
            >
              <SelectTrigger className={errors.parent_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Seleccionar padre (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin padre (nivel raíz)</SelectItem>
                {availableParents.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name} {dept.code && `[${dept.code}]`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.parent_id && (
              <p className="text-xs text-red-500">{errors.parent_id}</p>
            )}
          </div>

          {/* Jefe / Manager */}
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
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar jefe (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin jefe asignado</SelectItem>
                {employments.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.full_name}
                    {emp.position_name && ` - ${emp.position_name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Centro de Costos */}
          <div className="space-y-2">
            <Label htmlFor="cost_center" className="text-gray-700 dark:text-gray-300">
              Centro de Costos
            </Label>
            <Input
              id="cost_center"
              value={formData.cost_center}
              onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
              placeholder="Ej: CC-001"
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
              Descripción
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción del departamento..."
              rows={3}
            />
          </div>

          {/* Estado Activo */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <div>
              <Label htmlFor="is_active" className="text-gray-700 dark:text-gray-300">
                Departamento Activo
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los departamentos inactivos no aparecen en listados
              </p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <DialogFooter className="gap-2">
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
              ) : mode === 'edit' ? (
                'Guardar Cambios'
              ) : (
                'Crear Departamento'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default DepartmentForm;
