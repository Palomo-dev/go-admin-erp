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
import { Loader2, Car, Bike, Truck, Plus, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';

interface NewEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: EntryData) => Promise<void>;
  branchId?: number;
}

export interface EntryData {
  vehicle_plate: string;
  vehicle_type: string;
  parking_space_id?: string;
}

interface ParkingSpace {
  id: string;
  label: string;
  zone?: string;
  type: string;
  state: string;
}

const VEHICLE_TYPES = [
  { value: 'car', label: 'Automóvil', icon: Car },
  { value: 'motorcycle', label: 'Motocicleta', icon: Bike },
  { value: 'truck', label: 'Camioneta', icon: Truck },
];

export function NewEntryDialog({
  open,
  onOpenChange,
  onConfirm,
  branchId,
}: NewEntryDialogProps) {
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('car');
  const [parkingSpaceId, setParkingSpaceId] = useState<string>('');
  const [parkingSpaces, setParkingSpaces] = useState<ParkingSpace[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [showNewSpaceForm, setShowNewSpaceForm] = useState(false);
  const [newSpaceLabel, setNewSpaceLabel] = useState('');
  const [newSpaceZone, setNewSpaceZone] = useState('');
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);

  // Cargar espacios disponibles
  useEffect(() => {
    const loadParkingSpaces = async () => {
      if (!branchId || !open) return;

      setIsLoadingSpaces(true);
      try {
        const { data, error } = await supabase
          .from('parking_spaces')
          .select('id, label, zone, type, state')
          .eq('branch_id', branchId)
          .in('state', ['free', 'reserved'])
          .order('label');

        if (error) throw error;
        setParkingSpaces(data || []);
      } catch (error) {
        console.error('Error cargando espacios:', error);
      } finally {
        setIsLoadingSpaces(false);
      }
    };

    loadParkingSpaces();
  }, [branchId, open]);

  // Limpiar formulario al cerrar
  useEffect(() => {
    if (!open) {
      setVehiclePlate('');
      setVehicleType('car');
      setParkingSpaceId('');
      setShowNewSpaceForm(false);
      setNewSpaceLabel('');
      setNewSpaceZone('');
    }
  }, [open]);

  const handleCreateSpace = async () => {
    console.log('handleCreateSpace llamado con:', {
      newSpaceLabel,
      newSpaceLabelTrim: newSpaceLabel.trim(),
      newSpaceZone,
      branchId,
      validacion: {
        tieneLabel: !!newSpaceLabel.trim(),
        tieneBranchId: !!branchId
      }
    });

    if (!newSpaceLabel.trim()) {
      alert('Por favor ingresa un nombre para el espacio');
      return;
    }

    if (!branchId) {
      console.error('Validación falló: No hay branch_id disponible');
      alert('Error: No se encontró la sucursal. Por favor recarga la página e intenta nuevamente.');
      return;
    }

    setIsCreatingSpace(true);
    try {
      console.log('Creando espacio:', {
        branch_id: branchId,
        label: newSpaceLabel.trim(),
        zone: newSpaceZone.trim() || null,
      });

      const { data, error } = await supabase
        .from('parking_spaces')
        .insert({
          branch_id: branchId,
          label: newSpaceLabel.trim(),
          zone: newSpaceZone.trim() || null,
          type: 'car',
          state: 'free',
        })
        .select()
        .single();

      if (error) {
        console.error('Error de Supabase:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('Espacio creado exitosamente:', data);

      // Agregar el nuevo espacio a la lista
      setParkingSpaces((prev) => [...prev, data as ParkingSpace]);
      
      // Seleccionar automáticamente el nuevo espacio
      setParkingSpaceId(data.id);

      // Limpiar y cerrar formulario
      setNewSpaceLabel('');
      setNewSpaceZone('');
      setShowNewSpaceForm(false);
    } catch (error: any) {
      console.error('Error completo creando espacio:', error);
      alert(`Error al crear espacio: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsCreatingSpace(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vehiclePlate.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        vehicle_plate: vehiclePlate.toUpperCase().trim(),
        vehicle_type: vehicleType,
        parking_space_id: parkingSpaceId || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error al crear entrada:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nueva Entrada de Vehículo</DialogTitle>
          <DialogDescription>
            Registra la entrada de un vehículo al estacionamiento
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicle_plate">Placa del Vehículo *</Label>
            <Input
              id="vehicle_plate"
              placeholder="ABC123"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              className="uppercase"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle_type">Tipo de Vehículo *</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger>
                <SelectValue />
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

          <div className="space-y-2">
            <Label htmlFor="parking_space">
              Espacio de Parqueo (Opcional)
            </Label>
            {!branchId ? (
              <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                ⚠️ No se encontró una sucursal configurada. No puedes crear espacios de parqueo sin una sucursal.
              </div>
            ) : isLoadingSpaces ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando espacios...
              </div>
            ) : parkingSpaces.length > 0 || showNewSpaceForm ? (
              <>
                <Select 
                  value={parkingSpaceId || 'none'} 
                  onValueChange={(value) => setParkingSpaceId(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin espacio asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin espacio asignado</SelectItem>
                    {parkingSpaces.map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.label}
                        {space.zone && ` - ${space.zone}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewSpaceForm(!showNewSpaceForm)}
                  className="w-full mt-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {showNewSpaceForm ? 'Cancelar' : 'Crear Nuevo Espacio'}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewSpaceForm(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Primer Espacio
              </Button>
            )}

            {showNewSpaceForm && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="new_space_label" className="text-sm font-medium">
                    Nombre del Espacio *
                  </Label>
                  <Input
                    id="new_space_label"
                    placeholder="Ej: A1, P-01, Espacio 1"
                    value={newSpaceLabel}
                    onChange={(e) => setNewSpaceLabel(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_space_zone" className="text-sm font-medium">
                    Zona (Opcional)
                  </Label>
                  <Input
                    id="new_space_zone"
                    placeholder="Ej: Nivel 1, Zona A, Exterior"
                    value={newSpaceZone}
                    onChange={(e) => setNewSpaceZone(e.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleCreateSpace}
                  disabled={!newSpaceLabel.trim() || isCreatingSpace || !branchId}
                  className="w-full"
                  size="sm"
                >
                  {isCreatingSpace ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Guardar Espacio
                    </>
                  )}
                </Button>
              </div>
            )}
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
            <Button type="submit" disabled={isSubmitting || !vehiclePlate.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Registrar Entrada'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
