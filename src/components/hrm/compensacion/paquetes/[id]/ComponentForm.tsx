'use client';

import { useState, useEffect } from 'react';
import type { CompensationComponent, CreateComponentDTO, UpdateComponentDTO } from '@/lib/services/compensationPackagesService';
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
import { Layers, Save, X, Loader2 } from 'lucide-react';

interface ComponentFormProps {
  packageId: string;
  component?: CompensationComponent | null;
  componentTypes: { value: string; label: string }[];
  amountTypes: { value: string; label: string }[];
  frequencies: { value: string; label: string }[];
  onSubmit: (data: CreateComponentDTO | UpdateComponentDTO) => Promise<void>;
  onCancel: () => void;
}

export function ComponentForm({
  packageId,
  component,
  componentTypes,
  amountTypes,
  frequencies,
  onSubmit,
  onCancel,
}: ComponentFormProps) {
  const [formData, setFormData] = useState<CreateComponentDTO>({
    package_id: packageId,
    component_type: 'bonus',
    code: '',
    name: '',
    description: '',
    amount: undefined,
    amount_type: 'fixed',
    percentage_of: '',
    formula: '',
    frequency: 'monthly',
    is_taxable: true,
    affects_social_security: true,
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (component) {
      setFormData({
        package_id: packageId,
        component_type: component.component_type,
        code: component.code,
        name: component.name,
        description: component.description || '',
        amount: component.amount || undefined,
        amount_type: component.amount_type || 'fixed',
        percentage_of: component.percentage_of || '',
        formula: component.formula || '',
        frequency: component.frequency || 'monthly',
        is_taxable: component.is_taxable,
        affects_social_security: component.affects_social_security,
        is_active: component.is_active,
      });
    }
  }, [component, packageId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreateComponentDTO, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Layers className="h-5 w-5 text-blue-600" />
          {component ? 'Editar Componente' : 'Nuevo Componente'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code" className="text-gray-700 dark:text-gray-300">
                Código *
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                placeholder="Ej: BON-001"
                required
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
                placeholder="Nombre del componente"
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="component_type" className="text-gray-700 dark:text-gray-300">
                Tipo
              </Label>
              <Select
                value={formData.component_type}
                onValueChange={(value) => handleChange('component_type', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {componentTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              placeholder="Descripción del componente"
              rows={2}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Amount Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount_type" className="text-gray-700 dark:text-gray-300">
                Tipo de Monto
              </Label>
              <Select
                value={formData.amount_type}
                onValueChange={(value) => handleChange('amount_type', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {amountTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.amount_type === 'fixed' && (
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-gray-700 dark:text-gray-300">
                  Monto
                </Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => handleChange('amount', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                />
              </div>
            )}

            {formData.amount_type === 'percentage' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-gray-700 dark:text-gray-300">
                    Porcentaje (%)
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    value={formData.amount || ''}
                    onChange={(e) => handleChange('amount', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.1"
                    className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="percentage_of" className="text-gray-700 dark:text-gray-300">
                    Porcentaje de
                  </Label>
                  <Input
                    id="percentage_of"
                    value={formData.percentage_of}
                    onChange={(e) => handleChange('percentage_of', e.target.value)}
                    placeholder="Ej: base_salary"
                    className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                  />
                </div>
              </>
            )}

            {formData.amount_type === 'formula' && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="formula" className="text-gray-700 dark:text-gray-300">
                  Fórmula
                </Label>
                <Input
                  id="formula"
                  value={formData.formula}
                  onChange={(e) => handleChange('formula', e.target.value)}
                  placeholder="Ej: base_salary * 0.1"
                  className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-gray-700 dark:text-gray-300">
                Frecuencia
              </Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) => handleChange('frequency', value)}
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
          </div>

          {/* Tax Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Gravable</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aplica impuesto de renta
                </p>
              </div>
              <Switch
                checked={formData.is_taxable}
                onCheckedChange={(checked) => handleChange('is_taxable', checked)}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Seguridad Social</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Base para aportes
                </p>
              </div>
              <Switch
                checked={formData.affects_social_security}
                onCheckedChange={(checked) => handleChange('affects_social_security', checked)}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Activo</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Incluir este componente en el paquete
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
              disabled={submitting || !formData.code.trim() || !formData.name.trim()}
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
                  {component ? 'Actualizar' : 'Agregar Componente'}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
