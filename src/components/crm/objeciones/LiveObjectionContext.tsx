'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Phone, Copy } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { useSoftphone } from '@/components/voice';
import { CallLinkPanel } from '@/components/voice/CallLinkPanel';
import type { Objection } from '@/lib/services/crm/objectionService';
import { pedirCrm } from '../acciones/apiCrm';
export function LiveObjectionContext({ objections }: { objections: Objection[] }) {
  const sp = useSoftphone(),
    t = useTranslations('crm.objecionesNuevo');
  const active = sp.available && sp.callStatus === 'connected' ? sp.activeCall : null,
    callId = sp.available ? sp.activeCallId : null;
  const callSid = active?.callSid,
    connected = !!active;
  const [now, setNow] = useState(Date.now()),
    [linked, setLinked] = useState<string | null>(null),
    [selected, setSelected] = useState(''),
    [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  useEffect(() => {
    setLinked(null);
    setState('idle');
    setSelected('');
    if (!connected) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callSid, connected]);
  const reloadLink = async () => {
    if (!callId) return;
    try {
      const row = await pedirCrm<{ opportunity_id: string | null }>(`/api/crm/calls/${callId}`);
      setLinked(row.data.opportunity_id);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  if (!active) return null;
  const elapsed = Math.max(0, Math.floor((now - (active.connectedAt ?? now)) / 1000)),
    opportunity = linked ?? active.opportunityId,
    row = objections.find((row) => row.id === selected);
  const register = async () => {
    if (!opportunity || !row) return;
    setState('saving');
    try {
      await pedirCrm(`/api/crm/objections/opportunity/${opportunity}`, {
        method: 'POST',
        cuerpo: { objection_id: row.id },
      });
      setState('done');
    } catch {
      setState('error');
    }
  };
  const copy = async () => {
    if (!row?.recommended_response) return;
    try {
      await navigator.clipboard.writeText(row.recommended_response);
    } catch {
      setState('error');
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-line-brand bg-brand-tint p-4">
      <p className="flex items-center gap-2 text-sm text-brand-deep">
        <Phone className="size-4" />
        {t('inCall', {
          name: active.displayName ?? active.number,
          time: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
        })}
      </p>
      <label className="block text-xs font-medium text-fg" htmlFor="live-objection">
        {t('quickConsult')}
      </label>
      <select
        id="live-objection"
        className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg"
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
          setState('idle');
        }}
      >
        <option value="">{t('chooseObjection')}</option>
        {objections
          .filter((row) => row.is_active)
          .map((row) => (
            <option key={row.id} value={row.id}>
              {row.title}
            </option>
          ))}
      </select>
      {row && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="font-medium text-fg">{row.title}</p>
          <p className="mt-2 text-sm text-fg-secondary">
            {row.recommended_response ?? t('noResponse')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={clasesBoton({ variante: 'secundario' })}
              disabled={!row.recommended_response}
              onClick={() => void copy()}
            >
              <Copy className="size-4" />
              {t('copy')}
            </button>
            <button
              className={clasesBoton({ variante: 'primario' })}
              disabled={!opportunity || state === 'saving' || state === 'done'}
              onClick={() => void register()}
            >
              {t(state === 'done' ? 'registered' : 'register')}
            </button>
          </div>
        </div>
      )}
      {!opportunity && (
        <>
          <p className="text-xs text-fg-secondary">{t('linkOpportunity')}</p>
          {callId && (
            <CallLinkPanel
              callId={callId}
              customerId={active.customerId}
              opportunityId={null}
              phoneNumber={active.number}
              customerName={active.displayName}
              onLinked={() => void reloadLink()}
            />
          )}
        </>
      )}
      {state === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {t('actionError')}
        </p>
      )}
    </section>
  );
}
