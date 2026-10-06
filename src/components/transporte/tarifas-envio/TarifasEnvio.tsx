'use client';

/**
 * Tarifas de envío — componente ÚNICO y autocontenido (decisión del dueño,
 * 2026-10-06): lo montan Transporte › Tarifas de envío y Sitio web › Ventas en
 * línea › Envíos. Mismo estado, mismos filtros, misma lista de tarjetas y los
 * mismos diálogos (crear/editar, importar, simulador, eliminar) sobre el mismo
 * servicio (`shippingRatesService`): si se cambia aquí, cambia en las dos
 * pantallas, y el sitio público calcula el costo con estas mismas tarifas.
 *
 * Antes este cuerpo vivía dentro de la página de Transporte (571 líneas).
 * Al extraerlo pasó a tokens y al kit (StatCard, SearchInput, ConfirmDialog,
 * EmptyState); el comportamiento no cambió.
 *
 * Props:
 * - `conCabecera`: pinta el PageHeader de Transporte («Tarifas de envío»).
 *   Sitio web pinta su propia cabecera y lo monta sin ella.
 * - `soloLectura`: oculta crear, importar, editar, activar y eliminar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Calculator, CheckCircle2, DollarSign, Plus, RefreshCw, Truck, Upload, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog, EmptyState, KpiStrip, PageHeader, SearchInput, StatCard, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import {
  shippingRatesService,
  type CreateShippingRateData,
  type ShippingRateFilters,
  type ShippingRateWithCarrier,
  type SimulateShippingParams,
  type SimulatedRate,
  type TransportCarrier,
} from '@/lib/services/shippingRatesService';
import { ShippingRateCard } from './ShippingRateCard';
import { ShippingRateDialog } from './ShippingRateDialog';
import { ImportRatesDialog } from './ImportRatesDialog';
import { SimulatorDialog } from './SimulatorDialog';
import { cn } from '@/utils/Utils';

const SERVICE_LEVEL_OPTIONS = [
  { value: 'all', label: 'Todos los niveles' },
  { value: 'express', label: 'Express' },
  { value: 'standard', label: 'Estándar' },
  { value: 'economy', label: 'Económico' },
  { value: 'overnight', label: 'Día siguiente' },
  { value: 'same_day', label: 'Mismo día' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export interface TarifasEnvioProps {
  /** Pinta la cabecera de la página de Transporte. */
  conCabecera?: boolean;
  /** Sin acciones de escritura. */
  soloLectura?: boolean;
  className?: string;
}

