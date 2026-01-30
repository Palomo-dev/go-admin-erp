'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { transportService, Vehicle, TransportCarrier, DriverCredential, Trip } from '@/lib/services/transportService';
import { 
  VehiclesHeader, 
  VehiclesList, 
  VehicleDialog,
  VehicleStatusDialog,
  AssignDriverDialog,
  VehicleHistoryDialog,
  ImportVehiclesDialog
} from '@/components/transporte/vehiculos';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function VehiculosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<TransportCarrier[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [drivers, setDrivers] = useState<DriverCredential[]>([]);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  
  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusVehicle, setStatusVehicle] = useState<Vehicle | null>(null);
  const [showDriverDialog, setShowDriverDialog] = useState(false);
  const [driverVehicle, setDriverVehicle] = useState<Vehicle | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [vehicleTrips, setVehicleTrips] = useState<Trip[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    
    setIsLoading(true);
    try {
      const [vehiclesData, carriersData, branchesData, driversData] = await Promise.all([
        transportService.getVehicles(organization.id),
        transportService.getCarriers(organization.id),
        transportService.getBranches(organization.id),
        transportService.getDrivers(organization.id),
      ]);
      setVehicles(vehiclesData);
      setCarriers(carriersData);
      setBranches(branchesData);
      setDrivers(driversData);
    } catch (error) {
      console.error('Error cargando vehículos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los vehículos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredVehicles = vehicles.filter((v) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      v.plate_number.toLowerCase().includes(term) ||
      (v.brand && v.brand.toLowerCase().includes(term)) ||
      (v.model && v.model.toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    const matchesType = typeFilter === 'all' || v.vehicle_type === typeFilter;
    const matchesCarrier = carrierFilter === 'all' || v.carrier_id === carrierFilter;
    return matchesSearch && matchesStatus && matchesType && matchesCarrier;
  });

  const handleNew = () => {
    setSelectedVehicle(null);
    setShowDialog(true);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setShowDialog(true);
  };

  const handleDelete = (vehicle: Vehicle) => {
    setVehicleToDelete(vehicle);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;
    
    try {
      await transportService.deleteVehicle(vehicleToDelete.id);
      toast({
        title: 'Éxito',
        description: 'Vehículo eliminado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando vehículo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el vehículo',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
      setVehicleToDelete(null);
    }
  };

  const handleSave = async (data: Partial<Vehicle>) => {
    if (!organization?.id) return;
    
    setIsSaving(true);
    try {
      if (selectedVehicle) {
        await transportService.updateVehicle(selectedVehicle.id, data);
        toast({
          title: 'Éxito',
          description: 'Vehículo actualizado correctamente',
        });
      } else {
        await transportService.createVehicle({
          ...data,
          organization_id: organization.id,
        });
        toast({
          title: 'Éxito',
          description: 'Vehículo creado correctamente',
        });
      }
      setShowDialog(false);
      loadData();
    } catch (error) {
      console.error('Error guardando vehículo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el vehículo',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = (vehicle: Vehicle) => {
    setSelectedVehicle({
      ...vehicle,
      id: '',
      plate_number: `${vehicle.plate_number}-COPY`,
    } as Vehicle);
    setShowDialog(true);
  };

  const handleChangeStatus = (vehicle: Vehicle) => {
    setStatusVehicle(vehicle);
    setShowStatusDialog(true);
  };

  const handleStatusChange = async (vehicleId: string, status: string) => {
    setIsSaving(true);
    try {
      await transportService.updateVehicle(vehicleId, { status: status as Vehicle['status'] });
      toast({
        title: 'Éxito',
        description: 'Estado actualizado correctamente',
      });
      setShowStatusDialog(false);
      loadData();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignDriver = (vehicle: Vehicle) => {
    setDriverVehicle(vehicle);
    setShowDriverDialog(true);
  };

  const handleDriverAssign = async (vehicleId: string, driverId: string | null) => {
    setIsSaving(true);
    try {
      await transportService.updateVehicle(vehicleId, { current_driver_id: driverId || undefined });
      toast({
        title: 'Éxito',
        description: driverId ? 'Conductor asignado correctamente' : 'Conductor removido',
      });
      setShowDriverDialog(false);
      loadData();
    } catch (error) {
      console.error('Error asignando conductor:', error);
      toast({
        title: 'Error',
        description: 'No se pudo asignar el conductor',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewHistory = async (vehicle: Vehicle) => {
    setHistoryVehicle(vehicle);
    setShowHistoryDialog(true);
    setIsLoadingHistory(true);
    
    try {
      const trips = await transportService.getVehicleTrips(vehicle.id);
      setVehicleTrips(trips);
    } catch (error) {
      console.error('Error cargando historial:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el historial',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleImport = async (vehiclesToImport: Partial<Vehicle>[]) => {
    if (!organization?.id) return { success: 0, errors: ['Organización no disponible'] };
    
    let success = 0;
    const errors: string[] = [];
    
    for (const vehicle of vehiclesToImport) {
      try {
        await transportService.createVehicle({
          ...vehicle,
          organization_id: organization.id,
        });
        success++;
      } catch (error) {
        errors.push(`${vehicle.plate_number}: ${String(error)}`);
      }
    }
    
    if (success > 0) {
      loadData();
    }
    
    return { success, errors };
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <VehiclesHeader
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        carrierFilter={carrierFilter}
        carriers={carriers}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onTypeChange={setTypeFilter}
        onCarrierChange={setCarrierFilter}
        onNew={handleNew}
        onImport={() => setShowImportDialog(true)}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      <VehiclesList
        vehicles={filteredVehicles}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onChangeStatus={handleChangeStatus}
        onAssignDriver={handleAssignDriver}
        onViewHistory={handleViewHistory}
      />

      <VehicleDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        vehicle={selectedVehicle}
        carriers={carriers}
        branches={branches}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <VehicleStatusDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        vehicle={statusVehicle}
        onStatusChange={handleStatusChange}
        isUpdating={isSaving}
      />

      <AssignDriverDialog
        open={showDriverDialog}
        onOpenChange={setShowDriverDialog}
        vehicle={driverVehicle}
        drivers={drivers}
        onAssignDriver={handleDriverAssign}
        isUpdating={isSaving}
      />

      <VehicleHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        vehicle={historyVehicle}
        trips={vehicleTrips}
        isLoading={isLoadingHistory}
      />

      <ImportVehiclesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vehículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el vehículo
              <strong> {vehicleToDelete?.plate_number}</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
