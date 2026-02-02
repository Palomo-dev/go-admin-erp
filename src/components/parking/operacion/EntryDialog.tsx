'use client';

import { useState, useEffect } from 'react';
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
import { Loader2, Car, Bike, Truck, LogIn } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface ParkingSpace {
  id: string;
  label: string;
  zone?: string;
  type: string;
  state: string;
}

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    vehicle_plate: string;
    vehicle_type: string;
    parking_space_id?: string;
    notes?: string;
  }) => Promise<void>;
  availableSpaces: ParkingSpace[];
  initialPlate?: string;
  isLoading?: boolean;
}

const vehicleTypes = [
  { value: 'car', label: 'Carro', icon: Car },
  { value: 'motorcycle', label: 'Moto', icon: Bike },
  { value: 'truck', label: 'Camión', icon: Truck },
];

export function EntryDialog({
  open,
  onOpenChange,
  onSubmit,
  availableSpaces,
  initialPlate = '',
  isLoading,
}: EntryDialogProps) {
  const [vehiclePlate, setVehiclePlate] = useState(initialPlate);
  const [vehicleType, setVehicleType] = useState('car');
  const [selectedSpace, setSelectedSpace] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setVehiclePlate(initialPlate);
      setVehicleType('car');
      setSelectedSpace('');
      setNotes('');
    }
  }, [open, initialPlate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehiclePlate.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        vehicle_plate: vehiclePlate.toUpperCase().trim(),
        vehicle_type: vehicleType,
        parking_space_id: selectedSpace && selectedSpace !== 'none' ? selectedSpace : undefined,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrar espacios por tipo de vehículo compatible
  const filteredSpaces = availableSpaces.filter(
    (space) => space.state === 'free' && (space.type === vehicleType || space.type === 'any')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <LogIn className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            Registrar Entrada
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plate" className="text-gray-700 dark:text-gray-300">
              Placa del Vehículo *
            </Label>
            <Input
              id="plate"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-lg font-mono"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Tipo de Vehículo
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {vehicleTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Button
                    key={type.value}
                    type="button"
                    variant={vehicleType === type.value ? 'default' : 'outline'}
                    className={cn(
                      'flex flex-col items-center gap-1 h-auto py-3',
                      vehicleType === type.value && 'bg-blue-600 hover:bg-blue-700'
                    )}
                    onClick={() => setVehicleType(type.value)}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs">{type.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space" className="text-gray-700 dark:text-gray-300">
              Espacio (Opcional)
            </Label>
            <Select value={selectedSpace} onValueChange={setSelectedSpace}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Seleccionar espacio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {filteredSpaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.label} {space.zone && `(${space.zone})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredSpaces.length === 0 && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                No hay espacios disponibles para este tipo de vehículo
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
              Notas (Opcional)
            </Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del vehículo..."
              className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!vehiclePlate.trim() || submitting || isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  Registrar Entrada
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
