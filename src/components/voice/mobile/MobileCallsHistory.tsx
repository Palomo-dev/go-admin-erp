'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Check, PhoneIncoming, PhoneMissed, PhoneOutgoing, Plus, RefreshCw, Voicemail, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useSession } from '@/lib/context/SessionContext';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';
import { getMobileStorage, removeMobileStorage, setMobileStorage } from '@/lib/utils/mobileStorage';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { leerLlamadas } from '../useCallsData';
import { formatDuration } from '../callsListadoLogica';
import { abrirMarcador } from '../softphoneUi';
import { decodeMobileHistory, encodeMobileHistory, mobileHistoryKey, mobileHistoryRow, type MobileHistoryRow, type MobileHistoryScope } from './mobileHistoryCache';
const FILTERS = ['all', 'missed', 'outgoing', 'incoming', 'ai'] as const;
type Filter = (typeof FILTERS)[number];
function matches(row: MobileHistoryRow, filter: Filter) { return filter === 'all' || (filter === 'missed' ? row.direction === 'inbound' && ['no_answer', 'failed'].includes(row.status) : filter === 'outgoing' ? row.direction === 'outbound' : filter === 'incoming' ? row.direction === 'inbound' : row.mode === 'ai_agent'); }

/** Historial móvil del lector canónico. La caché sólo se muestra con sesión vigente y el mismo ámbito. */
export function MobileCallsHistory({ revision = 0, onOpen }: { revision?: number; onOpen: (id: string) => void }) {
  const t = useTranslations('phoneVisual'); const common = useTranslations('common'); const tc = useTranslations('crm.llamadas');
  const { organization } = useOrganization(); const organizationId = organization?.id ?? null; const { session } = useSession(); const branch = useBranchOpcional();
  const { timezone } = useOrgTimezone(); const dates = useFormatDate(null);
  const branchIds = branch?.branches.map(item => item.id).filter((id): id is number => typeof id === 'number').sort((a,b) => a-b).join(',') ?? '';
  const scope: MobileHistoryScope | null = organizationId && session?.user.id ? { organizationId, userId: session.user.id, branch: `${branch?.branchFilter ?? 'all'}:${branchIds}` } : null;
  const scopeKey = scope ? mobileHistoryKey(scope) : ''; const currentKey = useRef(scopeKey); currentKey.current = scopeKey;
  const lastKey = useRef('');
  const [data, setData] = useState<{ key: string; rows: MobileHistoryRow[]; loading: boolean; offline: boolean; forbidden: boolean }>({ key: '', rows: [], loading: true, offline: false, forbidden: false });
  const [attempt, setAttempt] = useState(0); const [filter, setFilter] = useState<Filter>('all');
  const retry = () => setAttempt(value => value + 1);
  useCabeceraMovil({ modo: 'page', titulo: t('history'), subtitulo: '', ocultarBarra: false, accion: <Button variant="ghost" size="icon" className="size-10 text-fg-secondary" aria-label={t('openPhone')} onClick={abrirMarcador}><Plus size={20} strokeWidth={1.5} /></Button> });
  useEffect(() => {
    if (lastKey.current && lastKey.current !== scopeKey) void removeMobileStorage(lastKey.current).catch(() => undefined);
    lastKey.current = scopeKey;
    const controller = new AbortController();
    setData({ key: scopeKey, rows: [], loading: true, offline: false, forbidden: false });
    if (!scope || !session?.expires_at || session.expires_at * 1000 <= Date.now()) { if (scopeKey) void removeMobileStorage(scopeKey).catch(() => undefined); setData({ key: scopeKey, rows: [], loading: false, offline: false, forbidden: true }); return; }
    const capturedScope = scope; const expires = session.expires_at;
    const expire = () => { controller.abort(); void removeMobileStorage(scopeKey).catch(() => undefined); if (currentKey.current === scopeKey) setData({ key: scopeKey, rows: [], loading: false, offline: false, forbidden: true }); };
    const expiryTimer = setTimeout(expire, Math.min(2_147_483_647, Math.max(0, expires * 1000 - Date.now())));
    void leerLlamadas('limit=20&offset=0', controller.signal).then(async result => {
      if (controller.signal.aborted || currentKey.current !== scopeKey) return;
      if (expires * 1000 <= Date.now()) { expire(); return; }
      const rows = result.data.slice(0, 20).map(mobileHistoryRow);
      setData({ key: scopeKey, rows, loading: false, offline: false, forbidden: false });
      try { await setMobileStorage(scopeKey, encodeMobileHistory(capturedScope, rows)); } catch { /* sin persistencia: el historial en línea sigue disponible */ }
      if (currentKey.current !== scopeKey || expires * 1000 <= Date.now()) void removeMobileStorage(scopeKey).catch(() => undefined);
    }).catch(async error => {
      if (controller.signal.aborted || currentKey.current !== scopeKey) return;
      if (expires * 1000 <= Date.now()) { expire(); return; }
      const forbidden = error instanceof ErrorApiCrm && [401, 403].includes(error.status);
      let cached: MobileHistoryRow[] | null = null;
      if (forbidden) await removeMobileStorage(scopeKey).catch(() => undefined);
      else { try { cached = decodeMobileHistory(await getMobileStorage(scopeKey), capturedScope, expires); } catch { /* caché ausente */ } }
      if (controller.signal.aborted || currentKey.current !== scopeKey) return;
      setData({ key: scopeKey, rows: cached ?? [], loading: false, offline: !forbidden, forbidden });
    });
    const online = () => retry(); window.addEventListener('online', online);
    return () => { controller.abort(); clearTimeout(expiryTimer); window.removeEventListener('online', online); };
    // El ámbito completo y la expiración son primitivas; ninguna respuesta tardía cambia de usuario/sucursal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, session?.expires_at, attempt, revision]);
  const current = data.key === scopeKey ? data : { key: scopeKey, rows: [], loading: true, offline: false, forbidden: false };
  const rows = current.rows.filter(row => matches(row, filter)); const groups = new Map<string, MobileHistoryRow[]>();
  for (const row of rows) { const day = toPlainDate(new Date(row.startedAt), timezone); const group = groups.get(day) ?? []; group.push(row); groups.set(day, group); }
  const today = dates.getToday(), yesterday = addPlainDays(today, -1);
  return <section className="min-w-0 space-y-3 bg-canvas p-4" aria-label={t('history')}>
    <div className="flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label={t('history')}>{FILTERS.map(value => <button key={value} type="button" aria-pressed={filter === value} className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium leading-4 ${filter === value ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary'}`} onClick={() => setFilter(value)}>{filter === value && <Check size={14} strokeWidth={1.5} />}{t(value)}</button>)}</div>
    {current.loading ? <div className="space-y-6 py-1" role="status" aria-label={common('loading')}>{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex h-12 items-center gap-4 px-3"><Skeleton className="size-4 shrink-0 rounded" /><Skeleton className="size-10 shrink-0 rounded-md" /><Skeleton className="h-3 w-20 shrink-0 rounded" /><Skeleton className="h-3 flex-1 rounded" /></div>)}</div>
      : current.forbidden ? <EmptyState variante="forbidden" icono={PhoneMissed} titulo={t('forbidden')} descripcion="" />
        : <>
          {current.offline && <p role="status" className="flex gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-xs font-medium leading-4 text-warning-text"><WifiOff size={16} className="shrink-0" strokeWidth={1.5} />{t('offline')}</p>}
          {rows.length ? <div className={`overflow-hidden rounded-xl border border-line bg-surface ${current.offline ? 'opacity-60' : ''}`}>{Array.from(groups, ([day, list]) => <div key={day}>{!current.offline && <p className="bg-subtle/50 px-3 py-2 text-xs font-semibold leading-4 text-fg-secondary">{day === today ? t('today') : day === yesterday ? t('yesterday') : dates.formatPlain(day)}</p>}{list.map(row => {
            const missed = row.direction === 'inbound' && ['no_answer', 'failed'].includes(row.status); const Icon = missed ? PhoneMissed : row.mode === 'ai_agent' ? Bot : row.status === 'voicemail' ? Voicemail : row.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
            const key = row.outcome ? `resultados.${row.outcome}` : `estados.${row.status}`; const outcome = tc.has(key) ? tc(key) : row.outcome ?? row.status;
            return <button key={row.id} type="button" disabled={current.offline} className="flex min-h-[62px] w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left last:border-0 enabled:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" onClick={() => onOpen(row.id)}><span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${missed ? 'bg-danger-subtle text-danger' : row.direction === 'inbound' ? 'bg-success-subtle text-success' : 'bg-brand-tint text-brand'}`}><Icon size={16} strokeWidth={1.5} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium leading-5 text-fg">{row.name ?? row.number}</p><p className="mt-0.5 truncate text-xs font-medium leading-4 text-fg-secondary">{row.mode === 'ai_agent' ? tc('modos.ai_agent') : tc(`direcciones.${row.direction}`)} · {row.duration ? `${formatDuration(row.duration)} · ` : ''}{outcome}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><time className="text-xs font-medium leading-4 text-fg-muted">{dates.formatTime(row.startedAt)}</time>{!current.offline && <Badge tono={missed ? 'peligro' : row.outcome === 'answered' ? 'exito' : row.outcome === 'callback_requested' ? 'marca' : 'neutro'} tamano="sm">{outcome}</Badge>}</div></button>;
          })}</div>)}</div> : <div className="py-6"><EmptyState icono={PhoneMissed} titulo={t(filter === 'missed' ? 'emptyMissed' : 'empty')} descripcion={t(filter === 'missed' ? 'emptyMissedHint' : 'emptyHint')} /></div>}
          {current.offline && <Button variant="outline" className="h-10 w-full border-line-strong text-sm" onClick={retry}><RefreshCw size={16} strokeWidth={1.5} className="mr-2" />{t('retry')}</Button>}
        </>}
  </section>;
}
