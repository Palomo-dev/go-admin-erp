'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  DollarSign,
  Search,
  Plus,
  Upload,
  Loader2,
  Tag,
  CheckCircle,
  XCircle,
  RefreshCw,
  GripVertical,
} from 'lucide-react';
import {
  faresService,
  type FareWithDetails,
  type FareFilters,
  type CreateFareData,
} from '@/lib/services/faresService';
import { FareDialog, ImportFaresDialog, SortableFareCard } from '@/components/transporte/tarifas-pasajeros';

const FARE_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'regular', label: 'Regular' },
  { value: 'student', label: 'Estudiante' },
  { value: 'senior', label: 'Adulto Mayor' },
  { value: 'child', label: 'Niño' },
  { value: 'promo', label: 'Promoción' },
  { value: 'special', label: 'Especial' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export default function TarifasPasajerosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [fares, setFares] = useState<FareWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedRouteId, setSelectedRouteId] = useState('all');

  // Datos auxiliares
  const [routes, setRoutes] = useState<Array<{ id: string; name: string; code: string; origin_stop_id?: string; destination_stop_id?: string }>>([]);
  const [stops, setStops] = useState<Array<{ id: string; name: string; code?: string; city?: string }>>([]);

  // Diálogos
  const [showFareDialog, setShowFareDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedFare, setSelectedFare] = useState<FareWithDetails | null>(null);
  const [fareToDelete, setFareToDelete] = useState<FareWithDetails | null>(null);

  // Estadísticas
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    byType: Record<string, number>;
  } | null>(null);

  const loadFares = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const filters: FareFilters = {};
      if (searchTerm) filters.search = searchTerm;
      if (selectedType !== 'all') filters.fare_type = selectedType;
      if (selectedStatus !== 'all') filters.is_active = selectedStatus === 'active';
      if (selectedRouteId !== 'all') filters.route_id = selectedRouteId;

      const data = await faresService.getFares(organizationId, filters);
      setFares(data);
    } catch (error) {
      console.error('Error loading fares:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tarifas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, searchTerm, selectedType, selectedStatus, selectedRouteId, toast]);

  const loadAuxiliaryData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [routesData, stopsData, statsData] = await Promise.all([
        faresService.getRoutes(organizationId),
        faresService.getStops(organizationId),
        faresService.getStats(organizationId),
      ]);

      setRoutes(routesData);
      setStops(stopsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading auxiliary data:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadFares();
  }, [loadFares]);

  useEffect(() => {
    loadAuxiliaryData();
  }, [loadAuxiliaryData]);

  // Sensores para drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ordenar tarifas por display_order
  const sortedFares = useMemo(() => {
    return [...fares].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }, [fares]);

  // IDs para SortableContext
  const sortableIds = useMemo(() => sortedFares.map(f => f.id), [sortedFares]);

  // Manejar fin de arrastre
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = sortedFares.findIndex(f => f.id === active.id);
    const newIndex = sortedFares.findIndex(f => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFares = arrayMove(sortedFares, oldIndex, newIndex);

    // Actualización optimista
    setFares(reorderedFares.map((fare, index) => ({
      ...fare,
      display_order: index,
    })));

    // Guardar en BD
    try {
      const updates = reorderedFares.map((fare, index) => ({
        id: fare.id,
        display_order: index,
      }));

      await faresService.updateBulkDisplayOrder(updates);

      toast({
        title: 'Orden actualizado',
        description: 'El orden de las tarifas ha sido guardado',
      });
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el orden',
        variant: 'destructive',
      });
      loadFares(); // Revertir
    }
  };

  const handleCreateFare = async (data: Partial<CreateFareData>) => {
    if (!organizationId) return;

    setIsSubmitting(true);
    try {
      await faresService.createFare({
        ...data,
        organization_id: organizationId,
        fare_name: data.fare_name || '',
        fare_type: data.fare_type || 'regular',
        amount: data.amount || 0,
      });

      toast({
        title: 'Tarifa creada',
        description: 'La tarifa se ha creado correctamente',
      });

      setShowFareDialog(false);
      loadFares();
      loadAuxiliaryData();
    } catch (error) {
      console.error('Error creating fare:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateFare = async (data: Partial<CreateFareData>) => {
    if (!selectedFare) return;

    setIsSubmitting(true);
    try {
      await faresService.updateFare(selectedFare.id, data);

      toast({
        title: 'Tarifa actualizada',
        description: 'Los cambios se han guardado correctamente',
      });

      setShowFareDialog(false);
      setSelectedFare(null);
      loadFares();
    } catch (error) {
      console.error('Error updating fare:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (fare: FareWithDetails) => {
    setIsSubmitting(true);
    try {
      await faresService.duplicateFare(fare.id);

      toast({
        title: 'Tarifa duplicada',
        description: 'Se ha creado una copia de la tarifa',
      });

      loadFares();
      loadAuxiliaryData();
    } catch (error) {
      console.error('Error duplicating fare:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!fareToDelete) return;

    setIsSubmitting(true);
    try {
      await faresService.deleteFare(fareToDelete.id);

      toast({
        title: 'Tarifa eliminada',
        description: 'La tarifa ha sido eliminada correctamente',
      });

      setFareToDelete(null);
      loadFares();
      loadAuxiliaryData();
    } catch (error) {
      console.error('Error deleting fare:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (fare: FareWithDetails, isActive: boolean) => {
    try {
      await faresService.toggleActive(fare.id, isActive);

      toast({
        title: isActive ? 'Tarifa activada' : 'Tarifa desactivada',
        description: `La tarifa "${fare.fare_name}" ha sido ${isActive ? 'activada' : 'desactivada'}`,
      });

      loadFares();
      loadAuxiliaryData();
    } catch (error) {
      console.error('Error toggling fare status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la tarifa',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async (data: Array<Record<string, string>>) => {
    if (!organizationId) return { success: 0, errors: ['Organización no encontrada'] };

    const faresData = data.map((row) => ({
      fare_name: row.fare_name || row.nombre || '',
      fare_code: row.fare_code || row.codigo || undefined,
      fare_type: row.fare_type || row.tipo || 'regular',
      amount: parseFloat(row.amount || row.precio || row.monto || '0'),
      currency: row.currency || row.moneda || 'COP',
      discount_percent: parseFloat(row.discount_percent || row.descuento_porcentaje || '0'),
      valid_from: row.valid_from || row.valido_desde || undefined,
      valid_until: row.valid_until || row.valido_hasta || undefined,
    }));

    const result = await faresService.importFares(organizationId, faresData);
    
    if (result.success > 0) {
      loadFares();
      loadAuxiliaryData();
    }

    return result;
  };

  const handleEdit = (fare: FareWithDetails) => {
    setSelectedFare(fare);
    setShowFareDialog(true);
  };

  const handleNewFare = () => {
    setSelectedFare(null);
    setShowFareDialog(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-blue-600" />
            Tarifas de Pasajeros
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona las tarifas por ruta, tramo y tipo de pasajero
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleNewFare}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Tag className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                <p className="text-xs text-gray-500">Total tarifas</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                <p className="text-xs text-gray-500">Activas</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <XCircle className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-500">{stats.inactive}</p>
                <p className="text-xs text-gray-500">Inactivas</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats.byType).slice(0, 4).map(([type, count]) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {type}: {count}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              {FARE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Ruta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {routes.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadFares}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* Lista de tarifas */}
      {isLoading ? (
        <Card className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando tarifas...</span>
          </div>
        </Card>
      ) : fares.length === 0 ? (
        <Card className="p-8 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No hay tarifas registradas
          </h3>
          <p className="text-gray-500 mt-1">
            {searchTerm || selectedType !== 'all' || selectedStatus !== 'all'
              ? 'No se encontraron tarifas con los filtros aplicados'
              : 'Comienza creando una nueva tarifa'}
          </p>
          <Button onClick={handleNewFare} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-3">
            <GripVertical className="h-3 w-3" />
            Arrastra para reordenar las tarifas (el orden determina la prioridad)
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="grid gap-4">
                {sortedFares.map((fare) => (
                  <SortableFareCard
                    key={fare.id}
                    fare={fare}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={setFareToDelete}
                    onToggleActive={handleToggleActive}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Diálogos */}
      <FareDialog
        open={showFareDialog}
        onOpenChange={(open) => {
          setShowFareDialog(open);
          if (!open) setSelectedFare(null);
        }}
        fare={selectedFare}
        routes={routes}
        stops={stops}
        onSave={selectedFare ? handleUpdateFare : handleCreateFare}
        isLoading={isSubmitting}
      />

      <ImportFaresDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
        isLoading={isSubmitting}
      />

      <AlertDialog open={!!fareToDelete} onOpenChange={() => setFareToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La tarifa &quot;{fareToDelete?.fare_name}&quot; será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
