'use client';

import React, { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CreditCard, Car, Bike, Truck, Sparkles, Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import parkingService, { type ParkingPassType } from '@/lib/services/parkingService';

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  plan: ParkingPassType | null;
  onSuccess: () => void;
}

const VEHICLE_TYPES = [
  { id: 'car', label: 'Carro', icon: Car },
  { id: 'motorcycle', label: 'Moto', icon: Bike },
  { id: 'truck', label: 'Camión', icon: Truck },
];

export function PlanFormDialog({
  open,
  onOpenChange,
  organizationId,
  plan,
  onSuccess,
}: PlanFormDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('');
  const [maxEntriesPerDay, setMaxEntriesPerDay] = useState('');
  const [includesCarWash, setIncludesCarWash] = useState(false);
  const [includesValet, setIncludesValet] = useState(false);
  const [allowedVehicleTypes, setAllowedVehicleTypes] = useState<string[]>(['car', 'motorcycle']);
  const [isActive, setIsActive] = useState(true);

  const isEditing = !!plan?.id;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (plan) {
        setName(plan.name || '');
        setDescription(plan.description || '');
        setDurationDays(String(plan.duration_days) || '30');
        setPrice(String(plan.price) || '');
        setMaxEntriesPerDay(plan.max_entries_per_day ? String(plan.max_entries_per_day) : '');
        setIncludesCarWash(plan.includes_car_wash || false);
        setIncludesValet(plan.includes_valet || false);
        setAllowedVehicleTypes(plan.allowed_vehicle_types || ['car', 'motorcycle']);
        setIsActive(plan.is_active);
      } else {
        resetForm();
      }
    }
  }, [open, plan]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setDurationDays('30');
    setPrice('');
    setMaxEntriesPerDay('');
    setIncludesCarWash(false);
    setIncludesValet(false);
    setAllowedVehicleTypes(['car', 'motorcycle']);
    setIsActive(true);
  };

  const handleVehicleTypeChange = (typeId: string, checked: boolean) => {
    if (checked) {
      setAllowedVehicleTypes([...allowedVehicleTypes, typeId]);
    } else {
      setAllowedVehicleTypes(allowedVehicleTypes.filter((t) => t !== typeId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: 'Error', description: 'El nombre es requerido', variant: 'destructive' });
      return;
    }

    if (!price || Number(price) <= 0) {
      toast({ title: 'Error', description: 'El precio debe ser mayor a 0', variant: 'destructive' });
      return;
    }

    if (allowedVehicleTypes.length === 0) {
      toast({ title: 'Error', description: 'Selecciona al menos un tipo de vehículo', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const data = {
        organization_id: organizationId,
        name: name.trim(),
        description: description.trim() || null,
        duration_days: Number(durationDays),
        price: Number(price),
        max_entries_per_day: maxEntriesPerDay ? Number(maxEntriesPerDay) : null,
        includes_car_wash: includesCarWash,
        includes_valet: includesValet,
        allowed_vehicle_types: allowedVehicleTypes,
        is_active: isActive,
      };

      if (isEditing) {
        await parkingService.updatePassType(plan!.id, data);
        toast({ title: 'Plan actualizado', description: 'El plan se ha actualizado correctamente' });
      } else {
        await parkingService.createPassType(data);
        toast({ title: 'Plan creado', description: 'El plan se ha creado correctamente' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving plan:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el plan', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {isEditing ? 'Editar Plan' : 'Nuevo Plan de Parking'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nombre */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Nombre del Plan *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Plan Mensual Básico"
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Descripción</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del plan..."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600 resize-none"
            />
          </div>

          {/* Duración y Precio */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Duración (días) *</Label>
              <Input
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Precio (COP) *</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="150000"
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Max entradas por día */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Máx. entradas por día (opcional)</Label>
            <Input
              type="number"
              min="1"
              value={maxEntriesPerDay}
              onChange={(e) => setMaxEntriesPerDay(e.target.value)}
              placeholder="Sin límite"
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Dejar vacío para entradas ilimitadas
            </p>
          </div>

          {/* Tipos de vehículos */}
          <div className="space-y-3">
            <Label className="dark:text-gray-200">Tipos de vehículos permitidos *</Label>
            <div className="flex flex-wrap gap-3">
              {VEHICLE_TYPES.map((type) => (
                <label
                  key={type.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    allowedVehicleTypes.includes(type.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <Checkbox
                    checked={allowedVehicleTypes.includes(type.id)}
                    onCheckedChange={(checked) =>
                      handleVehicleTypeChange(type.id, checked as boolean)
                    }
                  />
                  <type.icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm dark:text-gray-200">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Beneficios */}
          <div className="space-y-3">
            <Label className="dark:text-gray-200">Beneficios incluidos</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-cyan-500" />
                  <div>
                    <p className="text-sm font-medium dark:text-white">Lavado de auto</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Incluye lavado gratuito
                    </p>
                  </div>
                </div>
                <Switch
                  checked={includesCarWash}
                  onCheckedChange={setIncludesCarWash}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium dark:text-white">Servicio Valet</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Incluye servicio de valet parking
                    </p>
                  </div>
                </div>
                <Switch
                  checked={includesValet}
                  onCheckedChange={setIncludesValet}
                />
              </div>
            </div>
          </div>

          {/* Estado */}
          <div className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
            <div>
              <p className="text-sm font-medium dark:text-white">Plan activo</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los planes inactivos no se muestran a los clientes
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="dark:border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : isEditing ? (
                'Actualizar Plan'
              ) : (
                'Crear Plan'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PlanFormDialog;
