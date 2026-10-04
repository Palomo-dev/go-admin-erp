"use client";
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { fetchJson } from '@/lib/utils/fetchJson';
import { MAX_BYTES_ARCHIVO_RNE, VIGENCIA_RNE_DIAS } from '@/lib/services/crm/voiceAgent/rne';
import type { CampaignCompliance, CampaignRneCheck } from '@/lib/services/crm/whatsapp/campaignRneService';

/** Figma 1402:1206: requisitos certificados por el servidor, también en el detalle. */
export function CampaignCompliancePanel({ campaignId, expectedUpdatedAt, onChanged, onAllowed, onUploadingChange, refreshKey, disabled }: {
  campaignId: string; expectedUpdatedAt?: string;
  refreshKey?: string | number; disabled?: boolean;
  onChanged?: (check: CampaignRneCheck) => void; onAllowed?: (allowed: boolean) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const t = useTranslations('crm.campanasCumplimiento');
  const r = useTranslations('vozRne');
  const { formatDateTime } = useFormatDate(null);
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<CampaignCompliance | null>(null);
  const [canVerify, setCanVerify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const url = `/api/crm/campaigns/${campaignId}/rne`;
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(null); setData(null); setCanVerify(false); onAllowed?.(false);
    try {
      const response = await fetchJson<{ data: CampaignCompliance; puede_verificar: boolean }>(url, { cache: 'no-store', signal: request.signal });
      if (!response?.data || ![response.data.allowed, response.data.rne_current, response.data.data_policy_valid].every(value => typeof value === 'boolean')) throw new Error('invalid');
      if (!request.signal.aborted) { setData(response.data); setCanVerify(response.puede_verificar === true); onAllowed?.(response.data.allowed); }
    } catch {
      if (!request.signal.aborted) setError(r('errorCargar'));
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, [url, onAllowed, r]);
  useEffect(() => {
    setUploading(false); void load();
    return () => { controller.current?.abort(); uploadController.current?.abort(); };
  }, [load, refreshKey]);
  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES_ARCHIVO_RNE) { setError(r('demasiadoGrande')); return; }
    setUploading(true); onUploadingChange?.(true); onAllowed?.(false);
    const request = new AbortController(); uploadController.current = request;
    try {
      const contenido = await file.text();
      const response = await fetchJson<{ data: CampaignRneCheck }>(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, timeoutMs: 60000,
        body: JSON.stringify({ nombre_archivo: file.name, contenido, expected_updated_at: expectedUpdatedAt }), signal: request.signal,
      });
      if (!response?.data?.id) throw new Error('invalid');
      if (!request.signal.aborted) { await onChanged?.(response.data); await load(); }
    } catch { if (!request.signal.aborted) setError(r('errorVerificar')); }
    finally { if (!request.signal.aborted) { setUploading(false); onUploadingChange?.(false); } if (fileInput.current) fileInput.current.value = ''; }
  };
  const check = data?.rne;
  return <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-xl border border-line bg-surface p-4">
    <div className="flex items-center justify-between gap-2">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold text-fg"><ShieldCheck className="size-4 text-brand" aria-hidden="true" />{t('titulo')}</h2>
      <button className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} disabled={loading || uploading || disabled} onClick={() => void load()} aria-label={t('actualizar')}><RefreshCw className="size-4" aria-hidden="true" /></button>
    </div>
    {loading ? <div role="status" aria-label={r('cargando')} className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-24" /></div> : data && <>
      <div className={`space-y-2 rounded-lg border p-3 ${data.rne_current ? 'border-line-success bg-success-subtle' : 'border-line-danger bg-danger-subtle'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-fg">{r('titulo')}</h3><StatusBadge estado={data.rne_current ? 'vigente' : 'pendiente'} etiqueta={r(data.rne_current ? 'estadoVigente' : 'estadoSin')} tono={data.rne_current ? 'exito' : 'peligro'} /></div>
        <p className="text-xs text-fg-secondary">{t('ayudaRne', { dias: VIGENCIA_RNE_DIAS })}</p>
        {check && <ListaDatos>
          <FilaDato etiqueta={r('verificada')} valor={formatDateTime(check.checked_at)} />
          <FilaDato etiqueta={r('validaHasta')} valor={formatDateTime(check.valid_until)} />
          <FilaDato etiqueta={r('numerosArchivo')} valor={String(check.numbers_in_file)} />
          <FilaDato etiqueta={r('objetivosRevisados')} valor={String(check.checked_targets)} />
          <FilaDato etiqueta={r('excluidos')} valor={String(check.excluded_targets)} />
          <FilaDato etiqueta={t('omitidos')} valor={String(check.skipped_contacts)} />
        </ListaDatos>}
        {canVerify ? <>
          <input id={id} ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label={t('archivo')} disabled={uploading || disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          <button className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={uploading || disabled} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}{r(uploading ? 'verificando' : 'verificar')}
          </button>
        </> : <p className="text-xs text-fg-secondary">{t('sinPermiso')}</p>}
      </div>
      <div className={`space-y-2 rounded-lg border p-3 ${data.data_policy_valid ? 'border-line-success bg-success-subtle' : 'border-line-danger bg-danger-subtle'}`}>
        <h3 className="text-sm font-medium text-fg">{t('politica')}</h3>
        <p className="text-xs text-fg-secondary">{t(data.data_policy_valid ? 'politicaLista' : 'politicaFalta')}</p>
        {data.data_policy_url?.startsWith('https://') && <a className="block break-all text-xs text-link hover:underline" href={data.data_policy_url} target="_blank" rel="noopener noreferrer">{t('verPolitica')}</a>}
        <Link className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} href="/app/configuracion?modulo=crm&tab=telefonia">{t('configurar')}</Link>
      </div>
      {!data.allowed && <p role="status" className="rounded-lg bg-warning-subtle p-3 text-xs text-warning-text">{t('bloqueada')}</p>}
    </>}
    {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
  </section>;
}
