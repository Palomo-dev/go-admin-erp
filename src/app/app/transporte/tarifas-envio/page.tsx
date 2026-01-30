'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Truck,
  Search,
  Plus,
  Upload,
  Calculator,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import {
  shippingRatesService,
  type ShippingRateWithCarrier,
  type ShippingRateFilters,
  type CreateShippingRateData,
  type TransportCarrier,
  type SimulateShippingParams,
  type SimulatedRate,
} from '@/lib/services/shippingRatesService';
import {
  ShippingRateCard,
  ShippingRateDialog,
  ImportRatesDialog,
  SimulatorDialog,
} from '@/components/transporte/tarifas-envio';

const SERVICE_LEVEL_OPTIONS = [
  { value: 'all', label: 'Todos los niveles' },
  { value: 'express', label: 'Express' },
  { value: 'standard', label: 'Estándar' },
  { value: 'economy', label: 'Económico' },
  { value: 'overnight', label: 'Día siguiente' },
  { value: 'same_day', label: 'Mismo día' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export default function TarifasEnvioPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Estados principales
  const [rates, setRates] = useState<ShippingRateWithCarrier[]>([]);
  const [carriers, setCarriers] = useState<TransportCarrier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServiceLevel, setSelectedServiceLevel] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCarrierId, setSelectedCarrierId] = useState('all');

  // Diálogos
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSimulatorDialog, setShowSimulatorDialog] = useState(false);
  const [selectedRate, setSelectedRate] = useState<ShippingRateWithCarrier | null>(null);
  const [rateToDelete, setRateToDelete] = useState<ShippingRateWithCarrier | null>(null);

  // Estadísticas
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    byServiceLevel: {} as Record<string, number>,
  });

  // Cargar tarifas
  const loadRates = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const filters: ShippingRateFilters = {};
      
      if (searchTerm) filters.search = searchTerm;
      if (selectedServiceLevel !== 'all') filters.service_level = selectedServiceLevel;
      if (selectedStatus !== 'all') filters.is_active = selectedStatus === 'active';
      if (selectedCarrierId !== 'all') filters.carrier_id = selectedCarrierId;

      const data = await shippingRatesService.getShippingRates(organizationId, filters);
      setRates(data);

      // Calcular estadísticas
      const allRates = await shippingRatesService.getShippingRates(organizationId);
      const activeCount = allRates.filter(r => r.is_active).length;
      const byLevel: Record<string, number> = {};
      
      allRates.forEach(rate => {
        const level = rate.service_level || 'sin_nivel';
        byLevel[level] = (byLevel[level] || 0) + 1;
      });

      setStats({
        total: allRates.length,
        active: activeCount,
        inactive: allRates.length - activeCount,
        byServiceLevel: byLevel,
      });
    } catch (error) {
      console.error('Error loading rates:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tarifas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, searchTerm, selectedServiceLevel, selectedStatus, selectedCarrierId, toast]);

  // Cargar transportadores
  const loadCarriers = useCallback(async () => {
    if (!organizationId) return;

    try {
      const data = await shippingRatesService.getCarriers(organizationId);
      setCarriers(data);
    } catch (error) {
      console.error('Error loading carriers:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  useEffect(() => {
    loadCarriers();
  }, [loadCarriers]);

  // Handlers CRUD
  const handleCreateRate = async (data: Partial<CreateShippingRateData>) => {
    if (!organizationId) return;

    setIsSubmitting(true);
    try {
      await shippingRatesService.createShippingRate({
        ...data,
        organization_id: organizationId,
        rate_name: data.rate_name || '',
      });

      toast({
        title: 'Tarifa creada',
        description: 'La tarifa se ha creado correctamente',
      });

      setShowRateDialog(false);
      loadRates();
    } catch (error) {
      console.error('Error creating rate:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRate = async (data: Partial<CreateShippingRateData>) => {
    if (!selectedRate) return;

    setIsSubmitting(true);
    try {
      await shippingRatesService.updateShippingRate(selectedRate.id, data);

      toast({
        title: 'Tarifa actualizada',
        description: 'Los cambios se han guardado correctamente',
      });

      setShowRateDialog(false);
      setSelectedRate(null);
      loadRates();
    } catch (error) {
      console.error('Error updating rate:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!rateToDelete) return;

    setIsSubmitting(true);
    try {
      await shippingRatesService.deleteShippingRate(rateToDelete.id);

      toast({
        title: 'Tarifa eliminada',
        description: 'La tarifa se ha eliminado correctamente',
      });

      setRateToDelete(null);
      loadRates();
    } catch (error) {
      console.error('Error deleting rate:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarifa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (rate: ShippingRateWithCarrier) => {
    try {
      await shippingRatesService.duplicateShippingRate(rate.id);

      toast({
        title: 'Tarifa duplicada',
        description: 'Se ha creado una copia de la tarifa',
      });

      loadRates();
    } catch (error) {
      console.error('Error duplicating rate:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la tarifa',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (rate: ShippingRateWithCarrier, isActive: boolean) => {
    try {
      await shippingRatesService.toggleActive(rate.id, isActive);

      // Actualización optimista
      setRates(prev =>
        prev.map(r => (r.id === rate.id ? { ...r, is_active: isActive } : r))
      );

      toast({
        title: isActive ? 'Tarifa activada' : 'Tarifa desactivada',
        description: `La tarifa "${rate.rate_name}" ha sido ${isActive ? 'activada' : 'desactivada'}`,
      });
    } catch (error) {
      console.error('Error toggling rate:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la tarifa',
        variant: 'destructive',
      });
      loadRates();
    }
  };

  const handleImport = async (ratesData: Partial<CreateShippingRateData>[]) => {
    if (!organizationId) return { success: 0, errors: ['Sin organización'] };

    setIsSubmitting(true);
    try {
      const result = await shippingRatesService.importRates(organizationId, ratesData);

      if (result.success > 0) {
        toast({
          title: 'Importación completada',
          description: `Se importaron ${result.success} tarifas`,
        });
        loadRates();
      }

      return result;
    } catch (error) {
      console.error('Error importing rates:', error);
      return { success: 0, errors: ['Error al importar'] };
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulate = async (params: SimulateShippingParams): Promise<SimulatedRate[]> => {
    if (!organizationId) return [];

    try {
      return await shippingRatesService.simulateShipping(organizationId, params);
    } catch (error) {
      console.error('Error simulating:', error);
      toast({
        title: 'Error',
        description: 'No se pudo realizar la simulación',
        variant: 'destructive',
      });
      return [];
    }
  };

  const handleEdit = (rate: ShippingRateWithCarrier) => {
    setSelectedRate(rate);
    setShowRateDialog(true);
  };

  const handleNewRate = () => {
    setSelectedRate(null);
    setShowRateDialog(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Truck className="h-7 w-7 text-blue-600" />
            Tarifas de Envío
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestiona las tarifas de shipping por carrier, servicio y zona
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowSimulatorDialog(true)}>
            <Calculator className="h-4 w-4 mr-2" />
            Simulador
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleNewRate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
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
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Truck className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{carriers.length}</p>
                <p className="text-xs text-gray-500">Transportadores</p>
              </div>
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

          <Select value={selectedServiceLevel} onValueChange={setSelectedServiceLevel}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Nivel servicio" />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_LEVEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-full sm:w-[140px]">
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

          <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Transportador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los transportadores</SelectItem>
              {carriers.map((carrier) => (
                <SelectItem key={carrier.id} value={carrier.id}>
                  {carrier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadRates}>
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
      ) : rates.length === 0 ? (
        <Card className="p-8 text-center">
          <Truck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No hay tarifas registradas
          </h3>
          <p className="text-gray-500 mt-1">
            {searchTerm || selectedServiceLevel !== 'all' || selectedStatus !== 'all'
              ? 'No se encontraron tarifas con los filtros aplicados'
              : 'Comienza creando una nueva tarifa de envío'}
          </p>
          <Button onClick={handleNewRate} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rates.map((rate) => (
            <ShippingRateCard
              key={rate.id}
              rate={rate}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={setRateToDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* Diálogos */}
      <ShippingRateDialog
        open={showRateDialog}
        onOpenChange={(open) => {
          setShowRateDialog(open);
          if (!open) setSelectedRate(null);
        }}
        rate={selectedRate}
        carriers={carriers}
        onSave={selectedRate ? handleUpdateRate : handleCreateRate}
        isLoading={isSubmitting}
      />

      <ImportRatesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
        isLoading={isSubmitting}
      />

      <SimulatorDialog
        open={showSimulatorDialog}
        onOpenChange={setShowSimulatorDialog}
        carriers={carriers}
        onSimulate={handleSimulate}
      />

      <AlertDialog open={!!rateToDelete} onOpenChange={() => setRateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La tarifa &quot;{rateToDelete?.rate_name}&quot; será eliminada permanentemente.
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
