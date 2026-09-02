'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  crmDashboardService,
  CRMKPICards,
  CRMFunnelChart,
  CRMActivityChart,
  CRMChannelsChart,
  TopAgentsList,
  TopChannelsList,
  TopOpportunitiesList,
  type KPIData,
  type FunnelData,
  type ActivityByDay,
  type MessagesByChannel,
  type TopAgent,
  type TopChannel,
  type TopOpportunity,
  type Pipeline,
  type CRMFilters,
} from '@/components/crm/dashboard';
import { ReportesPage } from '@/components/crm/reportes';
import { MetricasView } from '@/components/crm/metricas/MetricasView';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';
const PERIODO_LABEL = 'Últimos 30 días';

function getDefaultFilters(): CRMFilters {
  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  return {
    dateRange: { from: hace30, to: hoy },
    channelId: null,
    pipelineId: null,
    agentId: null,
    branchId: null,
  };
}

function formatResponseTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function buildExportData(
  kpis: KPIData | null,
  topOpportunities: TopOpportunity[],
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Conversaciones abiertas', value: String(kpis.conversationsOpen), kind: 'neutro' },
    { label: 'Oportunidades abiertas', value: String(kpis.opportunitiesOpen), kind: 'neutro' },
    {
      label: 'Valor oportunidades',
      value: formatCurrency(kpis.opportunitiesValue, CURRENCY_CODE),
      kind: 'ingreso',
    },
    {
      label: 'Pronóstico del mes',
      value: formatCurrency(kpis.monthForecast, CURRENCY_CODE),
      kind: 'ingreso',
    },
    { label: 'Clientes nuevos', value: String(kpis.newCustomers), kind: 'neutro' },
    { label: 'Total clientes', value: String(kpis.totalCustomers), kind: 'neutro' },
    { label: 'Cumplimiento SLA', value: `${kpis.slaCompliance.toFixed(0)}%`, kind: 'neutro' },
    {
      label: 'Tiempo respuesta prom.',
      value: formatResponseTime(kpis.avgResponseTime),
      kind: 'neutro',
    },
  ];

  const filas: SectionDataRow[] = topOpportunities.map((o) => ({
    oportunidad: o.name,
    cliente: o.customerName,
    monto: formatCurrency(o.amount, o.currency || CURRENCY_CODE),
    etapa: o.stageName,
    probabilidad: `${o.probability}%`,
  }));

  return {
    titulo: 'Dashboard CRM',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'oportunidad', label: 'Oportunidad' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'monto', label: 'Monto', align: 'right' },
      { key: 'etapa', label: 'Etapa' },
      { key: 'probabilidad', label: 'Prob.', align: 'right' },
    ],
    filas,
  };
}

export default function CrmSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [activityByDay, setActivityByDay] = useState<ActivityByDay[]>([]);
  const [messagesByChannel, setMessagesByChannel] = useState<MessagesByChannel[]>([]);
  const [topAgents, setTopAgents] = useState<TopAgent[]>([]);
  const [topChannels, setTopChannels] = useState<TopChannel[]>([]);
  const [topOpportunities, setTopOpportunities] = useState<TopOpportunity[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  const filters = useMemo(() => getDefaultFilters(), []);

  useEffect(() => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      try {
        const [dashboardData, pipelinesData, orgData] = await Promise.all([
          crmDashboardService.getDashboardData(organizationId, filters),
          crmDashboardService.getPipelines(organizationId),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(dashboardData.kpis);
        setFunnel(dashboardData.funnel);
        setActivityByDay(dashboardData.activityByDay);
        setMessagesByChannel(dashboardData.messagesByChannel);
        setTopAgents(dashboardData.topAgents);
        setTopChannels(dashboardData.topChannels);
        setTopOpportunities(dashboardData.topOpportunities);
        setPipelines(pipelinesData);

        if (orgData.data) {
          setOrgInfo({
            name: orgData.data.name || 'Organización',
            legalName: orgData.data.legal_name || undefined,
            nit: orgData.data.tax_id || undefined,
            city: orgData.data.city || undefined,
            address: orgData.data.address || undefined,
            phone: orgData.data.phone || undefined,
            email: orgData.data.email || undefined,
            logoUrl: orgData.data.logo_url || undefined,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error cargando dashboard de CRM:', err);
        toastError('Error', 'No se pudo cargar el dashboard de CRM');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [filters]);

  const handlePipelineChange = useCallback(async (pipelineId: string | null) => {
    setSelectedPipelineId(pipelineId);
    const organizationId = getOrganizationId();
    if (!organizationId) return;
    try {
      const funnelData = await crmDashboardService.getFunnelData(
        organizationId,
        pipelineId || undefined,
      );
      setFunnel(funnelData);
    } catch (err) {
      console.error('Error recargando embudo de CRM:', err);
      toastError('Error', 'No se pudo recargar el embudo de ventas');
    }
  }, []);

  const exportData = useMemo(
    () => buildExportData(kpis, topOpportunities),
    [kpis, topOpportunities],
  );

  return (
    <ModuloSection
      moduleCode="crm"
      moduleName="CRM"
      icon={Users}
      accentColor="text-blue-600 dark:text-blue-400"
      accentBg="bg-blue-100 dark:bg-blue-900/30"
      hasReportes
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
      reportesContent={<ReportesPage />}
      metricasContent={<MetricasView />}
    >
      <div className="space-y-6">
        <CRMKPICards data={kpis} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CRMFunnelChart
            data={funnel}
            isLoading={isLoading}
            pipelines={pipelines}
            selectedPipelineId={selectedPipelineId}
            onPipelineChange={handlePipelineChange}
          />
          <CRMActivityChart data={activityByDay} isLoading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CRMChannelsChart data={messagesByChannel} isLoading={isLoading} />
          <TopOpportunitiesList data={topOpportunities} isLoading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopAgentsList data={topAgents} isLoading={isLoading} />
          <TopChannelsList data={topChannels} isLoading={isLoading} />
        </div>
      </div>
    </ModuloSection>
  );
}
