'use client';

import { useState, useEffect } from 'react';
import { Save, X, Percent, DollarSign, RefreshCw } from 'lucide-react';
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
import { Coupon, CreateCouponData, UpdateCouponData, DiscountType, DISCOUNT_TYPE_LABELS } from './types';
import { CouponsService } from './couponsService';
import { cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface CouponFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon?: Coupon | null;
  onSuccess: () => void;
}

export function CouponForm({ open, onOpenChange, coupon, onSuccess }: CouponFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateCouponData>({
    code: '',
    name: '',
    discount_type: 'percentage',
    discount_value: 10,
    min_purchase_amount: undefined,
    max_discount_amount: undefined,
    usage_limit: undefined,
    usage_limit_per_customer: undefined,
    start_date: undefined,
    end_date: undefined,
    is_active: true,
    applies_to_first_purchase: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!coupon;

  useEffect(() => {
    if (open) {
      if (coupon) {
        setFormData({
          code: coupon.code,
          name: coupon.name || '',
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          min_purchase_amount: coupon.min_purchase_amount,
          max_discount_amount: coupon.max_discount_amount,
          usage_limit: coupon.usage_limit,
          usage_limit_per_customer: coupon.usage_limit_per_customer,
          start_date: coupon.start_date?.split('T')[0],
          end_date: coupon.end_date?.split('T')[0],
          is_active: coupon.is_active,
          applies_to_first_purchase: coupon.applies_to_first_purchase
        });
      } else {
        setFormData({
          code: CouponsService.generateCode(),
          name: '',
          discount_type: 'percentage',
          discount_value: 10,
          is_active: true,
          applies_to_first_purchase: false
        });
      }
      setErrors({});
    }
  }, [open, coupon]);

  const generateNewCode = () => {
    setFormData(prev => ({ ...prev, code: CouponsService.generateCode() }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.code.trim()) newErrors.code = 'El código es requerido';
    if (!formData.discount_value || formData.discount_value <= 0) newErrors.discount_value = 'El valor debe ser mayor a 0';
    if (formData.discount_type === 'percentage' && formData.discount_value > 100) newErrors.discount_value = 'Máximo 100%';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (isEditing && coupon) {
        await CouponsService.update(coupon.id, formData as UpdateCouponData);
        toast.success('Cupón actualizado');
      } else {
        await CouponsService.create(formData);
        toast.success('Cupón creado');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateCouponData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {isEditing ? 'Editar Cupón' : 'Nuevo Cupón'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Código *</Label>
            <div className="flex gap-2">
              <Input
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                placeholder="ej: VERANO20"
                className={cn("dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono", errors.code && "border-red-500")}
                disabled={loading}
              />
              <Button type="button" variant="outline" size="icon" onClick={generateNewCode} className="dark:bg-gray-700 dark:border-gray-600">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {errors.code && <p className="text-sm text-red-500">{errors.code}</p>}
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-200">Nombre (opcional)</Label>
            <Input
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="ej: Descuento de Verano"
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-200">Tipo de Descuento</Label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(DISCOUNT_TYPE_LABELS) as [DiscountType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleChange('discount_type', type)}
                  className={cn(
                    "p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-all",
                    formData.discount_type === type
                      ? "border-purple-600 bg-purple-50 dark:bg-purple-900/30"
                      : "border-gray-200 dark:border-gray-600 hover:border-purple-300"
                  )}
                >
                  {type === 'percentage' ? <Percent className={cn("h-4 w-4", formData.discount_type === type ? "text-purple-600" : "text-gray-400")} /> : <DollarSign className={cn("h-4 w-4", formData.discount_type === type ? "text-purple-600" : "text-gray-400")} />}
                  <span className={cn("text-sm font-medium", formData.discount_type === type ? "text-purple-600 dark:text-purple-400" : "text-gray-600 dark:text-gray-300")}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Valor *</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={formData.discount_value || ''}
                  onChange={(e) => handleChange('discount_value', parseFloat(e.target.value) || 0)}
                  min={0}
                  max={formData.discount_type === 'percentage' ? 100 : undefined}
                  className={cn("dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-10", errors.discount_value && "border-red-500")}
                  disabled={loading}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {formData.discount_type === 'percentage' ? '%' : '$'}
                </span>
              </div>
              {errors.discount_value && <p className="text-sm text-red-500">{errors.discount_value}</p>}
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Descuento Máximo</Label>
              <Input
                type="number"
                value={formData.max_discount_amount || ''}
                onChange={(e) => handleChange('max_discount_amount', parseFloat(e.target.value) || undefined)}
                placeholder="Sin límite"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Compra Mínima</Label>
              <Input
                type="number"
                value={formData.min_purchase_amount || ''}
                onChange={(e) => handleChange('min_purchase_amount', parseFloat(e.target.value) || undefined)}
                placeholder="Sin mínimo"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Límite de Usos</Label>
              <Input
                type="number"
                value={formData.usage_limit || ''}
                onChange={(e) => handleChange('usage_limit', parseInt(e.target.value) || undefined)}
                placeholder="Sin límite"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Fecha Inicio</Label>
              <Input
                type="date"
                value={formData.start_date || ''}
                onChange={(e) => handleChange('start_date', e.target.value || undefined)}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Fecha Fin</Label>
              <Input
                type="date"
                value={formData.end_date || ''}
                onChange={(e) => handleChange('end_date', e.target.value || undefined)}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div>
                <Label className="dark:text-white font-medium">Activo</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Disponible para uso inmediato</p>
              </div>
              <Switch checked={formData.is_active} onCheckedChange={(checked) => handleChange('is_active', checked)} disabled={loading} className="data-[state=checked]:bg-green-600" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div>
                <Label className="dark:text-white font-medium">Solo Primera Compra</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solo para clientes nuevos</p>
              </div>
              <Switch checked={formData.applies_to_first_purchase} onCheckedChange={(checked) => handleChange('applies_to_first_purchase', checked)} disabled={loading} className="data-[state=checked]:bg-purple-600" />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600">
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
