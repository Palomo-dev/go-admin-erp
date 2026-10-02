'use client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, MessageCircle, Pencil, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tarjeta, EmptyState, StatusBadge } from '@/components/kit';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/kit/SearchInput';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useTemplateText } from '@/components/crm/plantillas/useTemplateText';
import { waApi, ApiError, type ChannelSummary, type WhatsAppTemplate } from './api';
import { HsmEditorDialog } from './HsmEditorDialog';
const statuses: Record<string, string> = { APPROVED: 'Aprobada', PENDING: 'En revisión', REJECTED: 'Rechazada', PAUSED: 'Pausada', DISABLED: 'Deshabilitada', IN_APPEAL: 'En apelación', DRAFT: 'Borrador' };
export function WhatsAppTemplatesTab({ canEdit, actionsHost, toolbarHost }: { canEdit?: boolean; actionsHost?: HTMLElement | null; toolbarHost?: HTMLElement | null }) {
  const tr = useTemplateText(); const { organization } = useOrganization(); const orgId = organization?.id ?? null;
  const currentOrg = useRef(orgId); currentOrg.current = orgId; const revision = useRef(0); const pending = useRef(false);
  const [scope, setScope] = useState<number | null>(null); const [canManage, setCanManage] = useState(false); const [canManageChannels, setCanManageChannels] = useState(false);
  const [items, setItems] = useState<WhatsAppTemplate[]>([]); const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [q, setQ] = useState(''); const [editing, setEditing] = useState<{ template: WhatsAppTemplate | null; clone: boolean } | null>(null);
  const [deleting, setDeleting] = useState<WhatsAppTemplate | null>(null);
  const allowed = canManage && canEdit !== false && scope === orgId && !loading && !error;
  const load = useCallback(async () => {
    const ticket = ++revision.current; setLoading(true); setError(null); setSyncFailed(false);
    if (!orgId) { setLoading(false); setCanManage(false); return; }
    try {
      const [templates, channel] = await Promise.all([waApi.templates({ status: 'ALL', includeInactive: true }), waApi.channels()]);
      if (ticket !== revision.current || currentOrg.current !== orgId) return;
      setItems(templates.data); setChannels(channel.data); setCanManage(templates.can_manage === true); setCanManageChannels(channel.can_manage === true); setScope(orgId);
    } catch (e) { if (ticket === revision.current && currentOrg.current === orgId) { setError(e); setCanManage(false); } }
    finally { if (ticket === revision.current && currentOrg.current === orgId) setLoading(false); }
  }, [orgId]);
  useEffect(() => { const epoch = revision; setItems([]); setChannels([]); setScope(null); setCanManage(false); setCanManageChannels(false); setEditing(null); setDeleting(null); void load(); return () => { epoch.current++; }; }, [load]);
  const mutate = async (action: () => Promise<void>, captureSyncError = false) => {
    const canRetrySync = captureSyncError && canManage && canEdit !== false && scope === orgId && !loading;
    if ((!allowed && !canRetrySync) || pending.current) return;
    pending.current = true; setBusy(true);
    try { await action(); }
    catch (e) { if (captureSyncError && currentOrg.current === orgId) { setError(e); setSyncFailed(true); } toast({ title: tr('No se pudo actualizar la plantilla.'), description: e instanceof Error ? e.message : tr('Error'), variant: 'destructive' }); }
    finally { pending.current = false; setBusy(false); }
  };
  const sync = () => void mutate(async () => { await waApi.syncTemplates(); if (currentOrg.current === orgId) { toast({ title: tr('Plantillas sincronizadas.') }); await load(); } }, true);
  const submit = (template: WhatsAppTemplate) => void mutate(async () => {
    if (template.meta.status !== 'DRAFT') return;
    await waApi.submitTemplate(template.id, template.meta.channel_id ?? null);
    if (currentOrg.current === orgId) { toast({ title: tr('Plantilla enviada a aprobación.') }); await load(); }
  });
  const remove = () => void mutate(async () => {
    if (!deleting || deleting.meta.status !== 'DRAFT') return;
    await waApi.deleteTemplate(deleting.id); if (currentOrg.current === orgId) { setDeleting(null); await load(); }
  });
  const visible = scope === orgId ? items.filter(template => `${template.name} ${template.body}`.toLowerCase().includes(q.toLowerCase())) : [];
  const details = error instanceof ApiError && typeof error.details === 'object' && error.details !== null && !Array.isArray(error.details) ? error.details as Record<string, unknown> : null;
  const disconnected = error instanceof ApiError && (error.status === 401 || error.code === '190' || (error.code === 'PROVIDER' && (details?.code === 190 || details?.code === '190')));
  const actions = allowed && <><Button variant="outline" onClick={sync} disabled={busy}><RefreshCw className="mr-1 size-4" strokeWidth={1.5} aria-hidden />{tr('Sincronizar')}</Button><Button disabled={busy || !channels.some(channel => channel.capabilities.templates)} onClick={() => setEditing({ template: null, clone: false })}><Plus className="mr-1 size-4" strokeWidth={1.5} aria-hidden />{tr('Nueva plantilla')}</Button></>;
  const toolbar = <SearchInput value={q} onChange={setQ} placeholder={tr('Buscar plantillas…')} etiqueta={tr('Buscar plantillas…')} className="min-w-48 max-w-sm flex-1" />;
  return <div className="space-y-4">
    {actionsHost ? createPortal(actions, actionsHost) : <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
    {toolbarHost ? createPortal(toolbar, toolbarHost) : <div className="flex items-center gap-2">{toolbar}</div>}
    {!canManage && !loading && !error && <p className="text-xs text-fg-muted">{tr('Sólo lectura')}</p>}
    {error !== null && <div role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text"><p>{tr(disconnected ? 'La conexión con WhatsApp necesita atención. Reconecta el canal para sincronizar.' : syncFailed ? 'No se pudo actualizar la plantilla.' : 'No se pudieron cargar las plantillas.')}</p>{visible.length > 0 && <p>{tr('Mostrando la última información disponible.')}</p>}<Button variant="outline" disabled={busy} onClick={() => syncFailed ? sync() : void load()}>{tr('Reintentar')}</Button>{disconnected && canManageChannels && <Button variant="outline" asChild><Link href="/app/configuracion/crm/whatsapp">{tr('Reconectar WhatsApp')}</Link></Button>}</div>}
    {!loading && !error && !channels.some(channel => channel.capabilities.templates) && <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">{tr('Conecta un canal de WhatsApp para crear y sincronizar plantillas.')}{canManageChannels && <Button variant="outline" asChild><Link href="/app/configuracion/crm/whatsapp">{tr('Conectar WhatsApp')}</Link></Button>}</p>}
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}</div>
      : !visible.length ? <EmptyState variante={error ? 'error' : q ? 'search' : undefined} titulo={tr('Aún no hay plantillas de WhatsApp.')} icono={MessageCircle} onReintentar={error ? () => void load() : undefined} />
      : <ul aria-label={tr('Plantillas de WhatsApp')} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(template => <li key={template.id}>
        <Tarjeta titulo={template.name} icono={MessageCircle} descripcion={`${tr(template.meta.category === 'utility' ? 'Transaccional' : template.meta.category === 'marketing' ? 'Marketing' : 'Autenticación')} · ${template.meta.language}`}
          accion={<RowActionsMenu titulo={template.name} acciones={[{ id: 'view', etiqueta: tr(allowed && template.meta.status === 'DRAFT' ? 'Editar' : 'Ver'), icono: allowed && template.meta.status === 'DRAFT' ? Pencil : Eye, onSelect: () => setEditing({ template, clone: false }) },
        ...(allowed && template.meta.status !== 'PENDING' ? [{ id: 'clone', etiqueta: tr(template.meta.status === 'REJECTED' ? 'Corregir y reenviar' : 'Duplicar como nueva'), icono: Copy, deshabilitada: busy, onSelect: () => setEditing({ template, clone: true }) },
          ...(template.meta.status === 'DRAFT' ? [{ id: 'submit', etiqueta: tr('Enviar a aprobación'), icono: Send, deshabilitada: busy, onSelect: () => submit(template) },
            { id: 'delete', etiqueta: tr('Eliminar'), icono: Trash2, destructiva: true, deshabilitada: busy, onSelect: () => setDeleting(template) }] : [])] : [])]} />}
          pie={<div className="flex items-center justify-between gap-2 text-xs text-fg-secondary"><span>{template.meta.provider === 'twilio' ? 'Twilio' : 'Meta'}</span><button type="button" className="font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setEditing({ template, clone: false })}>{tr(allowed && template.meta.status === 'DRAFT' ? 'Editar' : 'Ver')}</button></div>}>
          <div className="space-y-3"><StatusBadge estado={template.meta.status} etiqueta={tr(statuses[template.meta.status] ?? 'Borrador')} tono={template.meta.status === 'APPROVED' ? 'exito' : template.meta.status === 'REJECTED' ? 'peligro' : template.meta.status === 'PENDING' ? 'advertencia' : 'neutro'} />
            <button type="button" className="block min-h-24 w-full rounded-lg bg-subtle p-3 text-left text-[13px] leading-[18px] text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setEditing({ template, clone: false })}><span className="line-clamp-4 whitespace-pre-wrap">{template.body}</span></button>
            {template.meta.rejected_reason && <p className="rounded-lg border border-line-danger bg-danger-subtle p-2 text-xs text-danger-text">{template.meta.rejected_reason}</p>}
            {template.description && <p className="line-clamp-2 text-xs text-fg-muted">{template.description}</p>}
            <p className="text-xs text-fg-muted">{tr('Calidad')}: {template.meta.quality_score ?? '—'}</p>
          </div>
        </Tarjeta>
      </li>)}</ul>}
    {editing && <HsmEditorDialog key={`${scope}:${editing.template?.id ?? 'new'}:${editing.clone}`} open template={editing.template} clone={editing.clone} canManage={allowed} channels={channels}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{tr('¿Eliminar esta plantilla?')}</AlertDialogTitle><AlertDialogDescription>{tr('La plantilla dejará de estar disponible para nuevos mensajes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>{tr('Cancelar')}</Button><Button variant="destructive" disabled={busy || !allowed} onClick={remove}>{tr('Eliminar')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
