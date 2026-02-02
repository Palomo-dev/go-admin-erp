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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, DollarSign } from 'lucide-react';
import { ParkingRate, VehicleType, RateUnit } from './types';

interface TarifaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: ParkingRate | null;
  onSave: (data: Partial<ParkingRate>) => Promise<void>;
}

const vehicleTypes: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Automóvil' },
  { value: 'motorcycle', label: 'Motocicleta' },
  { value: 'truck', label: 'Camión' },
  { value: 'bicycle', label: 'Bicicleta' },
];

const unitTypes: { value: RateUnit; label: string }[] = [
  { value: 'minute', label: 'Por Minuto' },
  { value: 'hour', label: 'Por Hora' },
  { value: 'day', label: 'Por Día' },
];

export function TarifaDialog({
  open,
  onOpenChange,
  rate,
  onSave,
}: TarifaDialogProps) {
  const [rateName, setRateName] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [unit, setUnit] = useState<RateUnit>('hour');
  const [price, setPrice] = useState('');
  const [gracePeriod, setGracePeriod] = useState('0');
  const [lostTicketFee, setLostTicketFee] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!rate;

  useEffect(() => {
    if (rate) {
      setRateName(rate.rate_name);
      setVehicleType(rate.vehicle_type);
      setUnit(rate.unit);
      setPrice(rate.price.toString());
      setGracePeriod((rate.grace_period_min || 0).toString());
      setLostTicketFee(rate.lost_ticket_fee?.toString() || '');
      setIsActive(rate.is_active !== false);
    } else {
      setRateName('');
      setVehicleType('car');
      setUnit('hour');
      setPrice('');
      setGracePeriod('0');
      setLostTicketFee('');
      setIsActive(true);
    }
  }, [rate, open]);

  const handleSubmit = async () => {
    if (!rateName.trim() || !price) return;

    setIsSaving(true);
    try {
      await onSave({
        id: rate?.id,
        rate_name: rateName.trim(),
        vehicle_type: vehicleType,
        unit,
        price: parseFloat(price),
        grace_period_min: parseInt(gracePeriod) || 0,
        lost_ticket_fee: lostTicketFee ? parseFloat(lostTicketFee) : undefined,
        is_active: isActive,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Tarifa' : 'Nueva Tarifa'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rateName">Nombre de la Tarifa</Label>
            <Input
              id="rateName"
              value={rateName}
              onChange={(e) => setRateName(e.target.value)}
              placeholder="Ej: Tarifa Estándar, Tarifa VIP"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicleType">Tipo de Vehículo</Label>
              <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unidad de Tiempo</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as RateUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitTypes.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Precio (COP)</Label>
              <Input
                id="price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gracePeriod">Periodo de Gracia (min)</Label>
              <Input
                id="gracePeriod"
                type="number"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lostTicketFee">Tarifa por Ticket Perdido (COP)</Label>
            <Input
              id="lostTicketFee"
              type="number"
              value={lostTicketFee}
              onChange={(e) => setLostTicketFee(e.target.value)}
              placeholder="Opcional"
              min="0"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cargo adicional cuando el cliente pierde el ticket de entrada
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <Label htmlFor="isActive">Estado de la Tarifa</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isActive ? 'Disponible para usar' : 'No disponible'}
              </p>
            </div>
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !rateName.trim() || !price}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
