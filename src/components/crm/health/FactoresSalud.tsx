'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings, Save } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { FormSection } from '@/components/kit/FormSection';
import { FormField } from '@/components/kit/FormField';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeBand, scoreFromConfig, type HealthConfigJson } from '@/lib/services/crm/healthBands';
import { DEFAULT_HEALTH_CONFIG, healthFactorConfigSchema, type HealthFactorSettings } from '@/lib/services/crm/healthFactorConfig';
import type { HealthListRow } from '@/lib/services/crm/healthReadService';
import { claveError, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { HealthFactorRow } from './HealthFactorRow';

export function FactoresSalud({ scores, onClose, onSaved }: { scores: HealthListRow[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('crm.salud');
  const errors = useTranslations('crm.accionesRapidas.errores');
  const [settings, setSettings] = useState<HealthFactorSettings | null>(null);
  const [draft, setDraft] = useState<HealthConfigJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    pedirCrm<HealthFactorSettings>('/api/crm/health/config').then(({ data }) => { if (active) { setSettings(data); setDraft(structuredClone(data.config)); } }).catch(e => { if (active) setError(errors(claveError(e))); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, errors]);
  const weights = draft?.indicators.reduce((sum, i) => sum + i.weight, 0) ?? 0;
  const valid = draft ? healthFactorConfigSchema.safeParse(draft).success : false;
  const preview = { green: 0, yellow: 0, red: 0 };
  const previous = { green: 0, yellow: 0, red: 0 };
  if (draft && valid) for (const row of scores) {
    if (!row.snapshot_raw) continue;
    const result = scoreFromConfig({ ...draft, indicators: draft.indicators.filter(i => i.weight > 0) }, row.snapshot_raw);
    if (result) { preview[result.band] += 1; previous[normalizeBand(row.snapshot_raw.band)] += 1; }
  }
  const save = async () => {
    if (!draft || !settings || !valid || lock.current) return;
    lock.current = true; setSaving(true); setError(null);
    try { await pedirCrm('/api/crm/health/config', { method: 'PATCH', cuerpo: { config: draft, expected_updated_at: settings.updated_at } }); if (alive.current) onSaved(); }
    catch (e) { if (alive.current) setError(errors(claveError(e))); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  const actions = <><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma' })} disabled={saving || !draft} onClick={() => setDraft(structuredClone(DEFAULT_HEALTH_CONFIG))}>{t('restore')}</button><button type="submit" form="health-factors" className={clasesBoton({patron: 'button'})} disabled={!valid || saving || loading}><Save aria-hidden className="size-4" />{t(saving ? 'saving' : 'saveRecalculate')}</button></>;
  return <div className="space-y-5 bg-canvas p-4 lg:p-6"><PageHeader titulo={t('factorsTitle')} subtitulo={t('factorsSubtitle')} icono={Settings} acciones={actions} migas={[{ etiqueta: "CRM", href: "/app/crm" }, { etiqueta: t("title"), href: "/app/crm/salud" }, { etiqueta: t("factorsTitle") }]} volverA="/app/crm/salud" onVolver={onClose} variante="form" movil={{ accion: actions }} />
    {loading ? <div aria-busy="true"><Skeleton className="h-72 w-full" /><span className="sr-only">{t('loading')}</span></div> : !draft ? <EmptyState variante="error" titulo={t('configError')} descripcion={error ?? ''} onReintentar={() => setAttempt(value => value + 1)} /> : <form id="health-factors" className="grid gap-4 xl:grid-cols-[2fr_1fr]" onSubmit={e => { e.preventDefault(); void save(); }}>
      <FormSection densidad="compacta" titulo={t('indicators')} accion={<span role="status" className={weights === 100 ? 'text-xs text-success-text' : 'text-xs text-danger-text'}>{t('weightSum', { total: weights })}</span>}>
        {draft.indicators.map((indicator, index) => <HealthFactorRow key={indicator.key} indicator={indicator} disabled={saving} onChange={next => setDraft({ ...draft, indicators: draft.indicators.map((i, n) => n === index ? next : i) })} />)}
      </FormSection>
      <FormSection densidad="compacta" titulo={t('bandsTitle')}>
        <FormField tamanoEtiqueta="sm" etiqueta={t('healthyFrom')}><CampoNumero valor={draft.bands.green} decimales={0} minimo={1} maximo={100} disabled={saving} onValorChange={value => setDraft({ ...draft, bands: { ...draft.bands, green: value ?? 0 } })} /></FormField>
        <FormField tamanoEtiqueta="sm" etiqueta={t('observationFrom')}><CampoNumero valor={draft.bands.yellow} decimales={0} minimo={0} maximo={99} disabled={saving} onValorChange={value => setDraft({ ...draft, bands: { ...draft.bands, yellow: value ?? 0 } })} /></FormField>
        <FormField tamanoEtiqueta="sm" etiqueta={t('riskBelow')}><CampoNumero valor={draft.bands.yellow} decimales={0} disabled onValorChange={() => undefined} /></FormField>
        <div className="rounded-lg bg-subtle p-3 text-xs text-fg-secondary"><p className="mb-1 font-medium">{t('preview')}</p>{valid ? scores.some(row => row.snapshot_raw) ? (['green', 'yellow', 'red'] as const).map(band => <p key={band}>{t(`bands.${band}`)} {previous[band]} → {preview[band]}</p>) : <p>{t('previewEmpty')}</p> : <p>{t('invalidConfig')}</p>}</div>
        <p className="text-xs text-fg-secondary">{t('queuedDescription')}</p>
      </FormSection>
      {(!valid || error) && <p role="alert" className="text-sm text-danger-text xl:col-span-2">{error ?? t('invalidConfig')}</p>}
    </form>}
  </div>;
}
