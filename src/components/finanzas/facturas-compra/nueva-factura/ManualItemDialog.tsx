'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, FileText } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface ManualItemDialogProps {
  currency: string;
  onItemAdd: (item: { description: string; cost: number; tax_rate: number; }) => void;
}

interface ManualItemForm {
  description: string;
  cost: number;
  tax_rate: number;
  notes: string;
}

export function ManualItemDialog({ currency, onItemAdd }: ManualItemDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<ManualItemForm>({
    description: '',
    cost: 0,
    tax_rate: 0,
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({
      description: '',
      cost: 0,
      tax_rate: 0,
      notes: ''
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'La descripción es obligatoria';
    }

    if (formData.cost <= 0) {
      newErrors.cost = 'El costo debe ser mayor a 0';
    }

    if (formData.tax_rate < 0 || formData.tax_rate > 100) {
      newErrors.tax_rate = 'La tasa de impuesto debe estar entre 0 y 100%';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    onItemAdd({
      description: formData.description.trim(),
      cost: formData.cost,
      tax_rate: formData.tax_rate
    });

    resetForm();
    setIsOpen(false);
  };

  const handleInputChange = (field: keyof ManualItemForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpiar error del campo cuando el usuario empiece a corregir
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="h-8 sm:h-9 text-xs sm:text-sm border-dashed border-2 border-blue-300 hover:border-blue-500 text-blue-600 hover:text-blue-700 dark:border-blue-600 dark:text-blue-400 dark:hover:border-blue-400 dark:hover:bg-blue-900/20"
        >
          <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Agregar Item Manual</span>
          <span className="sm:hidden">Item Manual</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md sm:max-w-[500px] max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-900 dark:text-white">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Agregar Item Manual</span>
          </DialogTitle>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Agregue un item personalizado que no está en el catálogo de productos
          </p>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
          {/* Descripción */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="description" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Descripción del Item *
            </Label>
            <Textarea
              id="description"
              placeholder="Ej: Servicio de consultoría, Material especial, etc."
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              className="min-h-[70px] sm:min-h-[80px] text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {errors.description && (
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.description}</p>
            )}
          </div>

          {/* Fila de costo y tasa de impuesto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cost" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                Costo Unitario *
              </Label>
              <Input
                id="cost"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={formData.cost || ''}
                onChange={(e) => handleInputChange('cost', parseFloat(e.target.value) || 0)}
                className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
              {errors.cost && (
                <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.cost}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="tax_rate" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                Tasa de Impuesto (%)
              </Label>
              <Input
                id="tax_rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="0.0"
                value={formData.tax_rate || ''}
                onChange={(e) => handleInputChange('tax_rate', parseFloat(e.target.value) || 0)}
                className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
              {errors.tax_rate && (
                <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.tax_rate}</p>
              )}
            </div>
          </div>

          {/* Notas adicionales */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="notes" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Notas Adicionales
            </Label>
            <Textarea
              id="notes"
              placeholder="Información adicional sobre el item (opcional)"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              className="min-h-[50px] sm:min-h-[60px] text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>

          {/* Vista previa */}
          {formData.description && formData.cost > 0 && (
            <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:border-blue-600 dark:text-blue-400">Vista Previa</Badge>
              </div>
              <h4 className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white mb-1">
                {formData.description}
              </h4>
              <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                <span className="font-bold text-green-600 dark:text-green-500">
                  {formatCurrency(formData.cost, currency)}
                </span>
                {formData.tax_rate > 0 && (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">
                    {formData.tax_rate}%
                  </Badge>
                )}
              </div>
              {formData.notes && (
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-2">{formData.notes}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="w-full sm:w-auto h-9 text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!formData.description.trim() || formData.cost <= 0}
            className="w-full sm:w-auto h-9 text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
          >
            <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
            <span>Agregar Item</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
