'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { transportService, DriverCredential, Trip } from '@/lib/services/transportService';
import { 
  DriversHeader, 
  DriversList, 
  DriverDialog,
  DriverStatusDialog,
  DriverHistoryDialog,
  ImportDriversDialog
} from '@/components/transporte/conductores';
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
import { isPast, addDays } from 'date-fns';

export default function ConductoresPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [drivers, setDrivers] = useState<DriverCredential[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; email: string }[]>([]);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverCredential | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<DriverCredential | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusDriver, setStatusDriver] = useState<DriverCredential | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyDriver, setHistoryDriver] = useState<DriverCredential | null>(null);
  const [driverTrips, setDriverTrips] = useState<Trip[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    
    setIsLoading(true);
    try {
      const [driversData, employeesData] = await Promise.all([
        transportService.getDrivers(organization.id),
        transportService.getAvailableEmployeesForDriver(organization.id),
      ]);
      
      setDrivers(driversData);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedEmployees = employeesData.map((emp: Record<string, unknown>) => ({
        id: emp.id as string,
        name: `${(emp.organization_members as Record<string, unknown>)?.profiles?.first_name || ''} ${(emp.organization_members as Record<string, unknown>)?.profiles?.last_name || ''}`.trim() || 'Sin nombre',
        email: ((emp.organization_members as Record<string, unknown>)?.profiles as Record<string, unknown>)?.email as string || '',
      }));
      setEmployees(formattedEmployees);
    } catch (error) {
      console.error('Error cargando conductores:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los conductores',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredDrivers = drivers.filter((d) => {
    const term = searchTerm.toLowerCase();
    const profile = d.employments?.organization_members?.profiles;
    const fullName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
    
    // Filtro de búsqueda
    const matchesSearch = fullName.toLowerCase().includes(term) ||
      d.license_number.toLowerCase().includes(term);
    
    // Filtro de categoría
    const matchesCategory = categoryFilter === 'all' || d.license_category === categoryFilter;
    
    // Filtro de estado
    let matchesStatus = true;
    if (statusFilter === 'active') {
      matchesStatus = d.is_active_driver === true;
    } else if (statusFilter === 'inactive') {
      matchesStatus = d.is_active_driver === false;
    } else if (statusFilter === 'expiring') {
      const licenseExpiry = new Date(d.license_expiry);
      const medicalExpiry = d.medical_cert_expiry ? new Date(d.medical_cert_expiry) : null;
      const soon = addDays(new Date(), 30);
      const licenseExpiring = licenseExpiry <= soon && !isPast(licenseExpiry);
      const medicalExpiring = medicalExpiry ? (medicalExpiry <= soon && !isPast(medicalExpiry)) : false;
      matchesStatus = licenseExpiring || medicalExpiring;
    } else if (statusFilter === 'expired') {
      const licenseExpiry = new Date(d.license_expiry);
      const medicalExpiry = d.medical_cert_expiry ? new Date(d.medical_cert_expiry) : null;
      matchesStatus = isPast(licenseExpiry) || !!(medicalExpiry && isPast(medicalExpiry));
    }
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleNew = () => {
    setSelectedDriver(null);
    setShowDialog(true);
  };

  const handleEdit = (driver: DriverCredential) => {
    setSelectedDriver(driver);
    setShowDialog(true);
  };

  const handleDelete = (driver: DriverCredential) => {
    setDriverToDelete(driver);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!driverToDelete) return;
    
    try {
      await transportService.deleteDriver(driverToDelete.id);
      toast({
        title: 'Éxito',
        description: 'Conductor eliminado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando conductor:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el conductor',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
      setDriverToDelete(null);
    }
  };

  const handleSave = async (data: Partial<DriverCredential>) => {
    if (!organization?.id) return;
    
    setIsSaving(true);
    try {
      if (selectedDriver) {
        await transportService.updateDriver(selectedDriver.id, data);
        toast({
          title: 'Éxito',
          description: 'Conductor actualizado correctamente',
        });
      } else {
        await transportService.createDriver({
          ...data,
          organization_id: organization.id,
        });
        toast({
          title: 'Éxito',
          description: 'Conductor creado correctamente',
        });
      }
      setShowDialog(false);
      loadData();
    } catch (error) {
      console.error('Error guardando conductor:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el conductor',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = (driver: DriverCredential) => {
    setSelectedDriver({
      ...driver,
      id: '',
      license_number: `${driver.license_number}-COPY`,
    } as DriverCredential);
    setShowDialog(true);
  };

  const handleToggleStatus = (driver: DriverCredential) => {
    setStatusDriver(driver);
    setShowStatusDialog(true);
  };

  const handleStatusChange = async (driverId: string, isActive: boolean) => {
    setIsSaving(true);
    try {
      await transportService.updateDriver(driverId, { is_active_driver: isActive });
      toast({
        title: 'Éxito',
        description: isActive ? 'Conductor activado' : 'Conductor desactivado',
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

  const handleViewHistory = async (driver: DriverCredential) => {
    setHistoryDriver(driver);
    setShowHistoryDialog(true);
    setIsLoadingHistory(true);
    
    try {
      const trips = await transportService.getDriverTrips(driver.id);
      setDriverTrips(trips);
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

  const handleImport = async (driversToImport: Partial<DriverCredential>[]) => {
    if (!organization?.id) return { success: 0, errors: ['Organización no disponible'] };
    
    let success = 0;
    const errors: string[] = [];
    
    for (const driver of driversToImport) {
      try {
        await transportService.createDriver({
          ...driver,
          organization_id: organization.id,
        });
        success++;
      } catch (error) {
        errors.push(`${driver.license_number}: ${String(error)}`);
      }
    }
    
    if (success > 0) {
      loadData();
    }
    
    return { success, errors };
  };

  const getDriverName = (driver: DriverCredential | null) => {
    if (!driver) return '';
    const profile = driver.employments?.organization_members?.profiles;
    return profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : driver.license_number;
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <DriversHeader
        searchTerm={searchTerm}
        categoryFilter={categoryFilter}
        statusFilter={statusFilter}
        onSearchChange={setSearchTerm}
        onCategoryChange={setCategoryFilter}
        onStatusChange={setStatusFilter}
        onNew={handleNew}
        onImport={() => setShowImportDialog(true)}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      <DriversList
        drivers={filteredDrivers}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onToggleStatus={handleToggleStatus}
        onViewHistory={handleViewHistory}
      />

      <DriverDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        driver={selectedDriver}
        employees={employees}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <DriverStatusDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        driver={statusDriver}
        onToggleStatus={handleStatusChange}
        isUpdating={isSaving}
      />

      <DriverHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        driver={historyDriver}
        trips={driverTrips}
        isLoading={isLoadingHistory}
      />

      <ImportDriversDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conductor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán las credenciales del conductor
              <strong> {getDriverName(driverToDelete)}</strong> permanentemente.
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
