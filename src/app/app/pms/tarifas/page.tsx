'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RatesHeader,
  RatesList,
  RatesStats,
  RatesFilters,
  RateDialog,
  ImportRatesDialog,
  RatesPagination,
  ParkingRatesTab,
  type RateFormData,
  type ImportRow,
} from '@/components/pms/tarifas';
import RatesService, { type Rate } from '@/lib/services/ratesService';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2, Building2, Car } from 'lucide-react';

interface SpaceType {
  id: string;
  name: string;
}

export default function TarifasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [rates, setRates] = useState<Rate[]>([]);
  const [spaceTypes, setSpaceTypes] = useState<SpaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialogs
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedRate, setSelectedRate] = useState<Rate | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [spaceTypeFilter, setSpaceTypeFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const [ratesData, spaceTypesData] = await Promise.all([
        RatesService.getRates(organization!.id),
        supabase
          .from('space_types')
          .select('id, name')
          .eq('organization_id', organization!.id)
          .order('name'),
      ]);

      setRates(ratesData);
      setSpaceTypes(spaceTypesData.data || []);
    } catch (error) {
      console.error('Error cargando tarifas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tarifas.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRates = useMemo(() => {
    const today = new Date();

    return rates.filter((rate) => {
      const matchesSearch =
        searchTerm === '' ||
        rate.space_types?.name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSpaceType =
        spaceTypeFilter === 'all' || rate.space_type_id === spaceTypeFilter;

      const matchesPlan =
        planFilter === 'all' || rate.restrictions?.plan === planFilter;

      const from = new Date(rate.date_from);
      const to = new Date(rate.date_to);
      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = today >= from && today <= to;
      } else if (statusFilter === 'upcoming') {
        matchesStatus = today < from;
      } else if (statusFilter === 'expired') {
        matchesStatus = today > to;
      }

      return matchesSearch && matchesSpaceType && matchesPlan && matchesStatus;
    });
  }, [rates, searchTerm, spaceTypeFilter, planFilter, statusFilter]);

  // Calcular paginación
  const totalPages = Math.ceil(filteredRates.length / pageSize);
  const paginatedRates = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRates.slice(startIndex, startIndex + pageSize);
  }, [filteredRates, currentPage, pageSize]);

  // Resetear página cuando cambian filtros o pageSize
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, spaceTypeFilter, planFilter, statusFilter, pageSize]);

  const hasActiveFilters =
    searchTerm !== '' ||
    spaceTypeFilter !== 'all' ||
    planFilter !== 'all' ||
    statusFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setSpaceTypeFilter('all');
    setPlanFilter('all');
    setStatusFilter('all');
  };

  const handleNewRate = () => {
    setSelectedRate(null);
    setShowRateDialog(true);
  };

  const handleImport = () => {
    setShowImportDialog(true);
  };

  const handleEdit = (rate: Rate) => {
    setSelectedRate(rate);
    setShowRateDialog(true);
  };

  const handleDelete = async (rateId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta tarifa?')) return;

    try {
      await RatesService.deleteRate(rateId, organization!.id);
      toast({
        title: 'Tarifa eliminada',
        description: 'La tarifa se eliminó correctamente.',
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarifa.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (rateId: string) => {
    try {
      const newStatus = await RatesService.toggleRateActive(rateId, organization!.id);
      toast({
        title: newStatus ? 'Tarifa activada' : 'Tarifa desactivada',
        description: newStatus 
          ? 'La tarifa ahora se aplicará en nuevas reservas.' 
          : 'La tarifa no se aplicará en nuevas reservas.',
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la tarifa.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveRate = async (data: RateFormData) => {
    try {
      if (selectedRate) {
        await RatesService.updateRate(selectedRate.id, data, organization!.id);
        toast({
          title: 'Tarifa actualizada',
          description: 'La tarifa se actualizó correctamente.',
        });
      } else {
        await RatesService.createRate({
          organization_id: organization!.id,
          ...data,
        });
        toast({
          title: 'Tarifa creada',
          description: 'La nueva tarifa se creó correctamente.',
        });
      }
      await loadData();
    } catch (error: any) {
      const errorMessage = error?.message || 'No se pudo guardar la tarifa.';
      const isConflict = errorMessage.includes('prioridad') || errorMessage.includes('solapa');
      toast({
        title: isConflict ? 'Conflicto de Tarifas' : 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleImportRates = async (
    data: ImportRow[]
  ): Promise<{ success: number; errors: number }> => {
    try {
      const result = await RatesService.importRatesFromCSV(organization!.id, data);
      await loadData();
      toast({
        title: 'Importación completada',
        description: `${result.success} tarifas importadas correctamente.`,
      });
      return result;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Error durante la importación.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando tarifas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <RatesHeader onNewRate={handleNewRate} onImport={handleImport} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Estadísticas */}
        <RatesStats rates={rates} />

        {/* Filtros */}
        <RatesFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          spaceTypeFilter={spaceTypeFilter}
          onSpaceTypeChange={setSpaceTypeFilter}
          planFilter={planFilter}
          onPlanChange={setPlanFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          spaceTypes={spaceTypes}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Tabs debajo de filtros */}
        <Tabs defaultValue="habitaciones" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
            <TabsTrigger value="habitaciones" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Habitaciones
            </TabsTrigger>
            <TabsTrigger value="parking" className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Estacionamiento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="habitaciones" className="mt-0 space-y-6">
            {/* Lista de tarifas */}
            <RatesList
              rates={paginatedRates}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />

            {/* Paginación */}
            {filteredRates.length > 0 && (
              <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <RatesPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredRates.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="parking" className="mt-0">
            <ParkingRatesTab organizationId={organization!.id} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog para crear/editar tarifa */}
      <RateDialog
        open={showRateDialog}
        onOpenChange={setShowRateDialog}
        rate={selectedRate}
        spaceTypes={spaceTypes}
        onSave={handleSaveRate}
      />

      {/* Dialog para importar tarifas */}
      <ImportRatesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        spaceTypes={spaceTypes}
        onImport={handleImportRates}
      />
    </div>
  );
}
