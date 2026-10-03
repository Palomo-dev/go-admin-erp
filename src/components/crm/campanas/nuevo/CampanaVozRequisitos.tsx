'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck, CircleX, Upload } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { estadoConstanciaRne } from '@/components/crm/agentes/campanas/rnePanelLogica';
import { MAX_BYTES_ARCHIVO_RNE } from '@/lib/services/crm/voiceAgent/rne';

interface Constancia {
  checked_at: string; valid_until: string; numbers_in_file: number; checked_targets: number;
  excluded_targets: number; campaign_updated_at?: string; vigente?: boolean;
  evidence_available?: boolean; audience_unchanged?: boolean;
}

/** Reutiliza el contrato RNE de voz; comunica la versión del POST, nunca adopta una lectura posterior. */
export function CampanaVozRequisitos({ campaignId, expectedUpdatedAt, disabled, onVersion, onValid, onBusy }: {
  campaignId: string; expectedUpdatedAt: string; disabled?: boolean;
  onVersion: (version: string) => void; onValid: (valid: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('vozRne');
  const c = useTranslations('crm.campanasNuevo');
  const { formatDateTime } = useFormatDate(null);
  const [record, setRecord] = useState<Constancia | null>(null);
  const [loading, setLoading] = useState(true);
  const [canVerify, setCanVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const request = useRef(false);
  const callbacks = useRef({ onVersion, onValid, onBusy });
  callbacks.current = { onVersion, onValid, onBusy };
  useEffect(() => {
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError(null); setCanVerify(false); callbacks.current.onValid(false);
    void pedirCrm<Constancia | null>(`/api/crm/voice-agents/campaigns/${campaignId}/rne`, { signal: controller.signal })
      .then(({ data, extra }) => { if (!controller.signal.aborted) { setRecord(data); setCanVerify(extra.puede_verificar === true); callbacks.current.onValid(estadoConstanciaRne(data).vigente); } })
      .catch(() => { if (!controller.signal.aborted) setError(t('errorCargar')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); callbacks.current.onBusy(false); };
  }, [campaignId, expectedUpdatedAt, revision, t]);
  const upload = async (file: File) => {
    if (request.current || disabled || !canVerify) return;
    if (file.size > MAX_BYTES_ARCHIVO_RNE) { setError(t('demasiadoGrande')); return; }
    request.current = true; setBusy(true); setError(null); callbacks.current.onBusy(true); callbacks.current.onValid(false);
    const signal = abort.current?.signal;
    try {
      const contenido = await file.text();
      if (signal?.aborted) return;
      const { data } = await pedirCrm<Constancia>(`/api/crm/voice-agents/campaigns/${campaignId}/rne`, { method: 'POST', signal, cuerpo: { nombre_archivo: file.name, contenido, expected_updated_at: expectedUpdatedAt } });
      if (!data.campaign_updated_at) throw new Error('invalid_version');
      if (!signal?.aborted) { setRecord(data); callbacks.current.onVersion(data.campaign_updated_at); callbacks.current.onValid(estadoConstanciaRne(data).vigente); }
    } catch (e) { if (!signal?.aborted) setError(e instanceof ErrorApiCrm && e.codigo === 'campana_modificada' ? c('archivoConflicto') : t('errorVerificar')); }
    finally { request.current = false; if (!signal?.aborted) { setBusy(false); callbacks.current.onBusy(false); } if (input.current) input.current.value = ''; }
  };
  const valid = estadoConstanciaRne(record).vigente;
  const Icon = valid ? CircleCheck : CircleX;
  return <section className={`space-y-2 rounded-lg border p-3 ${valid ? 'border-line-success bg-success-subtle' : 'border-line-danger bg-danger-subtle'}`} aria-label={t('titulo')}>
    <h3 className={`flex items-center gap-2 text-sm font-medium ${valid ? 'text-success-text' : 'text-danger-text'}`}><Icon className="size-4" aria-hidden="true" strokeWidth={1.5} />{t('titulo')}</h3>
    {loading ? <Skeleton className="h-10" /> : <><p className="text-xs leading-4 text-fg-secondary">{valid && record ? `${t('validaHasta')}: ${formatDateTime(record.valid_until)} · ${t('excluidos')}: ${record.excluded_targets}` : t('ayuda', { dias: 30 })}</p>
      {canVerify && <><input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" aria-label={t('verificar')} className="sr-only" disabled={disabled || busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} /><button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={disabled || busy} onClick={() => input.current?.click()}><Upload className="size-4" aria-hidden="true" strokeWidth={1.5} />{t(busy ? 'verificando' : 'verificar')}</button></>}
    </>}
    {error && <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-xs text-danger-text">{error}</p>{!canVerify && !loading && <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setRevision(n => n + 1)}>{c('actualizar')}</button>}</div>}
  </section>;
}