export function TarifasEnvio({ conCabecera = false, soloLectura = false, className }: TarifasEnvioProps) {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [rates, setRates] = useState<ShippingRateWithCarrier[]>([]);
  const [carriers, setCarriers] = useState<TransportCarrier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServiceLevel, setSelectedServiceLevel] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCarrierId, setSelectedCarrierId] = useState('all');

  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSimulatorDialog, setShowSimulatorDialog] = useState(false);
  const [selectedRate, setSelectedRate] = useState<ShippingRateWithCarrier | null>(null);
  const [rateToDelete, setRateToDelete] = useState<ShippingRateWithCarrier | null>(null);

  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  const hayFiltros = searchTerm !== '' || selectedServiceLevel !== 'all' || selectedStatus !== 'all' || selectedCarrierId !== 'all';

  const loadRates = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const filters: ShippingRateFilters = {};
      if (searchTerm) filters.search = searchTerm;
      if (selectedServiceLevel !== 'all') filters.service_level = selectedServiceLevel;
      if (selectedStatus !== 'all') filters.is_active = selectedStatus === 'active';
      if (selectedCarrierId !== 'all') filters.carrier_id = selectedCarrierId;

      const [data, allRates] = await Promise.all([
        shippingRatesService.getShippingRates(organizationId, filters),
        shippingRatesService.getShippingRates(organizationId),
      ]);
      setRates(data);
      const activeCount = allRates.filter((r) => r.is_active).length;
      setStats({ total: allRates.length, active: activeCount, inactive: allRates.length - activeCount });
    } catch (error) {
      console.error('Error loading rates:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, searchTerm, selectedServiceLevel, selectedStatus, selectedCarrierId]);

  const loadCarriers = useCallback(async () => {
    if (!organizationId) return;
    try {
      setCarriers(await shippingRatesService.getCarriers(organizationId));
    } catch (error) {
      console.error('Error loading carriers:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadRates();
  }, [loadRates]);

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers]);

  const avisarError = (descripcion: string) => toast({ title: 'No se pudo completar', description: descripcion, variant: 'destructive' });

  const handleCreateRate = async (data: Partial<CreateShippingRateData>) => {
    if (!organizationId) return;
    setIsSubmitting(true);
    try {
      await shippingRatesService.createShippingRate({ ...data, organization_id: organizationId, rate_name: data.rate_name || '' });
      toast({ title: 'Tarifa creada', description: 'La tarifa se creó correctamente.' });
      setShowRateDialog(false);
      void loadRates();
    } catch (error) {
      console.error('Error creating rate:', error);
      avisarError('No pudimos crear la tarifa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRate = async (data: Partial<CreateShippingRateData>) => {
    if (!selectedRate) return;
    setIsSubmitting(true);
    try {
      await shippingRatesService.updateShippingRate(selectedRate.id, data);
      toast({ title: 'Tarifa actualizada', description: 'Guardamos los cambios.' });
      setShowRateDialog(false);
      setSelectedRate(null);
      void loadRates();
    } catch (error) {
      console.error('Error updating rate:', error);
      avisarError('No pudimos actualizar la tarifa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!rateToDelete) return;
    setIsSubmitting(true);
    try {
      await shippingRatesService.deleteShippingRate(rateToDelete.id);
      toast({ title: 'Tarifa eliminada', description: `Eliminaste «${rateToDelete.rate_name}».` });
      setRateToDelete(null);
      void loadRates();
    } catch (error) {
      console.error('Error deleting rate:', error);
      avisarError('No pudimos eliminar la tarifa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (rate: ShippingRateWithCarrier) => {
    try {
      await shippingRatesService.duplicateShippingRate(rate.id);
      toast({ title: 'Tarifa duplicada', description: 'Creamos una copia de la tarifa.' });
      void loadRates();
    } catch (error) {
      console.error('Error duplicating rate:', error);
      avisarError('No pudimos duplicar la tarifa.');
    }
  };

  const handleToggleActive = async (rate: ShippingRateWithCarrier, isActive: boolean) => {
    try {
      await shippingRatesService.toggleActive(rate.id, isActive);
      setRates((prev) => prev.map((r) => (r.id === rate.id ? { ...r, is_active: isActive } : r)));
      setStats((s) => ({ ...s, active: s.active + (isActive ? 1 : -1), inactive: s.inactive + (isActive ? -1 : 1) }));
      toast({ title: isActive ? 'Tarifa activada' : 'Tarifa desactivada', description: `«${rate.rate_name}»` });
    } catch (error) {
      console.error('Error toggling rate:', error);
      avisarError('No pudimos cambiar el estado de la tarifa.');
      void loadRates();
    }
  };

  const handleImport = async (ratesData: Partial<CreateShippingRateData>[]) => {
    if (!organizationId) return { success: 0, errors: ['Sin organización'] };
    setIsSubmitting(true);
    try {
      const result = await shippingRatesService.importRates(organizationId, ratesData);
      if (result.success > 0) {
        toast({ title: 'Importación completada', description: `Importamos ${result.success} tarifas.` });
        void loadRates();
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
      avisarError('No pudimos hacer la simulación.');
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

  const limpiarFiltros = () => {
    setSearchTerm('');
    setSelectedServiceLevel('all');
    setSelectedStatus('all');
    setSelectedCarrierId('all');
  };

  const acciones = (
    <>
      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setShowSimulatorDialog(true)}>
        <Calculator aria-hidden="true" className="size-4" strokeWidth={1.5} />
        Simulador
      </button>
      {!soloLectura && (
        <>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setShowImportDialog(true)}>
            <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
            Importar
          </button>
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={handleNewRate}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            Nueva tarifa
          </button>
        </>
      )}
    </>
  );

  return (
    <div className={cn('flex flex-col gap-4 lg:gap-6', conCabecera && 'min-h-full bg-canvas p-4 lg:p-6', className)}>
      {conCabecera ? (
        <PageHeader
          titulo="Tarifas de envío"
          subtitulo="Tarifas por transportador, servicio y zona. Las mismas que usa tu sitio web."
          icono={Truck}
          migas={[{ etiqueta: 'Transporte', href: '/app/transporte' }, { etiqueta: 'Tarifas de envío' }]}
          acciones={acciones}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{acciones}</div>
      )}

      <KpiStrip columnas={4} etiqueta="Resumen de tarifas">
        <StatCard etiqueta="Total de tarifas" valor={stats.total} icono={DollarSign} cargando={isLoading && stats.total === 0} />
        <StatCard etiqueta="Activas" valor={stats.active} icono={CheckCircle2} tono="exito" cargando={isLoading && stats.total === 0} />
        <StatCard etiqueta="Inactivas" valor={stats.inactive} icono={XCircle} cargando={isLoading && stats.total === 0} />
        <StatCard etiqueta="Transportadores" valor={carriers.length} icono={Truck} cargando={isLoading && stats.total === 0} />
      </KpiStrip>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por nombre o código"
          etiqueta="Buscar tarifas"
          atajo={false}
          className="min-w-0 flex-1"
        />
        <Select value={selectedServiceLevel} onValueChange={setSelectedServiceLevel}>
          <SelectTrigger className="h-10 w-full rounded-lg sm:w-[180px]" aria-label="Nivel de servicio">
            <SelectValue placeholder="Nivel de servicio" />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_LEVEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="h-10 w-full rounded-lg sm:w-[140px]" aria-label="Estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
          <SelectTrigger className="h-10 w-full rounded-lg sm:w-[200px]" aria-label="Transportador">
            <SelectValue placeholder="Transportador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los transportadores</SelectItem>
            {carriers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => void loadRates()}
          aria-label="Recargar tarifas"
          className={clasesBoton({ variante: 'secundario', tamano: 'md' }) + ' w-10 px-0'}
        >
          <RefreshCw aria-hidden="true" className={cn('size-4', isLoading && 'animate-spin')} strokeWidth={1.5} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : loadError ? (
        <EmptyState variante="error" titulo="No pudimos cargar las tarifas" descripcion="Revisa tu conexión e inténtalo de nuevo." onReintentar={() => void loadRates()} />
      ) : rates.length === 0 ? (
        hayFiltros ? (
          <EmptyState variante="search" titulo="Ninguna tarifa coincide con los filtros" onLimpiarFiltros={limpiarFiltros} />
        ) : (
          <EmptyState
            variante="empty"
            icono={Truck}
            titulo="Aún no tienes tarifas de envío"
            descripcion="Crea la primera: tu sitio la usa para cobrar el envío según la zona."
            accion={soloLectura ? undefined : { etiqueta: 'Nueva tarifa', onClick: handleNewRate }}
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rates.map((rate) => (
            <ShippingRateCard
              key={rate.id}
              rate={rate}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={setRateToDelete}
              onToggleActive={handleToggleActive}
              soloLectura={soloLectura}
            />
          ))}
        </div>
      )}

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
      <ImportRatesDialog open={showImportDialog} onOpenChange={setShowImportDialog} onImport={handleImport} isLoading={isSubmitting} />
      <SimulatorDialog open={showSimulatorDialog} onOpenChange={setShowSimulatorDialog} carriers={carriers} onSimulate={handleSimulate} />
      <ConfirmDialog
        abierto={!!rateToDelete}
        onAbiertoChange={(abierto) => {
          if (!abierto) setRateToDelete(null);
        }}
        titulo="¿Eliminar la tarifa?"
        descripcion={`No se puede deshacer. «${rateToDelete?.rate_name ?? ''}» deja de cobrarse en el POS y en tu sitio.`}
        textoConfirmar="Eliminar tarifa"
        tono="peligro"
        cargando={isSubmitting}
        onConfirmar={handleDelete}
      />
    </div>
  );
}

export default TarifasEnvio;
