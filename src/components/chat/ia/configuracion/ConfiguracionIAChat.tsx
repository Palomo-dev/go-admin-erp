'use client';

/**
 * Configuración › Chat › IA del chat (antes /app/chat/ia/configuracion, que
 * ahora redirige aquí: decisión del dueño 2026-10-07, un solo lugar para todas
 * las configuraciones). Mismo contenido y mismo servicio (`AISettingsService`):
 * solo se mudó de la página del módulo a una sección de Configuración.
 *
 * Dentro del diálogo de Configuración usa la barra del diálogo («N cambios sin
 * guardar · Descartar · Guardar cambios», Figma 92-config-dialogo-01): se
 * registra con `useRegistrarCambios` y no pinta la suya; el diálogo pregunta
 * antes de descartar al cerrar o cambiar de sección. Qué se guarda y dónde no
 * cambia (`AISettingsService.updateSettings`). El interruptor de la IA y el
 * modo de cada canal se siguen guardando al instante, como antes.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
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
import { contarCambios, useDentroDelDialogo, useRegistrarCambios } from '@/components/configuracion/dialogo/cambiosSinGuardar';

/** Lo que se edita y se guarda con «Guardar» (el interruptor de la IA se guarda al instante). */
interface Editables {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxFragmentsContext: number;
  tone: string;
  language: string;
  systemRules: string;
  fallbackMessage: string;
  autoResponseEnabled: boolean;
  autoResponseDelay: number;
  confidenceThreshold: number;
}

const VALORES_INICIALES: Editables = {
  provider: 'openai',
  model: 'gpt-4-turbo-preview',
  temperature: 0.7,
  maxTokens: 500,
  maxFragmentsContext: 5,
  tone: 'professional',
  language: 'es',
  systemRules: '',
  fallbackMessage: '',
  autoResponseEnabled: true,
  autoResponseDelay: 5,
  confidenceThreshold: 0.7,
};

