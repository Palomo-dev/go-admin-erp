'use client';

/**
 * Tarjeta de un proveedor: estado (clave propia / plataforma / sin
 * configurar), activo, settings editables (modelo, presupuesto…), botón de
 * credenciales y "Probar conexión" con resultado inline.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, KeyRound, Loader2, PlugZap, XCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { ProviderConfigSafe } from '@/lib/services/providerRegistry';
import { PROVIDER_LABELS, SETTING_FIELDS, type ProviderCategory, type SettingField } from '@/lib/crm/providerCatalog';
import { ProviderCredentialForm } from './ProviderCredentialForm';
import type { PutProviderInput, TestResult } from './useProviderConfigs';

export interface ProviderCardProps {
  item: ProviderConfigSafe;
  canEdit: boolean;
  onSave: (input: PutProviderInput) => Promise<unknown>;
  onTest: (category: ProviderCategory, provider: string) => Promise<TestResult>;
}

function StatusBadge({ item }: { item: ProviderConfigSafe }) {
  const t = useTranslations('configuracionTextos.providerCard');
  if (item.configured) return <Badge variant="success">{t('estado.propia')}</Badge>;
  if (item.platform_available) return <Badge variant="secondary">{t('estado.plataforma')}</Badge>;
  return <Badge variant="warning">{t('estado.sinConfigurar')}</Badge>;
}

export function ProviderCard({ item, canEdit, onSave, onTest }: ProviderCardProps) {
  const t = useTranslations('configuracionTextos.providerCard');
  // La etiqueta de cada ajuste se traduce aquí; la del catálogo queda de respaldo.
  const etiquetaAjuste = (f: SettingField) => (t.has(`ajustes.${f.key}`) ? t(`ajustes.${f.key}`) : f.label);
  const [credOpen, setCredOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>(item.settings);
  const fields = SETTING_FIELDS[`${item.category}:${item.provider}`] ?? [];
  const dirty = JSON.stringify(settings) !== JSON.stringify(item.settings);

  const persistSettings = async () => {
    setSaving(true);
    try {
      // Solo las claves editables del catálogo: el servidor valida `settings`
      // contra SETTING_FIELDS y rechaza claves desconocidas (los defaults
      // derivados como `model` de llm:openai no viajan). `null` borra la clave.
      const editable: Record<string, unknown> = {};
      for (const f of fields) if (f.key in settings) editable[f.key] = settings[f.key] ?? null;
      await onSave({ category: item.category, provider: item.provider, settings: editable });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (is_active: boolean) => {
    setSaving(true);
    try {
      await onSave({ category: item.category, provider: item.provider, is_active });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await onTest(item.category, item.provider));
    } catch (err) {
      setResult({ ok: false, detail: err instanceof Error ? err.message : t('error') });
    } finally {
      setTesting(false);
    }
  };

  const disabled = !canEdit || saving;

  return (
    <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base text-gray-900 dark:text-white">
            {PROVIDER_LABELS[item.provider] ?? item.provider}
          </CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge item={item} />
            <div className="flex items-center gap-1.5">
              <Switch
                id={`active-${item.category}-${item.provider}`}
                checked={item.is_active}
                onCheckedChange={toggleActive}
                disabled={disabled}
                aria-label={t('activarProveedor', { proveedor: PROVIDER_LABELS[item.provider] ?? item.provider })}
              />
              <Label htmlFor={`active-${item.category}-${item.provider}`} className="text-xs text-gray-500 dark:text-gray-400">
                {t('activo')}
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `set-${item.category}-${item.provider}-${f.key}`;
              const val = settings[f.key];
              if (f.type === 'boolean') {
                return (
                  <div key={f.key} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                    <Label htmlFor={id} className="text-sm text-gray-700 dark:text-gray-200">{etiquetaAjuste(f)}</Label>
                    <Switch id={id} checked={!!val} disabled={disabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, [f.key]: v }))} />
                  </div>
                );
              }
              if (f.type === 'select') {
                const options = f.options ?? [];
                const current = typeof val === 'string' && val ? val : options[0];
                return (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={id} className="text-sm text-gray-700 dark:text-gray-200">{etiquetaAjuste(f)}</Label>
                    <Select value={current} disabled={disabled} onValueChange={(v) => setSettings((s) => ({ ...s, [f.key]: v }))}>
                      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(options.includes(current) ? options : [current, ...options]).map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              return (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={id} className="text-sm text-gray-700 dark:text-gray-200">{etiquetaAjuste(f)}</Label>
                  <Input
                    id={id}
                    type={f.type === 'number' ? 'number' : 'text'}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    disabled={disabled}
                    value={val == null ? '' : String(val)}
                    onChange={(e) => setSettings((s) => ({ ...s, [f.key]: f.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
        )}

        {item.credential_keys.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('clavesGuardadas')}{' '}{item.credential_keys.map((k) => <code key={k} className="mr-1 rounded bg-gray-100 px-1 dark:bg-gray-800">{k}=••••</code>)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setCredOpen(true)} disabled={!canEdit} title={!canEdit ? t('soloAdministradores') : undefined}>
            <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {item.configured ? t('cambiarClave') : t('usarMiClave')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={runTest} disabled={!canEdit || testing} aria-busy={testing}>
            {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {t('probarConexion')}
          </Button>
          {dirty && (
            <Button type="button" size="sm" onClick={persistSettings} disabled={disabled} aria-busy={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('guardarAjustes')}
            </Button>
          )}
        </div>

        {result && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
              result.ok
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200',
            )}
          >
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>
              {result.detail}
              {result.latencyMs != null && (
                <span className="ml-1 text-xs opacity-70">
                  {result.source
                    ? t('latenciaFuente', { ms: String(result.latencyMs), fuente: result.source === 'org' ? t('fuente.propia') : t('fuente.plataforma') })
                    : t('latencia', { ms: String(result.latencyMs) })}
                </span>
              )}
            </span>
          </div>
        )}
      </CardContent>

      <ProviderCredentialForm
        open={credOpen}
        onOpenChange={setCredOpen}
        category={item.category}
        provider={item.provider}
        existingKeys={item.credential_keys}
        onSubmit={async (credentials) => {
          await onSave({ category: item.category, provider: item.provider, credentials });
        }}
      />
    </Card>
  );
}
