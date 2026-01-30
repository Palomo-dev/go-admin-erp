'use client';

import { useState, useEffect } from 'react';
import { Save, X, Camera, Package, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ReturnReason, CreateReturnReasonData, UpdateReturnReasonData } from '../types';
import { ReturnReasonsService } from './returnReasonsService';
import { toast } from 'sonner';

interface ReturnReasonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: ReturnReason | null;
  onSuccess: () => void;
}

export function ReturnReasonForm({ 
  open, 
  onOpenChange, 
  reason, 
  onSuccess 
}: ReturnReasonFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateReturnReasonData>({
    code: '',
    name: '',
    description: '',
    requires_photo: false,
    affects_inventory: true,
    is_active: true,
    display_order: 0
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!reason;

  useEffect(() => {
    if (open) {
      if (reason) {
        setFormData({
          code: reason.code,
          name: reason.name,
          description: reason.description || '',
          requires_photo: reason.requires_photo,
          affects_inventory: reason.affects_inventory,
          is_active: reason.is_active,
          display_order: reason.display_order
        });
      } else {
        setFormData({
          code: '',
          name: '',
          description: '',
          requires_photo: false,
          affects_inventory: true,
          is_active: true,
          display_order: 0
        });
      }
      setErrors({});
    }
  }, [open, reason]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.code.trim()) {
      newErrors.code = 'El código es requerido';
    } else if (formData.code.length > 20) {
      newErrors.code = 'El código no puede exceder 20 caracteres';
    } else if (!/^[A-Za-z0-9_-]+$/.test(formData.code)) {
      newErrors.code = 'El código solo puede contener letras, números, guiones y guiones bajos';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    } else if (formData.name.length > 100) {
      newErrors.name = 'El nombre no puede exceder 100 caracteres';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'La descripción no puede exceder 500 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEditing && reason) {
        await ReturnReasonsService.update(reason.id, formData as UpdateReturnReasonData);
        toast.success('Motivo actualizado correctamente');
      } else {
        await ReturnReasonsService.create(formData);
        toast.success('Motivo creado correctamente');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar el motivo');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateReturnReasonData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {isEditing ? 'Editar Motivo de Devolución' : 'Nuevo Motivo de Devolución'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Código */}
          <div className="space-y-2">
            <Label htmlFor="code" className="dark:text-gray-200">
              Código <span className="text-red-500">*</span>
            </Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
              placeholder="ej: DEFECTO, CAMBIO_TALLA"
              className={`dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.code ? 'border-red-500' : ''
              }`}
              disabled={loading}
            />
            {errors.code && (
              <p className="text-sm text-red-500">{errors.code}</p>
            )}
          </div>

          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name" className="dark:text-gray-200">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="ej: Producto defectuoso"
              className={`dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.name ? 'border-red-500' : ''
              }`}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description" className="dark:text-gray-200">
              Descripción
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Descripción del motivo de devolución..."
              rows={3}
              className={`dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none ${
                errors.description ? 'border-red-500' : ''
              }`}
              disabled={loading}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
          </div>

          {/* Switches */}
          <div className="space-y-4 pt-2">
            {/* Requiere Foto */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <Camera className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <Label className="dark:text-white font-medium">Requiere Foto</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Solicitar evidencia fotográfica del producto
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.requires_photo}
                onCheckedChange={(checked) => handleChange('requires_photo', checked)}
                disabled={loading}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            {/* Afecta Inventario */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                  <Package className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <Label className="dark:text-white font-medium">Afecta Inventario</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reingresar productos al inventario automáticamente
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.affects_inventory}
                onCheckedChange={(checked) => handleChange('affects_inventory', checked)}
                disabled={loading}
                className="data-[state=checked]:bg-green-600"
              />
            </div>

            {/* Activo */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                  <Info className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <Label className="dark:text-white font-medium">Activo</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Disponible para seleccionar en nuevas devoluciones
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => handleChange('is_active', checked)}
                disabled={loading}
                className="data-[state=checked]:bg-purple-600"
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
