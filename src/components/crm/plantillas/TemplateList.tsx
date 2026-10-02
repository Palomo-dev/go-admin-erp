'use client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, FileText, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { KbdButton as Button } from '@/components/kit/KbdButton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tarjeta, EmptyState, StatusBadge } from '@/components/kit';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/kit/SearchInput';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { deleteTemplate, duplicateTemplate, listTemplates, restoreTemplates, updateTemplate } from '@/components/crm/email/emailApi';
import { TEMPLATE_KIND_LABELS } from '@/components/crm/email/TemplatePicker';
import type { TemplateKind, TemplateSummary } from '@/lib/services/crm/email/types';
import { useTemplateText } from './useTemplateText';

const kinds: TemplateKind[] = ['transactional', 'marketing', 'sequence', 'onboarding'];
export function TemplateList({ actionsHost, toolbarHost }: { actionsHost?: HTMLElement | null; toolbarHost?: HTMLElement | null } = {}) {
  const router = useRouter(); const tr = useTemplateText(); const { organization } = useOrganization(); const orgId = organization?.id ?? null; const { formatDate } = useFormatDate();
  const currentOrg = useRef(orgId); currentOrg.current = orgId;
  const revision = useRef(0); const pending = useRef(false);
  const [rows, setRows] = useState<TemplateSummary[]>([]); const [scope, setScope] = useState<number | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false); const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [kind, setKind] = useState<'all' | TemplateKind>('all');
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [pendingDelete, setPendingDelete] = useState<TemplateSummary | null>(null);
  const allowed = canManage && scope === orgId && !loading && !error;
  useEffect(() => { const timer = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [q]);
  const load = useCallback(async () => {
    const ticket = ++revision.current; setLoading(true); setError(null); setCanManage(false);
    if (!orgId) { setRows([]); setScope(null); setLoading(false); return; }
    try {
      const r = await listTemplates({ channel: 'email', pageSize: 50, page, q: search || undefined, kind: kind === 'all' ? undefined : kind });
      if (ticket !== revision.current || currentOrg.current !== orgId) return;
      setRows(r.data); setTotal(r.total); setScope(orgId); setCanManage(r.can_manage === true);
    } catch (e) { if (ticket === revision.current && currentOrg.current === orgId) setError(e instanceof Error ? e.message : tr('No se pudieron cargar las plantillas.')); }
    finally { if (ticket === revision.current && currentOrg.current === orgId) setLoading(false); }
  }, [orgId, page, search, kind, tr]);
  useEffect(() => { const epoch = revision; void load(); return () => { epoch.current++; }; }, [load]);
  useEffect(() => { setRows([]); setScope(null); setPendingDelete(null); setQ(''); setPage(1); setTotal(0); }, [orgId]);
  const mutate = async (fn: () => Promise<void>) => {
    if (!allowed || pending.current) return false;
    pending.current = true; setBusy(true);
    try { await fn(); return true; }
    catch (e) { toast({ title: tr('No se pudo actualizar la plantilla.'), description: e instanceof Error ? e.message : tr('Error'), variant: 'destructive' }); return false; }
    finally { pending.current = false; setBusy(false); }
  };
  const duplicate = (row: TemplateSummary) => void mutate(async () => {
    const r = await duplicateTemplate(row.id);
    if (currentOrg.current === orgId) router.push(`/app/crm/plantillas/${r.data.id}`);
  });
  const toggle = (row: TemplateSummary, active: boolean) => void mutate(async () => {
    const r = await updateTemplate(row.id, { is_active: active, expected_version: row.version });
    if (currentOrg.current === orgId) setRows(old => old.map(item => item.id === row.id ? { ...item, ...r.data } : item));
  });
  const remove = async () => {
    if (!pendingDelete) return;
    const row = pendingDelete;
    await mutate(async () => {
      const r = await deleteTemplate(row.id);
      if (currentOrg.current !== orgId) return;
      toast({ title: tr(r.data.deleted ? 'Plantilla eliminada.' : 'Plantilla desactivada.') });
      setPendingDelete(null); await load();
    });
  };
  const restore = () => void mutate(async () => { await restoreTemplates(); if (currentOrg.current === orgId) { toast({ title: tr('Plantillas base restauradas.') }); await load(); } });
  const visible = scope === orgId ? rows : [];
  const actions = allowed && <><Button patron="button" variante="secundario" onClick={restore} disabled={busy} icono={RotateCcw}>{tr('Restaurar plantillas base')}</Button><Button patron="button" onClick={() => router.push('/app/crm/plantillas/nueva')} disabled={busy} icono={Plus}>{tr('Nueva plantilla')}</Button></>;
  const toolbar = <><SearchInput value={q} onChange={setQ} placeholder={tr('Buscar plantillas…')} etiqueta={tr('Buscar plantillas…')} className="min-w-48 max-w-sm flex-1" />
    <Select value={kind} onValueChange={value => { setKind(value as 'all' | TemplateKind); setPage(1); }}><SelectTrigger className="h-10 w-44 rounded-lg border-line-strong bg-surface text-fg" aria-label={tr('Tipo')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{tr('Todos los tipos')}</SelectItem>{kinds.map(value => <SelectItem key={value} value={value}>{tr(TEMPLATE_KIND_LABELS[value])}</SelectItem>)}</SelectContent></Select></>;
  return <div className="space-y-4">
    {actionsHost ? createPortal(actions, actionsHost) : <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
    {toolbarHost ? createPortal(toolbar, toolbarHost) : <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
    {!canManage && !loading && !error && <p className="text-xs text-fg-muted">{tr('Sólo lectura')}</p>}
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}</div>
      : error ? <EmptyState variante="error" titulo={tr('No se pudieron cargar las plantillas.')} descripcion={error} onReintentar={() => void load()} />
      : !visible.length ? <EmptyState variante={search || kind !== 'all' ? 'search' : undefined} titulo={tr('Aún no hay plantillas.')} icono={FileText} />
      : <ul aria-label={tr('Plantillas')} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(row => <li key={row.id}>
        <Tarjeta titulo={row.name} icono={FileText} descripcion={tr(TEMPLATE_KIND_LABELS[(row.kind ?? 'transactional') as TemplateKind] ?? row.kind)}
          accion={<RowActionsMenu titulo={row.name} acciones={[
            { id: 'view', etiqueta: tr(allowed ? 'Editar' : 'Ver'), icono: allowed ? Pencil : Eye, onSelect: () => router.push(`/app/crm/plantillas/${row.id}`) },
            ...(allowed ? [{ id: 'duplicate', etiqueta: tr('Duplicar'), icono: Copy, deshabilitada: busy, onSelect: () => duplicate(row) }, { id: 'delete', etiqueta: tr('Eliminar'), icono: Trash2, destructiva: true, deshabilitada: busy || !!row.metadata?.is_system, onSelect: () => setPendingDelete(row) }] : []),
          ]} />}
          pie={<div className="flex items-center justify-between gap-2 text-xs text-fg-secondary"><span>{tr('Usos')}: {row.metadata?.usage_count ?? '—'} · v{row.version}</span><Switch checked={row.is_active} disabled={!allowed || busy} onCheckedChange={active => toggle(row, active)} aria-label={tr('Activar {p0}', { p0: row.name })} /></div>}>
          <div className="space-y-3"><StatusBadge estado={row.is_active ? 'active' : 'inactive'} etiqueta={tr(row.is_active ? 'Activa' : 'Inactiva')} tono={row.is_active ? 'exito' : 'neutro'} />
            <button type="button" onClick={() => router.push(`/app/crm/plantillas/${row.id}`)} className="block min-h-24 w-full rounded-lg bg-subtle p-3 text-left text-[13px] leading-[18px] text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="font-medium text-fg">{row.subject}</span>{row.description && <span className="mt-2 line-clamp-3 block">{row.description}</span>}</button>
            {row.variables?.length ? <p className="truncate text-xs text-fg-muted">{row.variables.join(' · ')}</p> : null}
            <p className="text-xs text-fg-muted">{formatDate(row.updated_at)}{row.metadata?.is_system ? ` · ${tr('Base')}` : ''}</p>
          </div>
        </Tarjeta>
      </li>)}</ul>}
    {!error && <div className="flex items-center justify-between gap-2 text-[13px] text-fg-secondary"><span>{tr('{p0} plantillas', { p0: total })}</span><div className="flex gap-2"><Button patron="button" variante="secundario" tamano="sm" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{tr('Anterior')}</Button><Button patron="button" variante="secundario" tamano="sm" disabled={loading || page * 50 >= total} onClick={() => setPage(value => value + 1)}>{tr('Siguiente')}</Button></div></div>}
    <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open && !busy) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{tr('¿Eliminar esta plantilla?')}</AlertDialogTitle><AlertDialogDescription>{tr('La plantilla dejará de estar disponible para nuevos mensajes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button patron="button" variante="secundario" disabled={busy} onClick={() => setPendingDelete(null)}>{tr('Cancelar')}</Button><Button patron="button" variante="destructivo" disabled={busy || !allowed} onClick={() => void remove()}>{tr('Eliminar')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
