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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Car, Plus, Trash2, Star, StarOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import parkingService, { type ParkingPass, type ParkingVehicle } from '@/lib/services/parkingService';
import { useTranslations } from 'next-intl';

interface PassVehiclesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pass: ParkingPass;
  organizationId: number;
  onSuccess: () => void;
}

interface VehicleForm {
  plate: string;
  brand: string;
  model: string;
  color: string;
  vehicle_type: string;
}

export function PassVehiclesDialog({
  open,
  onOpenChange,
  pass,
  organizationId,
  onSuccess,
}: PassVehiclesDialogProps) {
  const t = useTranslations('pmsParking');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [availableVehicles, setAvailableVehicles] = useState<ParkingVehicle[]>([]);

  const [newVehicle, setNewVehicle] = useState<VehicleForm>({
    plate: '',
    brand: '',
    model: '',
    color: '',
    vehicle_type: 'car',
  });

  // Cargar vehículos disponibles de la organización
  useEffect(() => {
    if (open && organizationId) {
      loadAvailableVehicles();
    }
  }, [open, organizationId]);

  const loadAvailableVehicles = async () => {
    try {
      const vehicles = await parkingService.getVehicles(organizationId);
      // Filtrar vehículos que ya están en el pase
      const passVehicleIds = pass.vehicles?.map(v => v.vehicle_id) || [];
      setAvailableVehicles(vehicles.filter(v => !passVehicleIds.includes(v.id)));
    } catch (error) {
      console.error('Error loading vehicles:', error);
    }
  };

  const handleAddExistingVehicle = async (vehicleId: string) => {
    setIsAdding(true);
    try {
      await parkingService.addVehicleToPass(pass.id, vehicleId, false);
      toast({
        title: t('passVehiclesDialog.vehiculoAgregado'),
        description: t('passVehiclesDialog.vehiculoHaAsociadoPase'),
      });
      onSuccess();
      loadAvailableVehicles();
    } catch (error) {
      console.error('Error adding vehicle:', error);
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('passVehiclesDialog.noPudoAgregarVehiculo'),
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateAndAddVehicle = async () => {
    if (!newVehicle.plate.trim()) {
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('passVehiclesDialog.placaRequerida'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Crear o obtener vehículo
      const vehicle = await parkingService.getOrCreateVehicle({
        organization_id: organizationId,
        customer_id: pass.customer_id,
        plate: newVehicle.plate.toUpperCase().trim(),
        brand: newVehicle.brand,
        model: newVehicle.model,
        color: newVehicle.color,
        vehicle_type: newVehicle.vehicle_type,
      });

      // Asociar al pase
      await parkingService.addVehicleToPass(pass.id, vehicle.id, false);

      toast({
        title: t('passVehiclesDialog.vehiculoCreadoAgregado'),
        description: t('passVehiclesDialog.vehiculoHaRegistradoAsociado'),
      });

      setNewVehicle({ plate: '', brand: '', model: '', color: '', vehicle_type: 'car' });
      setShowAddForm(false);
      onSuccess();
      loadAvailableVehicles();
    } catch (error) {
      console.error('Error creating vehicle:', error);
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('passVehiclesDialog.noPudoCrearVehiculo'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveVehicle = async (vehicleId: string) => {
    if (pass.vehicles && pass.vehicles.length <= 1) {
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('passVehiclesDialog.paseDebeTenerMenos'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await parkingService.removeVehicleFromPass(pass.id, vehicleId);
      toast({
        title: t('passVehiclesDialog.vehiculoRemovido'),
        description: t('passVehiclesDialog.vehiculoHaDesasociadoPase'),
      });
      onSuccess();
      loadAvailableVehicles();
    } catch (error) {
      console.error('Error removing vehicle:', error);
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('passVehiclesDialog.noPudoRemoverVehiculo'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPrimary = async (vehicleId: string) => {
    setIsLoading(true);
    try {
      // Actualizar el pase con el nuevo vehículo principal
      const updatedVehicles = pass.vehicles?.map(v => ({
        plate: v.vehicle?.plate || '',
        brand: v.vehicle?.brand || '',
        model: v.vehicle?.model || '',
        color: v.vehicle?.color || '',
        vehicle_type: v.vehicle?.vehicle_type || 'car',
        is_primary: v.vehicle_id === vehicleId,
      })) || [];

      await parkingService.updatePass(pass.id, { vehicles: updatedVehicles });

      toast({
        title: t('passVehiclesDialog.vehiculoPrincipalActualizado'),
        description: t('passVehiclesDialog.haEstablecidoVehiculoPrincipal'),
      });
      onSuccess();
    } catch (error) {
      console.error('Error setting primary vehicle:', error);
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('passVehiclesDialog.noPudoActualizarVehiculo'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex flex-wrap items-center gap-2">
            <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t('passVehiclesDialog.gestionarVehiculosPase')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vehículos actuales del pase */}
          <div>
            <Label className="dark:text-gray-200 mb-2 block">{t('passVehiclesDialog.vehiculosAsociados')}</Label>
            <div className="space-y-2">
              {pass.vehicles?.map((pv) => (
                <div
                  key={pv.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border dark:border-gray-700"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Car className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold dark:text-white">
                          {pv.vehicle?.plate}
                        </span>
                        {pv.is_primary && (
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                            {t('passVehiclesDialog.principal')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {[pv.vehicle?.brand, pv.vehicle?.model, pv.vehicle?.color]
                          .filter(Boolean)
                          .join(' • ') || t('passVehiclesDialog.sinDetalles')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {!pv.is_primary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimary(pv.vehicle_id)}
                        disabled={isLoading}
                        title={t('passVehiclesDialog.marcarComoPrincipal')}
                      >
                        <StarOff className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </Button>
                    )}
                    {pv.is_primary && (
                      <Star className="h-4 w-4 text-yellow-500 mx-2" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveVehicle(pv.vehicle_id)}
                      disabled={isLoading || (pass.vehicles?.length || 0) <= 1}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agregar vehículo existente */}
          {availableVehicles.length > 0 && (
            <div>
              <Label className="dark:text-gray-200 mb-2 block">
                {t('passVehiclesDialog.agregarVehiculoExistente')}
              </Label>
              <Select onValueChange={handleAddExistingVehicle} disabled={isAdding}>
                <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                  <SelectValue placeholder={t('passVehiclesDialog.seleccionarVehiculo')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate} - {vehicle.brand} {vehicle.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Formulario para nuevo vehículo */}
          {showAddForm ? (
            <div className="p-4 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <Label className="dark:text-gray-200 mb-3 block">{t('passVehiclesDialog.nuevoVehiculo')}</Label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Input
                  placeholder={t('passVehiclesDialog.placa')}
                  value={newVehicle.plate}
                  onChange={(e) =>
                    setNewVehicle({ ...newVehicle, plate: e.target.value.toUpperCase() })
                  }
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
                <Select
                  value={newVehicle.vehicle_type}
                  onValueChange={(v) => setNewVehicle({ ...newVehicle, vehicle_type: v })}
                >
                  <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800">
                    <SelectItem value="car">{t('passVehiclesDialog.carro')}</SelectItem>
                    <SelectItem value="motorcycle">{t('passVehiclesDialog.moto')}</SelectItem>
                    <SelectItem value="truck">{t('passVehiclesDialog.camion')}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={t('passVehiclesDialog.marca')}
                  value={newVehicle.brand}
                  onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
                <Input
                  placeholder={t('passVehiclesDialog.modelo')}
                  value={newVehicle.model}
                  onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                  className="dark:border-gray-600"
                >
                  {t('passVehiclesDialog.cancelar')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateAndAddVehicle}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('passVehiclesDialog.agregar')
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full dark:border-gray-600"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('passVehiclesDialog.crearNuevoVehiculo')}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600"
          >
            {t('passVehiclesDialog.cerrar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PassVehiclesDialog;
