'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  transportRoutesService,
  TransportRoute,
  RouteSchedule,
  ScheduleInput,
} from '@/lib/services/transportRoutesService';
import {
  SchedulesHeader,
  SchedulesList,
  ScheduleDialog,
  GenerateTripsDialog,
} from '@/components/transporte/horarios';
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

interface Vehicle {
  id: string;
  plate_number: string;
  model?: string;
  capacity_passengers?: number;
}

interface Driver {
  id: string;
  license_number: string;
  license_category?: string;
}

export default function HorariosPage() {
  const searchParams = useSearchParams();
  const routeParam = searchParams.get('route');
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [schedules, setSchedules] = useState<RouteSchedule[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<RouteSchedule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<RouteSchedule | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [scheduleToGenerate, setScheduleToGenerate] = useState<RouteSchedule | null>(null);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const [schedulesData, routesData, vehiclesData, driversData] = await Promise.all([
        transportRoutesService.getSchedules(organization.id),
        transportRoutesService.getRoutes(organization.id),
        transportRoutesService.getVehicles(organization.id),
        transportRoutesService.getDrivers(organization.id),
      ]);
      
      setSchedules(schedulesData);
      setRoutes(routesData);
      setVehicles(vehiclesData);
      setDrivers(driversData);
    } catch (error) {
      console.error('Error cargando horarios:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los horarios',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNewSchedule = () => {
    setSelectedSchedule(null);
    setDialogOpen(true);
  };

  const handleEdit = (schedule: RouteSchedule) => {
    setSelectedSchedule(schedule);
    setDialogOpen(true);
  };

  const handleSave = async (data: ScheduleInput) => {
    if (!organization?.id) return;

    try {
      if (selectedSchedule) {
        await transportRoutesService.updateSchedule(selectedSchedule.id, data);
        toast({ title: 'Horario actualizado', description: 'Los cambios han sido guardados' });
      } else {
        await transportRoutesService.createSchedule(organization.id, data);
        toast({ title: 'Horario creado', description: 'El horario ha sido agregado' });
      }
      loadData();
    } catch (error) {
      console.error('Error guardando horario:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el horario',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDelete = (schedule: RouteSchedule) => {
    setScheduleToDelete(schedule);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!scheduleToDelete) return;

    try {
      await transportRoutesService.deleteSchedule(scheduleToDelete.id);
      toast({ title: 'Horario eliminado', description: 'El horario ha sido eliminado' });
      loadData();
    } catch (error) {
      console.error('Error eliminando horario:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el horario',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
    }
  };

  const handleDuplicate = async (schedule: RouteSchedule) => {
    if (!organization?.id) return;

    try {
      await transportRoutesService.duplicateSchedule(schedule.id, organization.id);
      toast({ title: 'Horario duplicado', description: 'Se ha creado una copia del horario' });
      loadData();
    } catch (error) {
      console.error('Error duplicando horario:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el horario',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (schedule: RouteSchedule) => {
    try {
      await transportRoutesService.toggleScheduleStatus(schedule.id, !schedule.is_active);
      toast({
        title: schedule.is_active ? 'Horario desactivado' : 'Horario activado',
        description: `El horario ahora está ${schedule.is_active ? 'inactivo' : 'activo'}`,
      });
      loadData();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateTrips = (schedule: RouteSchedule) => {
    setScheduleToGenerate(schedule);
    setGenerateDialogOpen(true);
  };

  const handleGenerateSuccess = () => {
    toast({
      title: 'Viajes generados',
      description: 'Los viajes han sido creados exitosamente',
    });
    loadData();
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <SchedulesHeader
        onRefresh={loadData}
        onNewSchedule={handleNewSchedule}
        isLoading={isLoading}
      />

      <SchedulesList
        schedules={schedules}
        routes={routes}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onToggleStatus={handleToggleStatus}
        onGenerateTrips={handleGenerateTrips}
      />

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schedule={selectedSchedule}
        routes={routes}
        vehicles={vehicles}
        drivers={drivers}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar horario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El horario será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {organization?.id && (
        <GenerateTripsDialog
          open={generateDialogOpen}
          onOpenChange={setGenerateDialogOpen}
          schedule={scheduleToGenerate}
          organizationId={organization.id}
          onSuccess={handleGenerateSuccess}
        />
      )}
    </div>
  );
}
