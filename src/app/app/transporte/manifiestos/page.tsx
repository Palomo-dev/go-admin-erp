'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  Search,
  RefreshCw,
  Plus,
  Upload,
  Loader2,
  BarChart3,
  Truck,
  Package,
  CheckCircle,
  Clock,
} from 'lucide-react';
import {
  manifestsService,
  type ManifestWithDetails,
  type ManifestCreateInput,
} from '@/lib/services/manifestsService';
import {
  ManifestCard,
  ManifestDialog,
  ImportManifestsDialog,
} from '@/components/transporte/manifiestos';

export default function ManifiestosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Estados principales
  const [manifests, setManifests] = useState<ManifestWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Estados para diálogos
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingManifest, setEditingManifest] = useState<ManifestWithDetails | null>(null);

  // Estados para datos auxiliares
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string; vehicle_type: string }>>([]);
  const [carriers, setCarriers] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [routes, setRoutes] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const [manifestsData, vehiclesData, carriersData, routesData] = await Promise.all([
        manifestsService.getManifests(organizationId, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: searchTerm || undefined,
        }),
        manifestsService.getVehicles(organizationId),
        manifestsService.getCarriers(organizationId),
        manifestsService.getRoutes(organizationId),
      ]);

      setManifests(manifestsData);
      setVehicles(vehiclesData);
      setCarriers(carriersData);
      setRoutes(routesData);
    } catch (error) {
      console.error('Error loading manifests:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los manifiestos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, searchTerm, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleCreate = async (data: ManifestCreateInput) => {
    if (!organizationId) return;

    setIsSubmitting(true);
    try {
      const newManifest = await manifestsService.createManifest(organizationId, data);
      toast({
        title: 'Manifiesto creado',
        description: `Manifiesto ${newManifest.manifest_number} creado correctamente`,
      });
      setShowCreateDialog(false);
      setEditingManifest(null);
      loadData();
    } catch (error) {
      console.error('Error creating manifest:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el manifiesto',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: ManifestCreateInput) => {
    if (!editingManifest) return;

    setIsSubmitting(true);
    try {
      await manifestsService.updateManifest(editingManifest.id, data);
      toast({
        title: 'Manifiesto actualizado',
        description: 'Los cambios se han guardado correctamente',
      });
      setShowCreateDialog(false);
      setEditingManifest(null);
      loadData();
    } catch (error) {
      console.error('Error updating manifest:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el manifiesto',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleView = (manifest: ManifestWithDetails) => {
    router.push(`/app/transporte/manifiestos/${manifest.id}`);
  };

  const handleEditClick = (manifest: ManifestWithDetails) => {
    setEditingManifest(manifest);
    setShowCreateDialog(true);
  };

  const handleDuplicate = async (manifest: ManifestWithDetails) => {
    setIsSubmitting(true);
    try {
      const newManifest = await manifestsService.duplicateManifest(manifest.id);
      toast({
        title: 'Manifiesto duplicado',
        description: `Se ha creado el manifiesto ${newManifest.manifest_number}`,
      });
      loadData();
    } catch (error) {
      console.error('Error duplicating manifest:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el manifiesto',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (manifest: ManifestWithDetails) => {
    if (!confirm('¿Está seguro de eliminar este manifiesto?')) return;

    setIsSubmitting(true);
    try {
      await manifestsService.deleteManifest(manifest.id);
      toast({
        title: 'Manifiesto eliminado',
        description: 'El manifiesto ha sido eliminado',
      });
      loadData();
    } catch (error) {
      console.error('Error deleting manifest:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el manifiesto',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeStatus = async (manifest: ManifestWithDetails, newStatus: string) => {
    setIsSubmitting(true);
    try {
      await manifestsService.changeStatus(manifest.id, newStatus as ManifestWithDetails['status']);
      toast({
        title: 'Estado actualizado',
        description: `El manifiesto ahora está ${newStatus === 'confirmed' ? 'confirmado' : newStatus === 'in_progress' ? 'en progreso' : 'completado'}`,
      });
      loadData();
    } catch (error) {
      console.error('Error changing status:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImport = async (csvData: string) => {
    if (!organizationId) return { success: 0, errors: ['Organización no válida'] };

    setIsSubmitting(true);
    try {
      const result = await manifestsService.importFromCSV(organizationId, csvData);
      if (result.success > 0) {
        loadData();
      }
      return result;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Estadísticas
  const stats = {
    total: manifests.length,
    draft: manifests.filter((m) => m.status === 'draft').length,
    inProgress: manifests.filter((m) => m.status === 'in_progress').length,
    completed: manifests.filter((m) => m.status === 'completed').length,
    totalShipments: manifests.reduce((acc, m) => acc + (m.total_shipments || 0), 0),
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            Manifiestos de Despacho
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Agrupe envíos para ruteo y entrega en bloque
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            onClick={() => {
              setEditingManifest(null);
              setShowCreateDialog(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Manifiesto
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
              <Clock className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.draft}</p>
              <p className="text-sm text-gray-500">Borradores</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Truck className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
              <p className="text-sm text-gray-500">En Progreso</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-sm text-gray-500">Completados</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalShipments}</p>
              <p className="text-sm text-gray-500">Envíos</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por número de manifiesto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="in_progress">En Progreso</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de manifiestos */}
      {isLoading ? (
        <Card className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando manifiestos...</span>
          </div>
        </Card>
      ) : manifests.length === 0 ? (
        <Card className="p-8 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay manifiestos</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1 mb-4">
            Cree un nuevo manifiesto para agrupar envíos
          </p>
          <Button
            onClick={() => {
              setEditingManifest(null);
              setShowCreateDialog(true);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Crear Manifiesto
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {manifests.map((manifest) => (
            <ManifestCard
              key={manifest.id}
              manifest={manifest}
              onView={handleView}
              onEdit={handleEditClick}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onChangeStatus={handleChangeStatus}
            />
          ))}
        </div>
      )}

      {/* Diálogos */}
      <ManifestDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditingManifest(null);
        }}
        manifest={editingManifest}
        vehicles={vehicles}
        carriers={carriers}
        routes={routes}
        onSave={editingManifest ? handleEdit : handleCreate}
        isLoading={isSubmitting}
      />

      <ImportManifestsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
        isLoading={isSubmitting}
      />
    </div>
  );
}
