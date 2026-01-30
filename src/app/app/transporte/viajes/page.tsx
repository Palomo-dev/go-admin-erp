'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  TripsHeader,
  TripsFilters,
  TripsList,
  TripDialog,
  TripsStats,
} from '@/components/transporte/viajes';
import { tripsService, type TripWithDetails } from '@/lib/services/tripsService';
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

interface Route {
  id: string;
  name: string;
  code: string;
}

interface Vehicle {
  id: string;
  plate: string;
  passenger_capacity?: number;
}

interface Driver {
  id: string;
  name: string;
}

interface Branch {
  id: number;
  name: string;
}

export default function ViajesPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Estados principales
  const [trips, setTrips] = useState<TripWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    scheduled: 0,
    boarding: 0,
    in_transit: 0,
    completed: 0,
    cancelled: 0,
    occupancy: 0,
  });

  // Datos de referencia
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(new Date());
  const [routeFilter, setRouteFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  // Diálogos
  const [showTripDialog, setShowTripDialog] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<TripWithDetails | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<TripWithDetails | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const dateStr = dateFilter ? dateFilter.toISOString().split('T')[0] : undefined;
      
      const [tripsData, statsData, routesData, vehiclesData, driversData, branchesData] = await Promise.all([
        tripsService.getTrips(organizationId, {
          date: dateStr,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          routeId: routeFilter !== 'all' ? routeFilter : undefined,
          vehicleId: vehicleFilter !== 'all' ? vehicleFilter : undefined,
          driverId: driverFilter !== 'all' ? driverFilter : undefined,
          branchId: branchFilter !== 'all' ? parseInt(branchFilter) : undefined,
        }),
        tripsService.getTripStats(organizationId, dateStr),
        tripsService.getRoutes(organizationId),
        tripsService.getVehicles(organizationId),
        tripsService.getDrivers(organizationId),
        tripsService.getBranches(organizationId),
      ]);

      setTrips(tripsData);
      setStats(statsData);
      setRoutes(routesData);
      setVehicles(vehiclesData);
      setDrivers(driversData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error loading trips:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los viajes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, dateFilter, statusFilter, routeFilter, vehicleFilter, driverFilter, branchFilter, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtrar por búsqueda
  const filteredTrips = trips.filter((trip) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      trip.trip_code.toLowerCase().includes(search) ||
      trip.transport_routes?.name?.toLowerCase().includes(search) ||
      trip.vehicles?.plate?.toLowerCase().includes(search)
    );
  });

  const hasFilters =
    searchTerm !== '' ||
    statusFilter !== 'all' ||
    routeFilter !== 'all' ||
    vehicleFilter !== 'all' ||
    driverFilter !== 'all' ||
    branchFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setRouteFilter('all');
    setVehicleFilter('all');
    setDriverFilter('all');
    setBranchFilter('all');
  };

  // Handlers
  const handleNew = () => {
    setSelectedTrip(null);
    setShowTripDialog(true);
  };

  const handleEdit = (trip: TripWithDetails) => {
    setSelectedTrip(trip);
    setShowTripDialog(true);
  };

  const handleDuplicate = async (trip: TripWithDetails) => {
    if (!organizationId) return;

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const newDate = tomorrow.toISOString().split('T')[0];

      await tripsService.duplicateTrip(trip.id, newDate);
      toast({
        title: 'Viaje duplicado',
        description: `Se ha creado una copia del viaje para ${newDate}`,
      });
      loadData();
    } catch (error) {
      console.error('Error duplicating trip:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el viaje',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (trip: TripWithDetails) => {
    setTripToDelete(trip);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!tripToDelete) return;

    try {
      await tripsService.deleteTrip(tripToDelete.id);
      toast({
        title: 'Viaje eliminado',
        description: 'El viaje ha sido eliminado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error deleting trip:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el viaje',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
      setTripToDelete(null);
    }
  };

  const handleStatusChange = async (trip: TripWithDetails, newStatus: string) => {
    try {
      await tripsService.updateTripStatus(trip.id, newStatus as TripWithDetails['status']);
      toast({
        title: 'Estado actualizado',
        description: `El viaje ahora está ${newStatus === 'boarding' ? 'en abordaje' : newStatus === 'in_transit' ? 'en ruta' : newStatus === 'completed' ? 'completado' : 'cancelado'}`,
      });
      loadData();
    } catch (error) {
      console.error('Error updating trip status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del viaje',
        variant: 'destructive',
      });
    }
  };

  const handleBoarding = (trip: TripWithDetails) => {
    handleStatusChange(trip, 'boarding');
  };

  const handleSaveTrip = async (data: Partial<TripWithDetails>) => {
    if (!organizationId) return;

    try {
      if (selectedTrip) {
        await tripsService.updateTrip(selectedTrip.id, data);
        toast({
          title: 'Viaje actualizado',
          description: 'Los cambios han sido guardados correctamente',
        });
      } else {
        await tripsService.createTrip({
          ...data,
          organization_id: organizationId,
          status: 'scheduled',
        });
        toast({
          title: 'Viaje creado',
          description: 'El viaje ha sido programado correctamente',
        });
      }
      loadData();
    } catch (error) {
      console.error('Error saving trip:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el viaje',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <TripsHeader
        onNew={handleNew}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      <TripsStats stats={stats} />

      <TripsFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateFilter={dateFilter}
        onDateChange={setDateFilter}
        routeFilter={routeFilter}
        onRouteChange={setRouteFilter}
        vehicleFilter={vehicleFilter}
        onVehicleChange={setVehicleFilter}
        driverFilter={driverFilter}
        onDriverChange={setDriverFilter}
        branchFilter={branchFilter}
        onBranchChange={setBranchFilter}
        routes={routes}
        vehicles={vehicles}
        drivers={drivers}
        branches={branches}
        onClearFilters={clearFilters}
        hasFilters={hasFilters}
      />

      <TripsList
        trips={filteredTrips}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        onBoarding={handleBoarding}
      />

      <TripDialog
        open={showTripDialog}
        onOpenChange={setShowTripDialog}
        trip={selectedTrip}
        routes={routes}
        vehicles={vehicles}
        drivers={drivers}
        branches={branches}
        onSave={handleSaveTrip}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el viaje{' '}
              <strong>{tripToDelete?.trip_code}</strong> y todos sus registros asociados.
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
