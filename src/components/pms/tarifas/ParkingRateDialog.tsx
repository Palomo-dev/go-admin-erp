'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Car, Bike, Truck } from 'lucide-react';

export interface ParkingRate {
  id: string;
  organization_id: number;
  vehicle_type: 'car' | 'motorcycle' | 'truck';
  rate_name: string;
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  price: number;
  grace_period_min?: number;
  is_active?: boolean;
  created_at?: string;
}

interface ParkingRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: ParkingRate | null;
  onSave: (data: Omit<ParkingRate, 'id' | 'created_at'>) => Promise<void>;
}

const VEHICLE_TYPES = [
  { value: 'car', label: 'Automóvil', icon: Car },
  { value: 'motorcycle', label: 'Motocicleta', icon: Bike },
  { value: 'truck', label: 'Camión/Vehículo Grande', icon: Truck },
];

const UNIT_OPTIONS = [
  { value: 'minute', label: 'Por Minuto' },
  { value: 'hour', label: 'Por Hora' },
  { value: 'day', label: 'Por Día' },
  { value: 'week', label: 'Por Semana' },
  { value: 'month', label: 'Por Mes' },
  { value: 'year', label: 'Por Año' },
];

export function ParkingRateDialog({
  open,
  onOpenChange,
  rate,
  onSave,
}: ParkingRateDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateName, setRateName] = useState('');
  const [vehicleType, setVehicleType] = useState<string>('car');
  const [unit, setUnit] = useState<string>('hour');
  const [price, setPrice] = useState<string>('');
  const [gracePeriod, setGracePeriod] = useState<string>('');

  useEffect(() => {
    if (open) {
      if (rate) {
        setRateName(rate.rate_name || '');
        setVehicleType(rate.vehicle_type);
        setUnit(rate.unit);
        setPrice(rate.price.toString());
        setGracePeriod(rate.grace_period_min?.toString() || '');
      } else {
        setRateName('');
        setVehicleType('car');
        setUnit('hour');
        setPrice('');
        setGracePeriod('');
      }
    }
  }, [open, rate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rateName.trim() || !price) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        organization_id: rate?.organization_id || 0,
        rate_name: rateName.trim(),
        vehicle_type: vehicleType as 'car' | 'motorcycle' | 'truck',
        unit: unit as ParkingRate['unit'],
        price: parseFloat(price),
        grace_period_min: gracePeriod ? parseInt(gracePeriod) : undefined,
        is_active: rate?.is_active ?? true,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando tarifa:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {rate ? 'Editar Tarifa de Parking' : 'Nueva Tarifa de Parking'}
          </DialogTitle>
          <DialogDescription>
            {rate
              ? 'Modifica los datos de la tarifa de estacionamiento.'
              : 'Crea una nueva tarifa para el estacionamiento.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rate_name">Nombre de la Tarifa *</Label>
            <Input
              id="rate_name"
              placeholder="Ej: Tarifa Regular, Tarifa Nocturna"
              value={rateName}
              onChange={(e) => setRateName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle_type">Tipo de Vehículo *</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit">Unidad de Cobro *</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar unidad" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Precio *</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grace_period">Periodo de Gracia (minutos)</Label>
            <Input
              id="grace_period"
              type="number"
              min="0"
              placeholder="Ej: 15 (opcional)"
              value={gracePeriod}
              onChange={(e) => setGracePeriod(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Minutos gratuitos antes de empezar a cobrar.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !rateName.trim() || !price}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : rate ? (
                'Guardar Cambios'
              ) : (
                'Crear Tarifa'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
