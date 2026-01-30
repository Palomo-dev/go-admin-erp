'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { subDays } from 'date-fns';

import {
  crmDashboardService,
  CRMFilters,
  DashboardData,
  Channel,
  Pipeline,
  Agent,
  Branch,
} from '@/components/crm/dashboard';
import { CRMKPICards } from '@/components/crm/dashboard/CRMKPICards';
import { CRMFunnelChart } from '@/components/crm/dashboard/CRMFunnelChart';
import { CRMActivityChart } from '@/components/crm/dashboard/CRMActivityChart';
import { CRMChannelsChart } from '@/components/crm/dashboard/CRMChannelsChart';
import {
  TopAgentsList,
  TopChannelsList,
  TopOpportunitiesList,
} from '@/components/crm/dashboard/CRMTopLists';
import { CRMFiltersComponent } from '@/components/crm/dashboard/CRMFilters';
import { CRMQuickNav, CRMQuickActions } from '@/components/crm/dashboard/CRMQuickNav';

export default function CrmPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  const [filters, setFilters] = useState<CRMFilters>({
    dateRange: {
      from: subDays(new Date(), 30),
      to: new Date(),
    },
    channelId: null,
    pipelineId: null,
    agentId: null,
    branchId: null,
  });

  const [channels, setChannels] = useState<Channel[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [branches] = useState<Branch[]>([]);

  const loadFilterOptions = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const [channelsData, pipelinesData, agentsData] = await Promise.all([
        crmDashboardService.getChannels(organization.id),
        crmDashboardService.getPipelines(organization.id),
        crmDashboardService.getAgents(organization.id),
      ]);

      setChannels(channelsData);
      setPipelines(pipelinesData);
      setAgents(agentsData);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  }, [organization?.id]);

  const loadDashboardData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const data = await crmDashboardService.getDashboardData(organization.id, filters);
      setDashboardData(data);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleFiltersChange = (newFilters: CRMFilters) => {
    setFilters(newFilters);
  };

  const handlePipelineChange = (pipelineId: string | null) => {
    setFilters(prev => ({ ...prev, pipelineId }));
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  if (!organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Panel de Control CRM
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                  {new Date().toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <CRMQuickActions />
          </div>
        </div>

        {/* Navegación rápida */}
        <CRMQuickNav />

        {/* Filtros */}
        <CRMFiltersComponent
          filters={filters}
          onFiltersChange={handleFiltersChange}
          channels={channels}
          pipelines={pipelines}
          agents={agents}
          branches={branches}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />

        {/* KPIs */}
        <CRMKPICards
          data={dashboardData?.kpis || null}
          isLoading={isLoading}
        />

        {/* Gráficas principales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CRMFunnelChart
            data={dashboardData?.funnel || null}
            isLoading={isLoading}
            pipelines={pipelines}
            selectedPipelineId={filters.pipelineId}
            onPipelineChange={handlePipelineChange}
          />
          <CRMActivityChart
            data={dashboardData?.activityByDay || []}
            isLoading={isLoading}
          />
        </div>

        {/* Segunda fila de gráficas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CRMChannelsChart
            data={dashboardData?.messagesByChannel || []}
            isLoading={isLoading}
          />
          <TopAgentsList
            data={dashboardData?.topAgents || []}
            isLoading={isLoading}
          />
          <TopChannelsList
            data={dashboardData?.topChannels || []}
            isLoading={isLoading}
          />
        </div>

        {/* Oportunidades próximas a cerrar */}
        <TopOpportunitiesList
          data={dashboardData?.topOpportunities || []}
          isLoading={isLoading}
        />
    </div>
  );
}
