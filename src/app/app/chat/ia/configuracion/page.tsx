'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Cpu, MessageSquare, MessagesSquare } from 'lucide-react';
import AISettingsService, {
  AISettings,
  Channel
} from '@/lib/services/aiSettingsService';
import {
  AISettingsHeader,
  ModelSettings,
  BehaviorSettings,
  ChannelAIModeTable
} from '@/components/chat/ia/configuracion';
import { IANavTabs } from '@/components/chat/ia/IANavTabs';

export default function AIConfiguracionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4-turbo-preview');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const [maxFragmentsContext, setMaxFragmentsContext] = useState(5);
  const [tone, setTone] = useState('professional');
  const [language, setLanguage] = useState('es');
  const [systemRules, setSystemRules] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [autoResponseEnabled, setAutoResponseEnabled] = useState(true);
  const [autoResponseDelay, setAutoResponseDelay] = useState(5);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const getMemberId = async () => {
      if (!organizationId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      if (data) {
        setMemberId(data.id);
      }
    };

    getMemberId();
  }, [organizationId]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new AISettingsService(organizationId);
      const [settingsData, channelsData] = await Promise.all([
        service.getSettings(),
        service.getChannels()
      ]);

      setSettings(settingsData);
      setChannels(channelsData);

      if (settingsData) {
        setProvider(settingsData.provider);
        setModel(settingsData.model);
        setTemperature(settingsData.temperature);
        setMaxTokens(settingsData.max_tokens);
        setMaxFragmentsContext(settingsData.max_fragments_context);
        setTone(settingsData.tone);
        setLanguage(settingsData.language);
        setSystemRules(settingsData.system_rules || '');
        setFallbackMessage(settingsData.fallback_message);
        setAutoResponseEnabled(settingsData.auto_response_enabled);
        setAutoResponseDelay(settingsData.auto_response_delay_seconds);
        setConfidenceThreshold(settingsData.confidence_threshold);
        setIsActive(settingsData.is_active);
      }

      setHasChanges(false);
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (setter: (value: any) => void) => (value: any) => {
    setter(value);
    setHasChanges(true);
  };

  const handleToggleAI = async () => {
    if (!organizationId || !memberId) return;

    try {
      const service = new AISettingsService(organizationId);
      const newState = await service.toggleAI(memberId);
      setIsActive(newState);

      toast({
        title: newState ? 'IA Activada' : 'IA Desactivada',
        description: newState 
          ? 'El asistente de IA está ahora activo'
          : 'El asistente de IA ha sido desactivado'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la IA',
        variant: 'destructive'
      });
    }
  };

  const handleSave = async () => {
    if (!organizationId || !memberId) return;

    setSaving(true);
    try {
      const service = new AISettingsService(organizationId);
      await service.updateSettings({
        provider,
        model,
        temperature,
        max_tokens: maxTokens,
        max_fragments_context: maxFragmentsContext,
        tone,
        language,
        system_rules: systemRules,
        fallback_message: fallbackMessage,
        auto_response_enabled: autoResponseEnabled,
        auto_response_delay_seconds: autoResponseDelay,
        confidence_threshold: confidenceThreshold,
        is_active: isActive
      }, memberId);

      toast({
        title: 'Configuración guardada',
        description: 'Los cambios se aplicaron correctamente'
      });

      setHasChanges(false);
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChannelModeChange = async (channelId: string, mode: 'ai_only' | 'hybrid' | 'manual') => {
    if (!organizationId || !memberId) return;

    try {
      const service = new AISettingsService(organizationId);
      await service.updateChannelAIMode(channelId, mode, memberId);

      setChannels(prev => prev.map(ch => 
        ch.id === channelId ? { ...ch, ai_mode: mode } : ch
      ));

      toast({
        title: 'Modo actualizado',
        description: 'El modo de IA del canal se actualizó correctamente'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el modo del canal',
        variant: 'destructive'
      });
    }
  };

  const handleApplyToAllChannels = async (mode: 'ai_only' | 'hybrid' | 'manual') => {
    if (!organizationId || !memberId) return;

    try {
      const service = new AISettingsService(organizationId);
      await service.updateAllChannelsAIMode(mode, memberId);

      setChannels(prev => prev.map(ch => ({ ...ch, ai_mode: mode })));

      toast({
        title: 'Modos actualizados',
        description: 'Todos los canales ahora usan el mismo modo de IA'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar los canales',
        variant: 'destructive'
      });
    }
  };

  if (loading && !settings) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="p-4 sm:p-6 pb-0">
        <IANavTabs />
      </div>
      <AISettingsHeader
        isActive={isActive}
        loading={loading}
        onToggle={handleToggleAI}
        onRefresh={loadData}
        onViewJobs={() => router.push('/app/chat/ia/trabajos')}
        onViewLab={() => router.push('/app/chat/ia/laboratorio')}
      />

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="model" className="h-full flex flex-col">
          <div className="px-6 pt-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <TabsList className="bg-gray-100 dark:bg-gray-800">
              <TabsTrigger value="model" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                <Cpu className="h-4 w-4" />
                Modelo
              </TabsTrigger>
              <TabsTrigger value="behavior" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                <MessageSquare className="h-4 w-4" />
                Comportamiento
              </TabsTrigger>
              <TabsTrigger value="channels" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                <MessagesSquare className="h-4 w-4" />
                Canales
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <TabsContent value="model" className="mt-0">
                <ModelSettings
                  provider={provider}
                  model={model}
                  temperature={temperature}
                  maxTokens={maxTokens}
                  maxFragmentsContext={maxFragmentsContext}
                  onProviderChange={handleChange(setProvider)}
                  onModelChange={handleChange(setModel)}
                  onTemperatureChange={handleChange(setTemperature)}
                  onMaxTokensChange={handleChange(setMaxTokens)}
                  onMaxFragmentsChange={handleChange(setMaxFragmentsContext)}
                />
              </TabsContent>

              <TabsContent value="behavior" className="mt-0">
                <BehaviorSettings
                  tone={tone}
                  language={language}
                  systemRules={systemRules}
                  fallbackMessage={fallbackMessage}
                  autoResponseEnabled={autoResponseEnabled}
                  autoResponseDelay={autoResponseDelay}
                  confidenceThreshold={confidenceThreshold}
                  onToneChange={handleChange(setTone)}
                  onLanguageChange={handleChange(setLanguage)}
                  onSystemRulesChange={handleChange(setSystemRules)}
                  onFallbackChange={handleChange(setFallbackMessage)}
                  onAutoResponseChange={handleChange(setAutoResponseEnabled)}
                  onDelayChange={handleChange(setAutoResponseDelay)}
                  onConfidenceChange={handleChange(setConfidenceThreshold)}
                />
              </TabsContent>

              <TabsContent value="channels" className="mt-0">
                <ChannelAIModeTable
                  channels={channels}
                  loading={loading}
                  onModeChange={handleChannelModeChange}
                  onApplyToAll={handleApplyToAllChannels}
                />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>

      {hasChanges && (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tienes cambios sin guardar
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={loadData}
                disabled={saving}
                className="border-gray-300 dark:border-gray-700"
              >
                Descartar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
