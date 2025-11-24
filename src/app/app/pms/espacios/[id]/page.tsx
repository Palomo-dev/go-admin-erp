'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SpaceDetailHeader,
  SpaceBasicInfo,
  SpaceReservations,
  SpaceHousekeeping,
  SpaceMaintenance,
  QuickReservationDrawer,
  AddConsumptionDialog,
} from '@/components/pms/espacios/id';
import { SpaceDialog } from '@/components/pms/espacios';
import SpacesService, { type Space, type SpaceType } from '@/lib/services/spacesService';
import SpaceConsumptionService from '@/lib/services/spaceConsumptionService';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { RefreshCw } from 'lucide-react';

export default function SpaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const spaceId = params.id as string;

  const [space, setSpace] = useState<Space | null>(null);
  const [spaceTypes, setSpaceTypes] = useState<SpaceType[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState<any[]>([]);
  const [maintenanceOrders, setMaintenanceOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialogs
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCleaningDialog, setShowCleaningDialog] = useState(false);
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showQuickReservationDrawer, setShowQuickReservationDrawer] = useState(false);
  const [showAddConsumptionDialog, setShowAddConsumptionDialog] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [cleaningNotes, setCleaningNotes] = useState('');
  const [cleaningDate, setCleaningDate] = useState(new Date().toISOString().split('T')[0]);
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [maintenancePriority, setMaintenancePriority] = useState<'low' | 'med' | 'high'>('med');

  useEffect(() => {
    if (spaceId && organization?.id) {
      loadData();
    }
  }, [spaceId, organization?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const [
        spaceData,
        typesData,
        reservationsData,
        housekeepingData,
        maintenanceData,
      ] = await Promise.all([
        SpacesService.getSpace(spaceId),
        SpacesService.getSpaceTypes(organization!.id),
        SpacesService.getSpaceReservations(spaceId),
        SpacesService.getSpaceHousekeepingTasks(spaceId),
        SpacesService.getSpaceMaintenanceOrders(spaceId),
      ]);

      setSpace(spaceData);
      setSpaceTypes(typesData);
      setReservations(reservationsData);
      setHousekeepingTasks(housekeepingData);
      setMaintenanceOrders(maintenanceData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del espacio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setShowEditDialog(true);
  };

  const handleSave = async (data: any) => {
    try {
      await SpacesService.updateSpace(spaceId, data);
      toast({
        title: 'Éxito',
        description: 'Espacio actualizado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error actualizando espacio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el espacio',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleMarkMaintenance = () => {
    // Si ya está en mantenimiento, quitarlo
    if (space?.status === 'maintenance') {
      handleRemoveMaintenance();
    } else {
      // Si no, abrir dialog para pedir nota
      setShowMaintenanceDialog(true);
    }
  };

  const handleRemoveMaintenance = async () => {
    if (!confirm('¿Quitar el estado de mantenimiento?')) return;

    try {
      await SpacesService.updateSpace(spaceId, {
        status: 'available',
        maintenance_notes: '', // Limpiar la nota
      });
      
      toast({
        title: 'Éxito',
        description: 'Espacio marcado como disponible',
      });
      
      loadData();
    } catch (error) {
      console.error('Error quitando mantenimiento:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el espacio',
        variant: 'destructive',
      });
    }
  };

  const handleSaveMaintenance = async () => {
    if (!maintenanceNotes.trim()) {
      toast({
        title: 'Nota requerida',
        description: 'Por favor ingresa el motivo del mantenimiento',
        variant: 'destructive',
      });
      return;
    }

    if (!space?.branch_id) {
      toast({
        title: 'Error',
        description: 'No se pudo identificar la sucursal del espacio',
        variant: 'destructive',
      });
      return;
    }

    try {
      // 1. Crear orden de mantenimiento
      await SpacesService.createMaintenanceOrder({
        space_id: spaceId,
        branch_id: space.branch_id,
        description: maintenanceNotes,
        priority: maintenancePriority,
      });

      // 2. Actualizar estado del espacio
      await SpacesService.updateSpace(spaceId, {
        status: 'maintenance',
        maintenance_notes: maintenanceNotes,
      });
      
      toast({
        title: 'Éxito',
        description: 'Orden de mantenimiento creada correctamente',
      });
      
      setShowMaintenanceDialog(false);
      setMaintenanceNotes('');
      setMaintenancePriority('med');
      loadData();
    } catch (error) {
      console.error('Error creando orden de mantenimiento:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la orden de mantenimiento',
        variant: 'destructive',
      });
    }
  };

  const handleAssignCleaning = () => {
    setShowCleaningDialog(true);
  };

  const handleCreateCleaningTask = async () => {
    try {
      await SpacesService.createHousekeepingTask({
        space_id: spaceId,
        task_date: cleaningDate,
        notes: cleaningNotes,
      });

      toast({
        title: 'Éxito',
        description: 'Tarea de limpieza creada correctamente',
      });

      setShowCleaningDialog(false);
      setCleaningNotes('');
      setCleaningDate(new Date().toISOString().split('T')[0]);
      loadData();
    } catch (error) {
      console.error('Error creando tarea:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la tarea de limpieza',
        variant: 'destructive',
      });
    }
  };

  const handleViewRevenue = () => {
    // TODO: Navegar a página de ingresos o mostrar modal
    toast({
      title: 'Próximamente',
      description: 'La función de ingresos estará disponible pronto',
    });
  };

  const handleAddConsumption = async (consumptions: Array<{
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    notes: string;
  }>) => {
    try {
      // Obtener usuario autenticado
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Usuario no autenticado');
      }

      await SpaceConsumptionService.addConsumptions(
        spaceId,
        consumptions,
        user.id
      );

      toast({
        title: 'Consumos agregados',
        description: `${consumptions.length} producto(s) agregado(s) al folio`,
      });

      setShowAddConsumptionDialog(false);
    } catch (error: any) {
      console.error('Error agregando consumos:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron agregar los consumos',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdateHousekeepingStatus = async (taskId: string, status: string) => {
    try {
      await SpacesService.updateHousekeepingTaskStatus(taskId, status);
      
      const statusLabels: Record<string, string> = {
        pending: 'Pendiente',
        in_progress: 'En Proceso',
        done: 'Completada',
        cancelled: 'Cancelada',
      };

      toast({
        title: 'Éxito',
        description: `Tarea marcada como "${statusLabels[status] || status}"`,
      });
      
      loadData();
    } catch (error) {
      console.error('Error actualizando estado de limpieza:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado de la tarea',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateMaintenanceStatus = async (orderId: string, status: string) => {
    try {
      await SpacesService.updateMaintenanceOrderStatus(orderId, status);
      
      const statusLabels: Record<string, string> = {
        reported: 'Reportado',
        assigned: 'Asignado',
        in_progress: 'En Proceso',
        on_hold: 'En Espera',
        completed: 'Completado',
        cancelled: 'Cancelado',
      };

      toast({
        title: 'Éxito',
        description: `Orden marcada como "${statusLabels[status] || status}"`,
      });
      
      loadData();
    } catch (error) {
      console.error('Error actualizando orden de mantenimiento:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado de la orden',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cargando detalles del espacio...
          </p>
        </div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-900 dark:text-gray-100 mb-2">
            Espacio no encontrado
          </p>
          <Button onClick={() => router.push('/app/pms/espacios')}>
            Volver a Espacios
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <SpaceDetailHeader
        space={space}
        onEdit={handleEdit}
        onMarkMaintenance={handleMarkMaintenance}
        onAssignCleaning={handleAssignCleaning}
        onViewRevenue={handleViewRevenue}
        onNewReservation={() => setShowQuickReservationDrawer(true)}
        onAddConsumption={() => setShowAddConsumptionDialog(true)}
      />

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Principal */}
          <div className="lg:col-span-2 space-y-6">
            <SpaceBasicInfo space={space} />
            <SpaceReservations reservations={reservations} />
          </div>

          {/* Columna Lateral */}
          <div className="space-y-6">
            <SpaceHousekeeping 
              tasks={housekeepingTasks} 
              onUpdateStatus={handleUpdateHousekeepingStatus}
            />
            <SpaceMaintenance 
              orders={maintenanceOrders}
              onUpdateStatus={handleUpdateMaintenanceStatus}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <SpaceDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        space={space}
        spaceTypes={spaceTypes}
        onSave={handleSave}
      />

      {/* Dialog de Limpieza */}
      <Dialog open={showCleaningDialog} onOpenChange={setShowCleaningDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Tarea de Limpieza</DialogTitle>
            <DialogDescription>
              Crea una nueva tarea de limpieza para {space.label}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cleaning_date">Fecha</Label>
              <Input
                id="cleaning_date"
                type="date"
                value={cleaningDate}
                onChange={(e) => setCleaningDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cleaning_notes">Notas (opcional)</Label>
              <Textarea
                id="cleaning_notes"
                value={cleaningNotes}
                onChange={(e) => setCleaningNotes(e.target.value)}
                placeholder="Instrucciones especiales o notas..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCleaningDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateCleaningTask}>
              Crear Tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Mantenimiento */}
      <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar en Mantenimiento</DialogTitle>
            <DialogDescription>
              Especifica el motivo por el cual {space.label} entrará en mantenimiento
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="maintenance_priority">
                Prioridad <span className="text-red-500">*</span>
              </Label>
              <Select
                value={maintenancePriority}
                onValueChange={(value: 'low' | 'med' | 'high') => setMaintenancePriority(value)}
              >
                <SelectTrigger id="maintenance_priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Baja
                    </span>
                  </SelectItem>
                  <SelectItem value="med">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                      Media
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Alta
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maintenance_notes">
                Descripción del Problema <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="maintenance_notes"
                value={maintenanceNotes}
                onChange={(e) => setMaintenanceNotes(e.target.value)}
                placeholder="Ej: Reparación de aire acondicionado, cambio de cerraduras, pintura..."
                rows={4}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMaintenanceDialog(false);
                setMaintenanceNotes('');
                setMaintenancePriority('med');
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveMaintenance}>
              Marcar en Mantenimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer de Reserva Rápida */}
      {space && (
        <QuickReservationDrawer
          open={showQuickReservationDrawer}
          onOpenChange={setShowQuickReservationDrawer}
          space={space}
        />
      )}

      {/* Diálogo de Agregar Consumos */}
      {space && (
        <AddConsumptionDialog
          open={showAddConsumptionDialog}
          onOpenChange={setShowAddConsumptionDialog}
          onAddConsumptions={handleAddConsumption}
          spaceName={space.label}
        />
      )}
    </div>
  );
}
