'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  transportRoutesService,
  TransportRoute,
  TransportStop,
  RouteStop,
  RouteInput,
  RouteStopInput,
} from '@/lib/services/transportRoutesService';
import {
  RouteDetailHeader,
  RouteInfo,
  RouteMap,
  RouteStopsList,
  RouteStopDialog,
  RouteTripsHistory,
} from '@/components/transporte/rutas/[id]';
import { RouteDialog } from '@/components/transporte/rutas';
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
import { Skeleton } from '@/components/ui/skeleton';

export default function RouteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const routeId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [route, setRoute] = useState<TransportRoute | null>(null);
  const [availableStops, setAvailableStops] = useState<TransportStop[]>([]);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [deleteStopDialogOpen, setDeleteStopDialogOpen] = useState(false);
  const [stopToDelete, setStopToDelete] = useState<RouteStop | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const [routeData, stopsData] = await Promise.all([
        transportRoutesService.getRouteById(routeId),
        transportRoutesService.getStops(organization.id),
      ]);
      
      if (!routeData) {
        toast({ title: 'Error', description: 'Ruta no encontrada', variant: 'destructive' });
        router.push('/app/transporte/rutas');
        return;
      }
      
      setRoute(routeData);
      setAvailableStops(stopsData);
    } catch (error) {
      console.error('Error cargando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la ruta',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, routeId, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditRoute = async (data: RouteInput) => {
    try {
      await transportRoutesService.updateRoute(routeId, data);
      toast({ title: 'Ruta actualizada', description: 'Los cambios han sido guardados' });
      loadData();
    } catch (error) {
      console.error('Error actualizando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la ruta',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDuplicate = async () => {
    if (!organization?.id || !route) return;

    try {
      const newRoute = await transportRoutesService.duplicateRoute(routeId, organization.id);
      toast({ title: 'Ruta duplicada', description: 'Se ha creado una copia de la ruta' });
      router.push(`/app/transporte/rutas/${newRoute.id}`);
    } catch (error) {
      console.error('Error duplicando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la ruta',
        variant: 'destructive',
      });
    }
  };

  const handleAddStop = () => {
    setSelectedStop(null);
    setStopDialogOpen(true);
  };

  const handleEditStop = (stop: RouteStop) => {
    setSelectedStop(stop);
    setStopDialogOpen(true);
  };

  const handleSaveStop = async (data: RouteStopInput) => {
    try {
      if (selectedStop) {
        await transportRoutesService.updateRouteStop(selectedStop.id, data);
        toast({ title: 'Parada actualizada', description: 'Los cambios han sido guardados' });
      } else {
        await transportRoutesService.addRouteStop(routeId, data);
        toast({ title: 'Parada agregada', description: 'La parada ha sido agregada a la ruta' });
      }
      loadData();
    } catch (error) {
      console.error('Error guardando parada:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la parada',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteStop = (stop: RouteStop) => {
    setStopToDelete(stop);
    setDeleteStopDialogOpen(true);
  };

  const confirmDeleteStop = async () => {
    if (!stopToDelete) return;

    try {
      await transportRoutesService.deleteRouteStop(stopToDelete.id);
      toast({ title: 'Parada eliminada', description: 'La parada ha sido removida de la ruta' });
      loadData();
    } catch (error) {
      console.error('Error eliminando parada:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la parada',
        variant: 'destructive',
      });
    } finally {
      setDeleteStopDialogOpen(false);
      setStopToDelete(null);
    }
  };

  const handleReorderStops = async (stops: { id: string; stop_order: number }[]) => {
    try {
      await transportRoutesService.reorderRouteStops(routeId, stops);
      loadData();
    } catch (error) {
      console.error('Error reordenando paradas:', error);
      toast({
        title: 'Error',
        description: 'No se pudo reordenar las paradas',
        variant: 'destructive',
      });
    }
  };

  const handleRecalculateRoute = async () => {
    if (!route?.route_stops || route.route_stops.length < 2) {
      toast({
        title: 'Error',
        description: 'Se necesitan al menos 2 paradas para recalcular la ruta',
        variant: 'destructive',
      });
      return;
    }

    setIsRecalculating(true);
    try {
      const { googleMapsService } = await import('@/lib/services/googleMapsService');
      
      const stopsWithCoords = route.route_stops.filter(
        (s) => s.transport_stops?.latitude && s.transport_stops?.longitude
      );

      if (stopsWithCoords.length < 2) {
        toast({
          title: 'Error',
          description: 'Las paradas no tienen coordenadas válidas',
          variant: 'destructive',
        });
        return;
      }

      const origin = {
        lat: stopsWithCoords[0].transport_stops!.latitude!,
        lng: stopsWithCoords[0].transport_stops!.longitude!,
      };
      const destination = {
        lat: stopsWithCoords[stopsWithCoords.length - 1].transport_stops!.latitude!,
        lng: stopsWithCoords[stopsWithCoords.length - 1].transport_stops!.longitude!,
      };
      const waypoints = stopsWithCoords.slice(1, -1).map((s) => ({
        location: {
          lat: s.transport_stops!.latitude!,
          lng: s.transport_stops!.longitude!,
        },
        stopover: true,
      }));

      const result = await googleMapsService.getDirections({
        origin,
        destination,
        waypoints,
        travelMode: 'DRIVING',
      });

      if (result) {
        await transportRoutesService.updateRoute(routeId, {
          estimated_distance_km: result.distance.value / 1000,
          estimated_duration_minutes: Math.round(result.duration.value / 60),
          polyline_encoded: result.polyline,
        });

        toast({
          title: 'Ruta recalculada',
          description: `Distancia: ${result.distance.text}, Duración: ${result.duration.text}`,
        });
        loadData();
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo calcular la ruta con Google Maps',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error recalculando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo recalcular la ruta',
        variant: 'destructive',
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!route) {
    return null;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <RouteDetailHeader
        route={route}
        onRefresh={loadData}
        onEdit={() => setEditDialogOpen(true)}
        onDuplicate={handleDuplicate}
        isLoading={isLoading}
      />

      <RouteInfo route={route} />

      {/* Mapa de la Ruta */}
      <RouteMap
        route={route}
        onRecalculate={handleRecalculateRoute}
        isRecalculating={isRecalculating}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RouteStopsList
            stops={route.route_stops || []}
            onAddStop={handleAddStop}
            onEditStop={handleEditStop}
            onDeleteStop={handleDeleteStop}
            onReorder={handleReorderStops}
          />
        </div>
        <div>
          <RouteTripsHistory routeId={routeId} />
        </div>
      </div>

      <RouteDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        route={route}
        organizationId={organization?.id || 0}
        onSave={handleEditRoute}
      />

      <RouteStopDialog
        open={stopDialogOpen}
        onOpenChange={setStopDialogOpen}
        routeStop={selectedStop}
        availableStops={availableStops}
        currentStopsCount={route.route_stops?.length || 0}
        onSave={handleSaveStop}
      />

      <AlertDialog open={deleteStopDialogOpen} onOpenChange={setDeleteStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar parada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la parada &quot;{stopToDelete?.transport_stops?.name}&quot; de la ruta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteStop} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
