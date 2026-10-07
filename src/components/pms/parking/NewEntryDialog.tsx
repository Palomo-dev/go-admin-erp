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
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Car, Bike, Truck, Plus, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import ParkingService, { type ParkingZone } from '@/lib/services/parkingService';
import { useBranch } from '@/lib/context/BranchContext';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import { useTranslations } from 'next-intl';

interface NewEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: EntryData) => Promise<void>;
  branchId?: number;
}

export interface EntryData {
  branch_id: number;
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
  { value: 'car', icon: Car },
  { value: 'motorcycle', icon: Bike },
  { value: 'truck', icon: Truck },
];

export function NewEntryDialog({
  open,
  onOpenChange,
  onConfirm,
  branchId,
}: NewEntryDialogProps) {
  const t = useTranslations('pmsParking');
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
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');

  // Sucursal: se reutiliza el branchId del prop (página) como valor inicial,
  // pero se permite al usuario cambiarla dentro del formulario.
  const { selectedBranchId } = useBranch();
  const [formBranchId, setFormBranchId] = useState<number | null>(
    branchId ?? selectedBranchId ?? null
  );

  useEffect(() => {
    setFormBranchId(branchId ?? selectedBranchId ?? null);
  }, [branchId, selectedBranchId]);

  // Cargar espacios de parking y zonas disponibles
  useEffect(() => {
    const loadData = async () => {
      if (!open || !formBranchId) return;

      setIsLoadingSpaces(true);
      try {
        // Cargar espacios
        const { data, error } = await supabase
          .from('parking_spaces')
          .select('id, label, zone, type, state, zone_id')
          .eq('branch_id', formBranchId)
          .in('state', ['free', 'reserved'])
          .order('label');

        if (!error) {
          setParkingSpaces(data || []);
        }

        // Cargar zonas del catálogo
        const zonesData = await ParkingService.getZones(formBranchId);
        setZones(zonesData);
      } catch (error) {
        console.error('Error cargando datos:', error);
      } finally {
        setIsLoadingSpaces(false);
      }
    };

    loadData();
  }, [formBranchId, open]);

  // Limpiar formulario al cerrar
  useEffect(() => {
    if (!open) {
      setVehiclePlate('');
      setVehicleType('car');
      setParkingSpaceId('');
      setShowNewSpaceForm(false);
      setNewSpaceLabel('');
      setNewSpaceZone('');
      setSelectedZoneId('');
    }
  }, [open]);

  const handleCreateSpace = async () => {
    if (!newSpaceLabel.trim()) {
      alert(t('newEntryDialog.favorIngresaNombreEspacio'));
      return;
    }

    if (!formBranchId) {
      alert(t('newEntryDialog.errorNoEncontroSucursal'));
      return;
    }

    setIsCreatingSpace(true);
    try {
      // Obtener nombre de zona si se seleccionó una del catálogo
      const selectedZone = zones.find(z => z.id === selectedZoneId);
      const zoneName = selectedZone?.name || newSpaceZone.trim() || null;

      const { data, error } = await supabase
        .from('parking_spaces')
        .insert({
          branch_id: formBranchId,
          label: newSpaceLabel.trim(),
          zone: zoneName,
          zone_id: selectedZoneId || null,
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
      alert(t('newEntryDialog.errorCrearEspacio', { error: error.message || t('newEntryDialog.errorDesconocido') }));
    } finally {
      setIsCreatingSpace(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vehiclePlate.trim()) {
      return;
    }

    if (!formBranchId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        branch_id: formBranchId,
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
          <DialogTitle>{t('newEntryDialog.nuevaEntradaVehiculo')}</DialogTitle>
          <DialogDescription>
            {t('newEntryDialog.registraEntradaVehiculoEstacionamiento')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sucursal */}
          <BranchSelectorField
            value={formBranchId}
            onChange={setFormBranchId}
            required
          />

          <div className="space-y-2">
            <Label htmlFor="vehicle_plate">{t('newEntryDialog.placaVehiculo')}</Label>
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
            <Label htmlFor="vehicle_type">{t('newEntryDialog.tipoVehiculo')}</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {t(`newEntryDialog.vehiculos.${type.value}`)}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Espacio de Parqueo (Opcional) */}
          <div className="space-y-2">
            <Label htmlFor="parking_space">
              {t('newEntryDialog.espacioParqueoOpcional')}
            </Label>
              {!formBranchId ? (
                <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                  {t('newEntryDialog.noEncontroSucursalConfigurada')}
                </div>
              ) : isLoadingSpaces ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : parkingSpaces.length > 0 || showNewSpaceForm ? (
                <>
                  <Select 
                    value={parkingSpaceId || 'none'} 
                    onValueChange={(value) => setParkingSpaceId(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('newEntryDialog.sinEspacioAsignado')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('newEntryDialog.sinEspacioAsignado')}</SelectItem>
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
                    {showNewSpaceForm ? t('passVehiclesDialog.cancelar') : t('newEntryDialog.crearNuevoEspacio')}
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
                  {t('newEntryDialog.crearPrimerEspacio')}
                </Button>
              )}

            {showNewSpaceForm && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="new_space_label" className="text-sm font-medium">
                    {t('newEntryDialog.nombreEspacio')}
                  </Label>
                  <Input
                    id="new_space_label"
                    placeholder={t('newEntryDialog.ejA1P01')}
                    value={newSpaceLabel}
                    onChange={(e) => setNewSpaceLabel(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_space_zone" className="text-sm font-medium">
                    {t('newEntryDialog.zonaOpcional')}
                  </Label>
                  {zones.length > 0 ? (
                    <Select value={selectedZoneId} onValueChange={setSelectedZoneId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('newEntryDialog.seleccionarZona')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('newEntryDialog.sinZona')}</SelectItem>
                        {zones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id}>
                            {zone.name}
                            {zone.is_vip && ' (VIP)'}
                            {zone.is_covered && ' - Cubierta'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="new_space_zone"
                      placeholder={t('newEntryDialog.ejNivel1Zona')}
                      value={newSpaceZone}
                      onChange={(e) => setNewSpaceZone(e.target.value)}
                    />
                  )}
                </div>

                <Button
                  type="button"
                  onClick={handleCreateSpace}
                  disabled={!newSpaceLabel.trim() || isCreatingSpace || !formBranchId}
                  className="w-full"
                  size="sm"
                >
                  {isCreatingSpace ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('newEntryDialog.creando')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {t('newEntryDialog.guardarEspacio')}
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
              {t('passVehiclesDialog.cancelar')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !vehiclePlate.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('newEntryDialog.registrando')}
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
