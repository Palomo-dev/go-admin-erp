'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
import AILabService, {
  LabSettings,
  LabTestResult,
  RetrievedFragment,
  Channel
} from '@/lib/services/aiLabService';
import {
  LabHeader,
  LabPromptInput,
  LabSettingsPanel,
  LabFragmentsPanel,
  LabResultPanel
} from '@/components/chat/ia/laboratorio';
import { IANavTabs } from '@/components/chat/ia/IANavTabs';

export default function AILaboratorioPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    withEmbeddings: 0,
    avgPriority: 0
  });
  const [fragments, setFragments] = useState<RetrievedFragment[]>([]);
  const [selectedFragmentIds, setSelectedFragmentIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [settings, setSettings] = useState<LabSettings>({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 500,
    maxFragments: 5,
    systemRules: '',
    tone: 'professional',
    language: 'es',
    simulatedChannel: 'whatsapp'
  });
  const [result, setResult] = useState<LabTestResult | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new AILabService(organizationId);

      const [statsData, fragmentsData, channelsData, aiSettings] = await Promise.all([
        service.getFragmentStats(),
        service.getFragments({ isActive: true, limit: 50 }),
        service.getChannels(),
        service.getAISettings()
      ]);

      setStats(statsData);
      
      const retrievedFragments: RetrievedFragment[] = fragmentsData.map((f, i) => ({
        id: f.id,
        title: f.title,
        content: f.content,
        similarity: 1 - (i * 0.05),
        tags: f.tags || [],
        priority: f.priority || 5
      }));
      
      setFragments(retrievedFragments);
      setSelectedFragmentIds(retrievedFragments.slice(0, 5).map(f => f.id));
      setChannels(channelsData);

      if (aiSettings) {
        setSettings(aiSettings);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del laboratorio',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = async (query: string) => {
    if (!organizationId) return;

    setTesting(true);
    try {
      const service = new AILabService(organizationId);

      const searchResults = await service.searchFragmentsByText(query, settings.maxFragments);
      
      if (searchResults.length > 0) {
        setFragments(prev => {
          const existingIds = new Set(prev.map(f => f.id));
          const newFragments = searchResults.filter(f => !existingIds.has(f.id));
          return [...searchResults, ...prev.filter(f => !searchResults.find(s => s.id === f.id))];
        });
        setSelectedFragmentIds(searchResults.map(f => f.id));
      }

      const selectedFragments = searchResults.length > 0 
        ? searchResults 
        : fragments.filter(f => selectedFragmentIds.includes(f.id));

      const testResult = await service.runLocalTest(query, settings, selectedFragments);
      setResult(testResult);

      await service.logLabTest(testResult);

      toast({
        title: 'Prueba completada',
        description: `Respuesta generada en ${testResult.metrics.processingTimeMs}ms`
      });
    } catch (error) {
      console.error('Error en prueba:', error);
      toast({
        title: 'Error',
        description: 'No se pudo completar la prueba',
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSettingsChange = (newSettings: LabSettings) => {
    setSettings(newSettings);
  };

  const handleGoToSettings = () => {
    router.push('/app/chat/ia/configuracion');
  };

  if (loading && fragments.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando laboratorio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="p-4 sm:p-6 pb-0">
        <IANavTabs />
      </div>
      <LabHeader
        stats={stats}
        loading={loading}
        onRefresh={loadData}
        onSettings={handleGoToSettings}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <LabPromptInput
                onSubmit={handleSearch}
                loading={testing}
                disabled={!organizationId}
              />

              <LabResultPanel
                result={result}
                loading={testing}
              />
            </div>

            <div className="space-y-6">
              <LabSettingsPanel
                settings={settings}
                channels={channels}
                onChange={handleSettingsChange}
              />

              <LabFragmentsPanel
                fragments={fragments}
                selectedIds={selectedFragmentIds}
                onSelectionChange={setSelectedFragmentIds}
                loading={loading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
