'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft, Phone, X } from 'lucide-react';
import { SegmentedControl, SearchInput, EmptyState } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJson } from '@/lib/utils/fetchJson';
import type { PhoneControlState, PhoneControlResult, PhoneTransferMode, PhoneTransferTarget } from '@/lib/services/crm/phoneConferenceTypes';

interface Teammate { id: string; name: string; available: boolean; busy: boolean; mode: 'browser' | 'mobile' }
export interface TransferPanelProps {
  state: PhoneControlState; onTransfer(target: PhoneTransferTarget, mode: PhoneTransferMode): Promise<PhoneControlResult>;
  onConfirm(): Promise<PhoneControlResult>; onCancel(): Promise<PhoneControlResult>; onClose(): void;
}
/** Mismo panel para dock y espejo. Las acciones siempre llegan al controlador. */
export function TransferPanel({ state, onTransfer, onConfirm, onCancel, onClose }: TransferPanelProps) {
  const t = useTranslations('phoneControl'); const searchRef = useRef<HTMLInputElement>(null); const running = useRef(false);
  const [query, setQuery] = useState(''); const [mode, setMode] = useState<PhoneTransferMode>('direct');
  const [team, setTeam] = useState<Teammate[]>([]); const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const locked = pending || state.busy; const activeTransfer = Boolean(state.transfer && !['failed', 'confirmed'].includes(state.transfer.status));
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController(); let alive = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const result = await fetchJson<{ data: Teammate[] }>('/api/voice/team', { signal: controller.signal, timeoutMs: 10000 });
        if (!alive) return;
        if (!Array.isArray(result.data) || result.data.some(member => !member || typeof member.id !== 'string' || typeof member.name !== 'string' || typeof member.available !== 'boolean' || typeof member.busy !== 'boolean' || !['mobile', 'browser'].includes(member.mode))) throw new Error('equipo_invalido');
        setTeam(result.data); setLoadError(false); setLoading(false); timer = setTimeout(read, 5000);
      } catch { if (alive) { setLoadError(true); setLoading(false); } }
    };
    void read(); return () => { alive = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [attempt]);
  const visible = team.filter(member => member.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const external = /^\+[1-9][0-9]{6,14}$/.test(query.trim());
  const teammate = team.find(member => member.id === selected && member.available && !member.busy);
  const target: PhoneTransferTarget | null = external ? { number: query.trim() } : teammate ? { userId: teammate.id } : null;
  const run = async (action: () => Promise<PhoneControlResult>) => {
    if (running.current || state.busy) return;
    running.current = true; setPending(true); setError(null);
    try { const result = await action(); if (!result.ok) setError(result.message); }
    catch { setError(t('failed')); }
    finally { running.current = false; setPending(false); }
  };
  return <section className="space-y-3 rounded-xl border border-line bg-surface p-3" aria-label={t('transferTitle')}>
    <div className="flex items-center gap-2"><ArrowRightLeft size={16} strokeWidth={1.5} className="text-brand" /><h3 className="flex-1 text-sm font-semibold">{t('transferTitle')}</h3>
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={locked || activeTransfer} aria-label={t('close')} onClick={onClose}><X size={16} /></Button></div>
    {error && <p role="alert" className="rounded-lg bg-danger-subtle p-2 text-xs text-danger-text">{error}</p>}
    {activeTransfer ? <>
      <p className="text-sm" role="status">{t(`transferStatus.${state.transfer!.status}`, { name: state.transfer!.toName })}</p>
      {state.transfer!.mode === 'consult' && <Button className="w-full" disabled={locked || state.transfer!.status !== 'connected'} onClick={() => { void run(onConfirm); }}>{t('confirm')}</Button>}
      <Button variant="outline" className="w-full" disabled={locked} onClick={() => { void run(onCancel); }}>{t('cancelTransfer')}</Button>
    </> : <>
      <SegmentedControl valor={mode} onValorChange={setMode} etiqueta={t('transferMode')} anchoCompleto deshabilitado={locked}
        opciones={[{ valor: 'direct', etiqueta: t('direct') }, { valor: 'consult', etiqueta: t('consult') }]} />
      <p className="text-xs text-fg-secondary">{t(mode === 'direct' ? 'directHint' : 'consultHint')}</p>
      <fieldset disabled={locked}><SearchInput ref={searchRef} value={query} onChange={value => { setQuery(value); setSelected(null); }} onValueChange={value => { setQuery(value); setSelected(null); }}
        etiqueta={t('search')} placeholder={t('search')} atajo={false} pistaAtajo={false} debounceMs={0} /></fieldset>
      {external ? <div className="flex items-center gap-2 rounded-lg border border-brand bg-brand-tint p-3 text-sm"><Phone size={16} /><span className="font-mono">{query.trim()}</span></div>
        : loading ? <div role="status" aria-label={t('loading')}><Skeleton className="h-14 w-full" /></div>
          : loadError ? <EmptyState variante="error" compacto titulo={t('teamFailed')} onReintentar={() => { setLoading(true); setAttempt(previous => previous + 1); }} />
            : visible.length === 0 ? <EmptyState variante="search" compacto titulo={t('noMatches')} descripcion={t('externalHint')} onLimpiarFiltros={() => setQuery('')} />
              : <div className="max-h-52 space-y-1 overflow-y-auto" role="group" aria-label={t('team')}>
                {visible.map(member => <button key={member.id} type="button" disabled={locked || !member.available || member.busy} aria-pressed={member.id === selected}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${member.id === selected ? 'border-brand bg-brand-tint' : 'border-transparent hover:bg-hover'}`}
                  onClick={() => setSelected(member.id)}><Avatar className="h-8 w-8"><AvatarFallback className="bg-brand-tint text-xs text-brand">{member.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{member.name}</span><span className="block text-xs text-fg-secondary">{t(member.busy ? 'busy' : member.available ? 'available' : 'unavailable')}</span></span>
                </button>)}
              </div>}
      <Button disabled={locked || !target || !state.supported} className="w-full" onClick={() => { if (target) void run(() => onTransfer(target, mode)); }}><ArrowRightLeft size={16} className="mr-2" />{t(mode === 'direct' ? 'transfer' : 'startConsult')}</Button>
    </>}
  </section>;
}
