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
        title: 'Error',
        description: 'No se pudo cargar la configuración',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast, aplicar]);

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
        title: newState ? 'IA Activada' : 'IA Desactivada',
        description: newState 
          ? 'El asistente de IA está ahora activo'
          : 'El asistente de IA ha sido desactivado'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo cambiar el estado de la IA',
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
        title: 'Configuración guardada',
        description: 'Los cambios se aplicaron correctamente'
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo guardar la configuración',
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
        title: 'Modo actualizado',
        description: 'El modo de IA del canal se actualizó correctamente'
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el modo del canal',
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
        title: 'Modos actualizados',
        description: 'Todos los canales ahora usan el mismo modo de IA'
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar los canales',
        variant: 'destructive'
      });
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
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
          <div className="px-4 sm:px-6 pt-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
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
        <div className="sticky bottom-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tienes cambios sin guardar
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={descartar}
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
