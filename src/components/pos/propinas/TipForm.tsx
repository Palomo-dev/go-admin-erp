'use client';

import { useState, useEffect } from 'react';
import { Save, X, Banknote, CreditCard, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Tip, CreateTipData, TipType, TIP_TYPE_LABELS } from './types';
import { PropinasService } from './propinasService';
import { cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface TipFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tip?: Tip | null;
  servers: { id: string; name: string; email: string }[];
  onSuccess: () => void;
}

export function TipForm({ 
  open, 
  onOpenChange, 
  tip, 
  servers,
  onSuccess 
}: TipFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateTipData>({
    server_id: '',
    amount: 0,
    tip_type: 'cash',
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!tip;

  useEffect(() => {
    if (open) {
      if (tip) {
        setFormData({
          server_id: tip.server_id,
          amount: tip.amount,
          tip_type: tip.tip_type,
          notes: tip.notes || ''
        });
      } else {
        setFormData({
          server_id: servers[0]?.id || '',
          amount: 0,
          tip_type: 'cash',
          notes: ''
        });
      }
      setErrors({});
    }
  }, [open, tip, servers]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.server_id) {
      newErrors.server_id = 'Selecciona un mesero';
    }

    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'El monto debe ser mayor a 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEditing && tip) {
        await PropinasService.update(tip.id, formData);
        toast.success('Propina actualizada correctamente');
      } else {
        await PropinasService.create(formData);
        toast.success('Propina registrada correctamente');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la propina');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateTipData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const getTypeIcon = (type: TipType) => {
    switch (type) {
      case 'cash': return <Banknote className="h-5 w-5" />;
      case 'card': return <CreditCard className="h-5 w-5" />;
      case 'transfer': return <ArrowRightLeft className="h-5 w-5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {isEditing ? 'Editar Propina' : 'Nueva Propina'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mesero */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">
              Mesero <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.server_id}
              onValueChange={(value) => handleChange('server_id', value)}
            >
              <SelectTrigger className={cn(
                "dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                errors.server_id && "border-red-500"
              )}>
                <SelectValue placeholder="Seleccionar mesero" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.server_id && (
              <p className="text-sm text-red-500">{errors.server_id}</p>
            )}
          </div>

          {/* Monto */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">
              Monto <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <Input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)}
                min={0}
                step={100}
                className={cn(
                  "pl-8 dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                  errors.amount && "border-red-500"
                )}
                disabled={loading}
              />
            </div>
            {errors.amount && (
              <p className="text-sm text-red-500">{errors.amount}</p>
            )}
          </div>

          {/* Tipo */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Tipo de Propina</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(TIP_TYPE_LABELS) as [TipType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleChange('tip_type', type)}
                  className={cn(
                    "p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all",
                    formData.tip_type === type
                      ? "border-green-600 bg-green-50 dark:bg-green-900/30"
                      : "border-gray-200 dark:border-gray-600 hover:border-green-300"
                  )}
                >
                  <span className={cn(
                    formData.tip_type === type
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-400"
                  )}>
                    {getTypeIcon(type)}
                  </span>
                  <span className={cn(
                    "text-xs font-medium",
                    formData.tip_type === type
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-600 dark:text-gray-300"
                  )}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Notas (opcional)</Label>
            <Textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={loading}
            />
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
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
