'use client';

/**
 * Pestaña "Proveedores e IA" de Configuración › CRM (F0 §5.2).
 * Agrupa las tarjetas por categoría (UI_PROVIDER_CATEGORIES) y muestra el
 * presupuesto mensual de IA (settings.monthly_budget_usd del LLM OpenAI).
 */

import { useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { CATEGORY_LABELS, UI_PROVIDER_CATEGORIES, type ProviderCategory } from '@/lib/crm/providerCatalog';
import { ProviderCard } from './ProviderCard';
import { useProviderConfigs, type PutProviderInput } from './useProviderConfigs';
import { CallAiPolicyCard } from '@/components/crm/calls'; // F4

const CATEGORY_HELP: Partial<Record<ProviderCategory, string>> = {
  llm: 'Redacción con IA, clasificación y cerebro del agente de voz.',
  analysis: 'Resumen, sentimiento y próximos pasos de cada llamada grabada.',
  stt: 'Transcripción de grabaciones. ElevenLabs Scribe v2 es el primario; Gemini es el respaldo.',
  tts: 'Voz sintética del agente IA (voz clonada del vendedor en F6).',
  voice: 'Llamadas desde el navegador y el celular. Por defecto usa la cuenta de la plataforma.',
  sms: 'SMS como canal secundario de secuencias y recordatorios.',
  email: 'Envío transaccional y campañas; el dominio se verifica por organización (F7).',
  whatsapp: 'Canal primario Meta Cloud API; Twilio como alternativa (F16).',
};

export function ProveedoresTab() {
  const { items, canEdit, loading, error, refresh, save, test } = useProviderConfigs();
  const { toast } = useToast();

  const grouped = useMemo(() => {
    const map = new Map<ProviderCategory, typeof items>();
    for (const cat of UI_PROVIDER_CATEGORIES) {
      map.set(cat, items.filter((i) => i.category === cat).sort((a, b) => a.priority - b.priority));
    }
    return map;
  }, [items]);

  const handleSave = async (input: PutProviderInput) => {
    try {
      const item = await save(input);
      toast({
        title: 'Configuración guardada',
        description: input.credentials
          ? item.configured
            ? 'Clave propia guardada. Se usará en lugar de la de la plataforma.'
            : 'Credenciales actualizadas.'
          : `${CATEGORY_LABELS[item.category]} · ${item.provider}`,
      });
      return item;
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      throw err;
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Cargando proveedores">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>No se pudo cargar la configuración</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Reintentar
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Proveedores e IA</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cada organización puede usar sus propias claves o las de la plataforma. Las claves se guardan en el servidor y no vuelven a mostrarse.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Solo lectura (administradores)
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading} aria-label="Recargar">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* F4 — política de inteligencia de llamadas (categorías stt + analysis) */}
      <CallAiPolicyCard />

      {UI_PROVIDER_CATEGORIES.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`} className="space-y-3">
            <div>
              <h4 id={`cat-${cat}`} className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                {CATEGORY_LABELS[cat]}
              </h4>
              {CATEGORY_HELP[cat] && <p className="text-xs text-gray-500 dark:text-gray-400">{CATEGORY_HELP[cat]}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((item) => (
                <ProviderCard key={`${item.category}-${item.provider}`} item={item} canEdit={canEdit} onSave={handleSave} onTest={test} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
