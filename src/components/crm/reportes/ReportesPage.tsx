'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileDown, RefreshCw, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganization, getOrganizationId } from '@/lib/hooks/useOrganization';
import { cn } from '@/utils/Utils';

import { ReportesFiltros } from './ReportesFiltros';
import { ReportesStats } from './ReportesStats';
import { ReportesCanales } from './ReportesCanales';
import { ReportesEmbudo } from './ReportesEmbudo';
import { ReportesCampanas } from './ReportesCampanas';
import { ConversationPieChart, ChannelBarChart, PipelineFunnelChart } from './ReportesCharts';
import { createReportesService } from './ReportesService';
import type { 
  ReportFilters, 
  ConversationStats, 
  ChannelMetrics, 
  PipelineMetrics, 
  CampaignMetrics 
} from './types';

export function ReportesPage() {
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('atencion');
  
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: null,
    dateTo: null,
    channelId: null,
    pipelineId: null,
    agentId: null
  });

  // Datos para filtros
  const [channels, setChannels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // Datos de reportes
  const [conversationStats, setConversationStats] = useState<ConversationStats>({
    total: 0, open: 0, pending: 0, resolved: 0, closed: 0, avgResponseTime: 0, avgResolutionTime: 0
  });
  const [channelMetrics, setChannelMetrics] = useState<ChannelMetrics[]>([]);
  const [pipelineMetrics, setPipelineMetrics] = useState<PipelineMetrics[]>([]);
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignMetrics[]>([]);

  const loadFilterOptions = useCallback(async () => {
    const orgId = getOrganizationId();
    const service = createReportesService(orgId);

    const [channelsData, pipelinesData, agentsData] = await Promise.all([
      service.getChannels(),
      service.getPipelines(),
      service.getAgents()
    ]);

    setChannels(channelsData);
    setPipelines(pipelinesData);
    setAgents(agentsData);
  }, []);

  const loadReportData = useCallback(async () => {
    const orgId = getOrganizationId();
    const service = createReportesService(orgId);

    setRefreshing(true);
    try {
      const [stats, channels, pipelines, campaigns] = await Promise.all([
        service.getConversationStats(filters),
        service.getChannelMetrics(filters),
        service.getPipelineMetrics(filters),
        service.getCampaignMetrics(filters)
      ]);

      setConversationStats(stats);
      setChannelMetrics(channels);
      setPipelineMetrics(pipelines);
      setCampaignMetrics(campaigns);
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const handleExportCSV = async () => {
    const orgId = getOrganizationId();
    const service = createReportesService(orgId);

    switch (activeTab) {
      case 'atencion':
        await service.exportToCSV(
          channelMetrics.map(c => ({
            Canal: c.channelName,
            Tipo: c.channelType,
            Conversaciones: c.totalConversations,
            Mensajes: c.totalMessages,
            'Promedio Mensajes': c.avgMessagesPerConversation
          })),
          'reporte_canales'
        );
        break;
      case 'ventas':
        const stageData = pipelineMetrics.flatMap(p => 
          p.stages.map(s => ({
            Pipeline: p.pipelineName,
            Etapa: s.stageName,
            Oportunidades: s.count,
            Valor: s.value,
            Probabilidad: s.probability
          }))
        );
        await service.exportToCSV(stageData, 'reporte_pipeline');
        break;
      case 'marketing':
        await service.exportToCSV(
          campaignMetrics.map(c => ({
            Campaña: c.campaignName,
            Estado: c.status,
            Contactos: c.totalContacts,
            Enviados: c.sent,
            Abiertos: c.opened,
            'Tasa Apertura': `${c.openRate}%`,
            Clicks: c.clicked,
            'Tasa Click': `${c.clickRate}%`,
            Respuestas: c.replied,
            Rebotes: c.bounced
          })),
          'reporte_campanas'
        );
        break;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reportes CRM
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Análisis de atención, ventas y marketing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadReportData()}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={handleExportCSV}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <ReportesFiltros
        filters={filters}
        onFiltersChange={setFilters}
        channels={channels}
        pipelines={pipelines}
        agents={agents}
      />

      {/* Stats generales */}
      <ReportesStats stats={conversationStats} loading={loading} />

      {/* Tabs de reportes */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-gray-100 dark:bg-gray-800">
          <TabsTrigger value="atencion">Atención</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
        </TabsList>

        <TabsContent value="atencion" className="space-y-4">
          {/* Gráficos principales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ConversationPieChart stats={conversationStats} loading={loading} />
            <ChannelBarChart metrics={channelMetrics} loading={loading} />
          </div>
          {/* Detalle por canal */}
          <ReportesCanales metrics={channelMetrics} loading={loading} />
        </TabsContent>

        <TabsContent value="ventas" className="space-y-4">
          {/* Gráfico de embudo */}
          <PipelineFunnelChart metrics={pipelineMetrics} loading={loading} />
          {/* Detalle de etapas */}
          <ReportesEmbudo metrics={pipelineMetrics} loading={loading} />
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          <ReportesCampanas metrics={campaignMetrics} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
