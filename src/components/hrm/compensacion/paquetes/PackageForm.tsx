'use client';

import { useState, useEffect } from 'react';
import type { CompensationPackage, CreatePackageDTO, UpdatePackageDTO } from '@/lib/services/compensationPackagesService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { DollarSign, Save, X, Loader2 } from 'lucide-react';

interface PackageFormProps {
  package?: CompensationPackage | null;
  currencies: string[];
  salaryPeriods: { value: string; label: string }[];
  positions: { id: string; name: string; level: string | null }[];
  onSubmit: (data: CreatePackageDTO | UpdatePackageDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PackageForm({
  package: pkg,
  currencies,
  salaryPeriods,
  positions,
  onSubmit,
  onCancel,
  isLoading,
}: PackageFormProps) {
  const [formData, setFormData] = useState<CreatePackageDTO>({
    code: '',
    name: '',
    description: '',
    currency_code: 'COP',
    base_salary: undefined,
    salary_period: 'monthly',
    applicable_levels: [],
    applicable_positions: [],
    valid_from: '',
    valid_to: '',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pkg) {
      setFormData({
        code: pkg.code || '',
        name: pkg.name,
        description: pkg.description || '',
        currency_code: pkg.currency_code,
        base_salary: pkg.base_salary || undefined,
        salary_period: pkg.salary_period || 'monthly',
        applicable_levels: pkg.applicable_levels || [],
        applicable_positions: pkg.applicable_positions || [],
        valid_from: pkg.valid_from || '',
        valid_to: pkg.valid_to || '',
        is_active: pkg.is_active,
      });
    }
  }, [pkg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreatePackageDTO, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <DollarSign className="h-5 w-5 text-blue-600" />
          {pkg ? 'Editar Paquete' : 'Nuevo Paquete de Compensación'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code" className="text-gray-700 dark:text-gray-300">
                Código
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                placeholder="Ej: PKG-001"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                Nombre *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Nombre del paquete"
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
              Descripción
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Descripción del paquete de compensación"
              rows={3}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Salary Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base_salary" className="text-gray-700 dark:text-gray-300">
                Salario Base
              </Label>
              <Input
                id="base_salary"
                type="number"
                value={formData.base_salary || ''}
                onChange={(e) => handleChange('base_salary', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency_code" className="text-gray-700 dark:text-gray-300">
                Moneda
              </Label>
              <Select
                value={formData.currency_code}
                onValueChange={(value) => handleChange('currency_code', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {currencies.map((curr) => (
                    <SelectItem key={curr} value={curr}>
                      {curr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary_period" className="text-gray-700 dark:text-gray-300">
                Período
              </Label>
              <Select
                value={formData.salary_period}
                onValueChange={(value) => handleChange('salary_period', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar período" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {salaryPeriods.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Validity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valid_from" className="text-gray-700 dark:text-gray-300">
                Válido desde
              </Label>
              <Input
                id="valid_from"
                type="date"
                value={formData.valid_from}
                onChange={(e) => handleChange('valid_from', e.target.value)}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valid_to" className="text-gray-700 dark:text-gray-300">
                Válido hasta
              </Label>
              <Input
                id="valid_to"
                type="date"
                value={formData.valid_to}
                onChange={(e) => handleChange('valid_to', e.target.value)}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Activo</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Habilitar este paquete para su uso
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => handleChange('is_active', checked)}
              className="data-[state=checked]:bg-blue-600"
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
              disabled={submitting || !formData.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {pkg ? 'Actualizar' : 'Crear Paquete'}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
