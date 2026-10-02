'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, FileText, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { SearchInput } from '@/components/kit/SearchInput';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { deleteTemplate, duplicateTemplate, listTemplates, restoreTemplates, updateTemplate } from '@/components/crm/email/emailApi';
import { TEMPLATE_KIND_LABELS } from '@/components/crm/email/TemplatePicker';
import type { TemplateKind, TemplateSummary } from '@/lib/services/crm/email/types';
import { useTemplateText } from './useTemplateText';

const kinds: TemplateKind[] = ['transactional', 'marketing', 'sequence', 'onboarding'];
export function TemplateList() {
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
  const columns: ColumnaTabla<TemplateSummary>[] = [
    { id: 'name', encabezado: tr('Nombre'), celda: row => <div><span className="font-medium text-fg">{row.name}</span> {row.metadata?.is_system && <Badge variant="outline">{tr('Base')}</Badge>}<p className="text-xs text-fg-muted">v{row.version}</p></div> },
    { id: 'kind', encabezado: tr('Tipo'), celda: row => tr(TEMPLATE_KIND_LABELS[(row.kind ?? 'transactional') as TemplateKind] ?? row.kind) },
    { id: 'subject', encabezado: tr('Asunto'), ocultarDebajo: 'md', celda: row => <span className="block max-w-64 truncate text-fg-secondary">{row.subject}</span> },
    { id: 'engine', encabezado: tr('Editor'), ocultarDebajo: 'lg', celda: row => row.engine === 'html' ? 'HTML' : tr('Bloques') },
    { id: 'uses', encabezado: tr('Usos'), variante: 'importe', ocultarDebajo: 'lg', celda: row => row.metadata?.usage_count ?? '—' },
    { id: 'active', encabezado: tr('Activa'), celda: row => <Switch checked={row.is_active} disabled={!allowed || busy} onCheckedChange={active => toggle(row, active)} aria-label={tr('Activar {p0}', { p0: row.name })} /> },
    { id: 'updated', encabezado: tr('Actualizada'), ocultarDebajo: 'md', celda: row => formatDate(row.updated_at) },
  ];
  const visible = scope === orgId ? rows : [];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput value={q} onChange={setQ} placeholder={tr('Buscar plantillas…')} etiqueta={tr('Buscar plantillas…')} className="min-w-48 flex-1" />
      <Select value={kind} onValueChange={value => { setKind(value as 'all' | TemplateKind); setPage(1); }}><SelectTrigger className="w-48" aria-label={tr('Tipo')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{tr('Todos los tipos')}</SelectItem>{kinds.map(value => <SelectItem key={value} value={value}>{tr(TEMPLATE_KIND_LABELS[value])}</SelectItem>)}</SelectContent></Select>
      {allowed && <><Button variant="outline" onClick={restore} disabled={busy}><RotateCcw className="mr-1 size-4" strokeWidth={1.5} aria-hidden="true" />{tr('Restaurar plantillas base')}</Button><Button onClick={() => router.push('/app/crm/plantillas/nueva')} disabled={busy}><Plus className="mr-1 size-4" strokeWidth={1.5} aria-hidden="true" />{tr('Nueva plantilla')}</Button></>}
    </div>
    {!canManage && !loading && !error && <p className="text-xs text-fg-muted">{tr('Sólo lectura')}</p>}
    <DataTable columnas={columns} filas={visible} obtenerId={row => row.id} etiqueta={tr('Plantillas')} etiquetaFila={row => row.name}
      estado={loading ? 'cargando' : error ? 'error' : !visible.length ? (search || kind !== 'all' ? 'sinResultados' : 'vacio') : 'listo'}
      vacio={{ titulo: tr('Aún no hay plantillas.'), icono: FileText }} error={{ titulo: tr('No se pudieron cargar las plantillas.'), descripcion: error ?? '' }}
      onReintentar={() => void load()} onFilaClick={row => router.push(`/app/crm/plantillas/${row.id}`)}
      acciones={row => [{ id: 'view', etiqueta: tr(allowed ? 'Editar' : 'Ver'), icono: allowed ? Pencil : Eye, onSelect: () => router.push(`/app/crm/plantillas/${row.id}`) },
        ...(allowed ? [{ id: 'duplicate', etiqueta: tr('Duplicar'), icono: Copy, deshabilitada: busy, onSelect: () => duplicate(row) }, { id: 'delete', etiqueta: tr('Eliminar'), icono: Trash2, destructiva: true, deshabilitada: busy || !!row.metadata?.is_system, onSelect: () => setPendingDelete(row) }] : [])]}
      pie={<div className="flex items-center justify-between p-3 text-sm text-fg-secondary"><span>{tr('{p0} plantillas', { p0: total })}</span><div className="flex gap-2"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{tr('Anterior')}</Button><Button variant="outline" disabled={loading || page * 50 >= total} onClick={() => setPage(value => value + 1)}>{tr('Siguiente')}</Button></div></div>} />
    <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open && !busy) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{tr('¿Eliminar esta plantilla?')}</AlertDialogTitle><AlertDialogDescription>{tr('La plantilla dejará de estar disponible para nuevos mensajes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setPendingDelete(null)}>{tr('Cancelar')}</Button><Button variant="destructive" disabled={busy || !allowed} onClick={() => void remove()}>{tr('Eliminar')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
