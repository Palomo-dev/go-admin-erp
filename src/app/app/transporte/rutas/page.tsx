'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  transportRoutesService,
  TransportRoute,
  RouteInput,
} from '@/lib/services/transportRoutesService';
import {
  RoutesHeader,
  RoutesList,
  RouteDialog,
  ImportRoutesDialog,
} from '@/components/transporte/rutas';
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

export default function RutasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<TransportRoute | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<TransportRoute | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const data = await transportRoutesService.getRoutes(organization.id);
      setRoutes(data);
    } catch (error) {
      console.error('Error cargando rutas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las rutas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNewRoute = () => {
    setSelectedRoute(null);
    setDialogOpen(true);
  };

  const handleEdit = (route: TransportRoute) => {
    setSelectedRoute(route);
    setDialogOpen(true);
  };

  const handleSave = async (data: RouteInput) => {
    if (!organization?.id) return;

    try {
      if (selectedRoute) {
        await transportRoutesService.updateRoute(selectedRoute.id, data);
        toast({ title: 'Ruta actualizada', description: 'Los cambios han sido guardados' });
      } else {
        await transportRoutesService.createRoute(organization.id, data);
        toast({ title: 'Ruta creada', description: 'La ruta ha sido agregada' });
      }
      loadData();
    } catch (error) {
      console.error('Error guardando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la ruta',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDelete = (route: TransportRoute) => {
    setRouteToDelete(route);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!routeToDelete) return;

    try {
      await transportRoutesService.deleteRoute(routeToDelete.id);
      toast({ title: 'Ruta eliminada', description: 'La ruta ha sido eliminada' });
      loadData();
    } catch (error) {
      console.error('Error eliminando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la ruta',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setRouteToDelete(null);
    }
  };

  const handleDuplicate = async (route: TransportRoute) => {
    if (!organization?.id) return;

    try {
      await transportRoutesService.duplicateRoute(route.id, organization.id);
      toast({ title: 'Ruta duplicada', description: 'Se ha creado una copia de la ruta' });
      loadData();
    } catch (error) {
      console.error('Error duplicando ruta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la ruta',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (route: TransportRoute) => {
    try {
      await transportRoutesService.toggleRouteStatus(route.id, !route.is_active);
      toast({
        title: route.is_active ? 'Ruta desactivada' : 'Ruta activada',
        description: `La ruta ahora está ${route.is_active ? 'inactiva' : 'activa'}`,
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

  const handleViewSchedules = (route: TransportRoute) => {
    router.push(`/app/transporte/horarios?route=${route.id}`);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <RoutesHeader
        onRefresh={loadData}
        onNewRoute={handleNewRoute}
        onImport={() => setImportDialogOpen(true)}
        isLoading={isLoading}
      />

      <RoutesList
        routes={routes}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onToggleStatus={handleToggleStatus}
        onViewSchedules={handleViewSchedules}
      />

      <RouteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        route={selectedRoute}
        organizationId={organization?.id || 0}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ruta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la ruta, sus paradas y horarios asociados. Esta acción no se puede deshacer.
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

      <ImportRoutesDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        organizationId={organization?.id || 0}
        onImportComplete={loadData}
      />
    </div>
  );
}
