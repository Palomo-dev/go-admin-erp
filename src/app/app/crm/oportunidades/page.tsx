'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { toast } from '@/components/ui/use-toast';
import {
  OpportunitiesTable,
  OpportunitiesFilters,
  OpportunitiesStats,
  LossReasonDialog,
  opportunitiesService,
  Opportunity,
  OpportunityFilters,
  OpportunityStats,
  Pipeline,
  Stage,
  Customer,
} from '@/components/crm/oportunidades';

export default function OportunidadesPage() {
  const router = useRouter();
  const { organization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<OpportunityStats>({
    total: 0,
    open: 0,
    won: 0,
    lost: 0,
    totalAmount: 0,
    weightedAmount: 0,
    avgDealSize: 0,
    winRate: 0,
  });

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [filters, setFilters] = useState<OpportunityFilters>({});
  const [showLossDialog, setShowLossDialog] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization) return;

    setIsLoading(true);
    try {
      const [oppsData, pipelinesData, stagesData, customersData, statsData] = await Promise.all([
        opportunitiesService.getOpportunities(filters),
        opportunitiesService.getPipelines(),
        opportunitiesService.getStages(filters.pipelineId),
        opportunitiesService.getCustomers(),
        opportunitiesService.getStats(filters),
      ]);

      setOpportunities(oppsData);
      setPipelines(pipelinesData);
      setStages(stagesData);
      setCustomers(customersData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las oportunidades',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    setFilters(newFilters);
  };

  const handleView = (id: string) => {
    router.push(`/app/crm/oportunidades/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/app/crm/oportunidades/${id}/editar`);
  };

  const handleDuplicate = async (id: string) => {
    setIsProcessing(true);
    try {
      const newOpp = await opportunitiesService.duplicateOpportunity(id);
      toast({
        title: 'Éxito',
        description: 'Oportunidad duplicada correctamente',
      });
      router.push(`/app/crm/oportunidades/${newOpp.id}`);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta oportunidad?')) return;

    setIsProcessing(true);
    try {
      await opportunitiesService.deleteOpportunity(id);
      toast({
        title: 'Éxito',
        description: 'Oportunidad eliminada correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkWon = async (id: string) => {
    setIsProcessing(true);
    try {
      await opportunitiesService.markAsWon(id);
      toast({
        title: 'Éxito',
        description: 'Oportunidad marcada como ganada',
      });
      loadData();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkLostClick = (id: string) => {
    setSelectedOpportunityId(id);
    setShowLossDialog(true);
  };

  const handleMarkLost = async (reason: string) => {
    if (!selectedOpportunityId) return;

    setIsProcessing(true);
    try {
      await opportunitiesService.markAsLost(selectedOpportunityId, reason);
      setShowLossDialog(false);
      setSelectedOpportunityId(null);
      toast({
        title: 'Éxito',
        description: 'Oportunidad marcada como perdida',
      });
      loadData();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewOpportunity = () => {
    router.push('/app/crm/oportunidades/nuevo');
  };

  const handleExport = () => {
    // TODO: Implementar exportación
    toast({
      title: 'Info',
      description: 'Función de exportación próximamente',
    });
  };

  const handleImport = () => {
    // TODO: Implementar importación
    toast({
      title: 'Info',
      description: 'Función de importación próximamente',
    });
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Oportunidades</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona todas las oportunidades de venta
        </p>
      </div>

      {/* Stats */}
      <OpportunitiesStats stats={stats} isLoading={isLoading} />

      {/* Filters */}
      <OpportunitiesFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        pipelines={pipelines}
        stages={stages}
        customers={customers}
        onNewOpportunity={handleNewOpportunity}
        onExport={handleExport}
        onImport={handleImport}
      />

      {/* Table */}
      <OpportunitiesTable
        opportunities={opportunities}
        isLoading={isLoading}
        onView={handleView}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onMarkWon={handleMarkWon}
        onMarkLost={handleMarkLostClick}
      />

      {/* Loss Reason Dialog */}
      <LossReasonDialog
        open={showLossDialog}
        onOpenChange={setShowLossDialog}
        onConfirm={handleMarkLost}
        isLoading={isProcessing}
      />
    </div>
  );
}