export function ConfiguracionIAChat() {
  const t = useTranslations('chatConfig.ia');
  const tc = useTranslations('chatConfig.comun');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const enDialogo = useDentroDelDialogo();
  /** Lo último guardado (o los valores iniciales si la organización aún no tiene configuración). */
  const [guardado, setGuardado] = useState<Editables>(VALORES_INICIALES);

  const [provider, setProvider] = useState(VALORES_INICIALES.provider);
  const [model, setModel] = useState(VALORES_INICIALES.model);
  const [temperature, setTemperature] = useState(VALORES_INICIALES.temperature);
  const [maxTokens, setMaxTokens] = useState(VALORES_INICIALES.maxTokens);
  const [maxFragmentsContext, setMaxFragmentsContext] = useState(VALORES_INICIALES.maxFragmentsContext);
  const [tone, setTone] = useState(VALORES_INICIALES.tone);
  const [language, setLanguage] = useState(VALORES_INICIALES.language);
  const [systemRules, setSystemRules] = useState(VALORES_INICIALES.systemRules);
  const [fallbackMessage, setFallbackMessage] = useState(VALORES_INICIALES.fallbackMessage);
  const [autoResponseEnabled, setAutoResponseEnabled] = useState(VALORES_INICIALES.autoResponseEnabled);
  const [autoResponseDelay, setAutoResponseDelay] = useState(VALORES_INICIALES.autoResponseDelay);
  const [confidenceThreshold, setConfidenceThreshold] = useState(VALORES_INICIALES.confidenceThreshold);
  const [isActive, setIsActive] = useState(true);

  const aplicar = useCallback((v: Editables) => {
    setProvider(v.provider);
    setModel(v.model);
    setTemperature(v.temperature);
    setMaxTokens(v.maxTokens);
    setMaxFragmentsContext(v.maxFragmentsContext);
    setTone(v.tone);
    setLanguage(v.language);
    setSystemRules(v.systemRules);
    setFallbackMessage(v.fallbackMessage);
    setAutoResponseEnabled(v.autoResponseEnabled);
    setAutoResponseDelay(v.autoResponseDelay);
    setConfidenceThreshold(v.confidenceThreshold);
  }, []);

  const editado: Editables = {
    provider,
    model,
    temperature,
    maxTokens,
    maxFragmentsContext,
    tone,
    language,
    systemRules,
    fallbackMessage,
    autoResponseEnabled,
    autoResponseDelay,
    confidenceThreshold,
  };
  const nCambios = contarCambios(editado, guardado);
  const hasChanges = nCambios > 0;

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

      const valores: Editables = settingsData
        ? {
            provider: settingsData.provider,
            model: settingsData.model,
            temperature: settingsData.temperature,
            maxTokens: settingsData.max_tokens,
            maxFragmentsContext: settingsData.max_fragments_context,
            tone: settingsData.tone,
            language: settingsData.language,
            systemRules: settingsData.system_rules || '',
            fallbackMessage: settingsData.fallback_message,
            autoResponseEnabled: settingsData.auto_response_enabled,
            autoResponseDelay: settingsData.auto_response_delay_seconds,
            confidenceThreshold: settingsData.confidence_threshold,
          }
        : VALORES_INICIALES;
      aplicar(valores);
      setGuardado(valores);
      if (settingsData) setIsActive(settingsData.is_active);
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast({
        title: tc('error'),
        description: t('toasts.errorCarga'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast, aplicar, t, tc]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hay cambios cuando lo editado difiere de lo guardado (`nCambios`): volver
  // al valor original ya no cuenta como cambio.
  const handleChange = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
  };

  // Guardar la configuración va por PATCH /api/chat/ai/settings (organización
  // de la sesión y permiso de administrador en el servidor).
  const handleToggleAI = async () => {
    if (!organizationId) return;

    try {
      const service = new AISettingsService(organizationId);
      const newState = await service.toggleAI();
      setIsActive(newState);

      toast({
        title: newState ? t('toasts.activadaTitulo') : t('toasts.desactivadaTitulo'),
        description: newState ? t('toasts.activadaDesc') : t('toasts.desactivadaDesc')
      });
    } catch (error) {
      toast({
        title: tc('error'),
        description: error instanceof Error ? error.message : t('toasts.errorEstado'),
        variant: 'destructive'
      });
    }
  };

  const handleSave = async () => {
    if (!organizationId) return;

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
      });

      toast({
        title: t('toasts.guardada'),
        description: t('toasts.guardadaDesc')
      });

      await loadData();
    } catch (error) {
      toast({
        title: tc('error'),
        description: error instanceof Error ? error.message : t('toasts.errorGuardar'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const descartar = () => aplicar(guardado);

  // Barra «cambios sin guardar» del diálogo de Configuración.
  useRegistrarCambios({
    cambios: nCambios,
    guardando: saving,
    guardar: handleSave,
    descartar,
  });

  const handleChannelModeChange = async (channelId: string, mode: 'auto' | 'hybrid' | 'manual') => {
    if (!organizationId) return;

    try {
      const service = new AISettingsService(organizationId);
      await service.updateChannelAIMode(channelId, mode);

      setChannels(prev => prev.map(ch => 
        ch.id === channelId ? { ...ch, ai_mode: mode } : ch
      ));

      toast({
        title: t('toasts.modoActualizado'),
        description: t('toasts.modoActualizadoDesc')
      });
    } catch {
      toast({
        title: tc('error'),
        description: t('toasts.errorModo'),
        variant: 'destructive'
      });
    }
  };

  const handleApplyToAllChannels = async (mode: 'auto' | 'hybrid' | 'manual') => {
    if (!organizationId) return;

    try {
      const service = new AISettingsService(organizationId);
      await service.updateAllChannelsAIMode(mode);

      setChannels(prev => prev.map(ch => ({ ...ch, ai_mode: mode })));

      toast({
        title: t('toasts.modosActualizados'),
        description: t('toasts.modosActualizadosDesc')
      });
    } catch {
      toast({
        title: tc('error'),
        description: t('toasts.errorModos'),
        variant: 'destructive'
      });
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <div className="flex flex-col items-center gap-4">
          <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-brand" />
          <p className="text-fg-muted">{t('cargando')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-subtle">
      <AISettingsHeader
        isActive={isActive}
        loading={loading}
        onToggle={handleToggleAI}
        onRefresh={loadData}
        onViewJobs={() => router.push('/app/chat/ia/trabajos')}
        onViewLab={() => router.push('/app/chat/ia/laboratorio')}
      />

      <div>
        <Tabs defaultValue="model" className="flex flex-col">
          {/* Las pestañas se desplazan en horizontal si no caben (también fuera del diálogo). */}
          <div className="border-b border-line bg-surface px-4 pt-4 sm:px-6">
            <TabsList aria-label={t('pestanas.etiqueta')} className="h-auto max-w-full justify-start overflow-x-auto bg-subtle [scrollbar-width:thin]">
              <TabsTrigger value="model" className="gap-2 data-[state=active]:bg-surface">
                <Cpu aria-hidden="true" className="h-4 w-4" />
                {t('pestanas.modelo')}
              </TabsTrigger>
              <TabsTrigger value="behavior" className="gap-2 data-[state=active]:bg-surface">
                <MessageSquare aria-hidden="true" className="h-4 w-4" />
                {t('pestanas.comportamiento')}
              </TabsTrigger>
              <TabsTrigger value="channels" className="gap-2 data-[state=active]:bg-surface">
                <MessagesSquare aria-hidden="true" className="h-4 w-4" />
                {t('pestanas.canales')}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 sm:p-6">
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

      {hasChanges && !enDialogo && (
        <div className="sticky bottom-0 border-t border-line bg-surface p-4">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-secondary">
              {t('cambiosSinGuardar')}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={descartar}
                disabled={saving}
              >
                {t('descartar')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                    {tc('guardando')}
                  </>
                ) : (
                  <>
                    <Save aria-hidden="true" className="mr-2 h-4 w-4" />
                    {tc('guardarCambios')}
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
