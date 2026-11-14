'use client';

/**
 * Pestaña "Proveedores e IA" de Configuración › CRM (F0 §5.2).
 * Agrupa las tarjetas por categoría (UI_PROVIDER_CATEGORIES) y muestra el
 * presupuesto mensual de IA (settings.monthly_budget_usd del LLM OpenAI).
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { CATEGORY_LABELS, UI_PROVIDER_CATEGORIES, type ProviderCategory } from '@/lib/crm/providerCatalog';
import { ProviderCard } from './ProviderCard';
import { useProviderConfigs, type PutProviderInput } from './useProviderConfigs';
import { CallAiPolicyCard } from '@/components/crm/calls'; // F4

export function ProveedoresTab() {
  const { items, canEdit, loading, error, refresh, save, test } = useProviderConfigs();
  const { toast } = useToast();
  const t = useTranslations('configuracionTextos.proveedoresTab');
  // Nombre y ayuda de cada categoría: traducidos aquí; el catálogo queda de respaldo.
  const etiquetaCategoria = (cat: ProviderCategory) => (t.has(`categorias.${cat}`) ? t(`categorias.${cat}`) : CATEGORY_LABELS[cat]);
  const ayudaCategoria = (cat: ProviderCategory) => (t.has(`ayudaCategoria.${cat}`) ? t(`ayudaCategoria.${cat}`) : null);

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
        title: t('guardada'),
        description: input.credentials
          ? item.configured
            ? t('clavePropiaGuardada')
            : t('credencialesActualizadas')
          : `${etiquetaCategoria(item.category)} · ${item.provider}`,
      });
      return item;
    } catch (err) {
      toast({ title: t('errorGuardar'), description: err instanceof Error ? err.message : t('error'), variant: 'destructive' });
      throw err;
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label={t('cargando')}>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>{t('errorCargar')}</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />{t('reintentar')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('titulo')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('descripcion')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{t('soloLectura')}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading} aria-label={t('recargar')}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* F4 — política de inteligencia de llamadas (categorías stt + analysis) */}
      <CallAiPolicyCard />

      {UI_PROVIDER_CATEGORIES.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        const ayuda = ayudaCategoria(cat);
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`} className="space-y-3">
            <div>
              <h4 id={`cat-${cat}`} className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                {etiquetaCategoria(cat)}
              </h4>
              {ayuda && <p className="text-xs text-gray-500 dark:text-gray-400">{ayuda}</p>}
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
