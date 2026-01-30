'use client';

import { useState, useEffect } from 'react';
import { Save, X, Percent, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ServiceCharge, 
  CreateServiceChargeData, 
  ChargeType,
  AppliesTo,
  CHARGE_TYPE_LABELS, 
  APPLIES_TO_LABELS 
} from './types';
import { CargosServicioService } from './cargosServicioService';
import { cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface ChargeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge?: ServiceCharge | null;
  branches: { id: number; name: string }[];
  onSuccess: () => void;
}

export function ChargeForm({ 
  open, 
  onOpenChange, 
  charge, 
  branches,
  onSuccess 
}: ChargeFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateServiceChargeData>({
    name: '',
    charge_type: 'percentage',
    charge_value: 10,
    min_amount: undefined,
    min_guests: undefined,
    applies_to: 'all',
    is_taxable: false,
    is_optional: false,
    branch_id: undefined
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!charge;

  useEffect(() => {
    if (open) {
      if (charge) {
        setFormData({
          name: charge.name,
          charge_type: charge.charge_type,
          charge_value: charge.charge_value,
          min_amount: charge.min_amount || undefined,
          min_guests: charge.min_guests || undefined,
          applies_to: charge.applies_to,
          is_taxable: charge.is_taxable,
          is_optional: charge.is_optional,
          branch_id: charge.branch_id || undefined
        });
      } else {
        setFormData({
          name: '',
          charge_type: 'percentage',
          charge_value: 10,
          min_amount: undefined,
          min_guests: undefined,
          applies_to: 'all',
          is_taxable: false,
          is_optional: false,
          branch_id: undefined
        });
      }
      setErrors({});
    }
  }, [open, charge]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.charge_value || formData.charge_value <= 0) {
      newErrors.charge_value = 'El valor debe ser mayor a 0';
    }

    if (formData.charge_type === 'percentage' && formData.charge_value > 100) {
      newErrors.charge_value = 'El porcentaje no puede ser mayor a 100%';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEditing && charge) {
        await CargosServicioService.update(charge.id, formData);
        toast.success('Cargo actualizado correctamente');
      } else {
        await CargosServicioService.create(formData);
        toast.success('Cargo creado correctamente');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar el cargo');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateServiceChargeData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {isEditing ? 'Editar Cargo de Servicio' : 'Nuevo Cargo de Servicio'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Ej: Cargo por servicio 10%"
              className={cn(
                "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                errors.name && "border-red-500"
              )}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Tipo de cargo */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Tipo de Cargo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(CHARGE_TYPE_LABELS) as [ChargeType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleChange('charge_type', type)}
                  className={cn(
                    "p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-all",
                    formData.charge_type === type
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                      : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                  )}
                >
                  {type === 'percentage' ? (
                    <Percent className={cn(
                      "h-5 w-5",
                      formData.charge_type === type
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-400"
                    )} />
                  ) : (
                    <DollarSign className={cn(
                      "h-5 w-5",
                      formData.charge_type === type
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-400"
                    )} />
                  )}
                  <span className={cn(
                    "font-medium",
                    formData.charge_type === type
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-300"
                  )}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">
              Valor <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {formData.charge_type === 'percentage' ? '%' : '$'}
              </span>
              <Input
                type="number"
                value={formData.charge_value || ''}
                onChange={(e) => handleChange('charge_value', parseFloat(e.target.value) || 0)}
                min={0}
                max={formData.charge_type === 'percentage' ? 100 : undefined}
                step={formData.charge_type === 'percentage' ? 0.5 : 100}
                className={cn(
                  "pl-8 dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                  errors.charge_value && "border-red-500"
                )}
                disabled={loading}
              />
            </div>
            {errors.charge_value && (
              <p className="text-sm text-red-500">{errors.charge_value}</p>
            )}
          </div>

          {/* Condiciones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Monto Mínimo (opcional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  value={formData.min_amount || ''}
                  onChange={(e) => handleChange('min_amount', e.target.value ? parseFloat(e.target.value) : undefined)}
                  min={0}
                  step={1000}
                  placeholder="0"
                  className="pl-8 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Personas Mínimas (opcional)</Label>
              <Input
                type="number"
                value={formData.min_guests || ''}
                onChange={(e) => handleChange('min_guests', e.target.value ? parseInt(e.target.value) : undefined)}
                min={0}
                placeholder="0"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
          </div>

          {/* Aplica a */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Aplica a</Label>
            <Select
              value={formData.applies_to}
              onValueChange={(value) => handleChange('applies_to', value as AppliesTo)}
            >
              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {Object.entries(APPLIES_TO_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sucursal */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Sucursal (opcional)</Label>
            <Select
              value={formData.branch_id?.toString() || 'global'}
              onValueChange={(value) => handleChange('branch_id', value === 'global' ? undefined : parseInt(value))}
            >
              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Global (todas)" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="global">Global (todas las sucursales)</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Opciones adicionales */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <Label className="dark:text-gray-200">Gravado con impuesto</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  El cargo se incluirá en la base gravable
                </p>
              </div>
              <Switch
                checked={formData.is_taxable}
                onCheckedChange={(checked) => handleChange('is_taxable', checked)}
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <Label className="dark:text-gray-200">Cargo opcional</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  El cliente puede rechazar este cargo
                </p>
              </div>
              <Switch
                checked={formData.is_optional}
                onCheckedChange={(checked) => handleChange('is_optional', checked)}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={loading}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
