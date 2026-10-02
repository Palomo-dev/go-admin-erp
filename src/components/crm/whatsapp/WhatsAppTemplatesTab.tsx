'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, MessageCircle, Pencil, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { SearchInput } from '@/components/kit/SearchInput';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useTemplateText } from '@/components/crm/plantillas/useTemplateText';
import { waApi, ApiError, type ChannelSummary, type WhatsAppTemplate } from './api';
import { HsmEditorDialog } from './HsmEditorDialog';
const statuses: Record<string, string> = { APPROVED: 'Aprobada', PENDING: 'En revisión', REJECTED: 'Rechazada', PAUSED: 'Pausada', DISABLED: 'Deshabilitada', IN_APPEAL: 'En apelación', DRAFT: 'Borrador' };
export function WhatsAppTemplatesTab({ canEdit }: { canEdit?: boolean }) {
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
  const columns: ColumnaTabla<WhatsAppTemplate>[] = [
    { id: 'name', encabezado: tr('Nombre'), celda: template => <div><span className="font-medium text-fg">{template.name}</span><p className="max-w-64 truncate text-xs text-fg-muted">{template.description}</p></div> },
    { id: 'category', encabezado: tr('Categoría'), celda: template => tr(template.meta.category === 'utility' ? 'Transaccional' : template.meta.category === 'marketing' ? 'Marketing' : 'Autenticación') },
    { id: 'language', encabezado: tr('Idioma'), ocultarDebajo: 'sm', celda: template => template.meta.language },
    { id: 'status', encabezado: tr('Estado'), celda: template => <div><Badge variant={template.meta.status === 'APPROVED' ? 'success' : template.meta.status === 'REJECTED' ? 'destructive' : template.meta.status === 'PENDING' ? 'warning' : 'secondary'}>{tr(statuses[template.meta.status] ?? 'Borrador')}</Badge>{template.meta.rejected_reason && <p className="max-w-64 text-xs text-danger-text">{template.meta.rejected_reason}</p>}</div> },
    { id: 'quality', encabezado: tr('Calidad'), ocultarDebajo: 'md', celda: template => template.meta.quality_score ?? '—' },
    { id: 'provider', encabezado: tr('Proveedor'), ocultarDebajo: 'lg', celda: template => template.meta.provider === 'twilio' ? 'Twilio' : 'Meta' },
  ];
  const visible = scope === orgId ? items.filter(template => `${template.name} ${template.body}`.toLowerCase().includes(q.toLowerCase())) : [];
  const details = error instanceof ApiError && typeof error.details === 'object' && error.details !== null && !Array.isArray(error.details) ? error.details as Record<string, unknown> : null;
  const disconnected = error instanceof ApiError && (error.status === 401 || error.code === '190' || (error.code === 'PROVIDER' && (details?.code === 190 || details?.code === '190')));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><SearchInput value={q} onChange={setQ} placeholder={tr('Buscar plantillas…')} etiqueta={tr('Buscar plantillas…')} className="min-w-48 flex-1" />
      {allowed && <><Button variant="outline" onClick={sync} disabled={busy}><RefreshCw className="mr-1 size-4" strokeWidth={1.5} aria-hidden="true" />{tr('Sincronizar')}</Button><Button disabled={busy || !channels.some(channel => channel.capabilities.templates)} onClick={() => setEditing({ template: null, clone: false })}><Plus className="mr-1 size-4" strokeWidth={1.5} aria-hidden="true" />{tr('Nueva plantilla')}</Button></>}
    </div>
    {!canManage && !loading && !error && <p className="text-xs text-fg-muted">{tr('Sólo lectura')}</p>}
    {error !== null && <div role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text"><p>{tr(disconnected ? 'La conexión con WhatsApp necesita atención. Reconecta el canal para sincronizar.' : syncFailed ? 'No se pudo actualizar la plantilla.' : 'No se pudieron cargar las plantillas.')}</p>{visible.length > 0 && <p>{tr('Mostrando la última información disponible.')}</p>}<Button variant="outline" disabled={busy} onClick={() => syncFailed ? sync() : void load()}>{tr('Reintentar')}</Button>{disconnected && canManageChannels && <Button variant="outline" asChild><Link href="/app/configuracion/crm/whatsapp">{tr('Reconectar WhatsApp')}</Link></Button>}</div>}
    {!loading && !error && !channels.some(channel => channel.capabilities.templates) && <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">{tr('Conecta un canal de WhatsApp para crear y sincronizar plantillas.')}{canManageChannels && <Button variant="outline" asChild><Link href="/app/configuracion/crm/whatsapp">{tr('Conectar WhatsApp')}</Link></Button>}</p>}
    <DataTable columnas={columns} filas={visible} obtenerId={template => template.id} etiqueta={tr('Plantillas de WhatsApp')} etiquetaFila={template => template.name}
      estado={loading ? 'cargando' : visible.length ? 'listo' : error ? 'error' : q ? 'sinResultados' : 'vacio'}
      vacio={{ titulo: tr('Aún no hay plantillas de WhatsApp.'), icono: MessageCircle }} onReintentar={() => void load()}
      onFilaClick={template => setEditing({ template, clone: false })}
      acciones={template => [{ id: 'view', etiqueta: tr(allowed && template.meta.status === 'DRAFT' ? 'Editar' : 'Ver'), icono: allowed && template.meta.status === 'DRAFT' ? Pencil : Eye, onSelect: () => setEditing({ template, clone: false }) },
        ...(allowed && template.meta.status !== 'PENDING' ? [{ id: 'clone', etiqueta: tr(template.meta.status === 'REJECTED' ? 'Corregir y reenviar' : 'Duplicar como nueva'), icono: Copy, deshabilitada: busy, onSelect: () => setEditing({ template, clone: true }) },
          ...(template.meta.status === 'DRAFT' ? [{ id: 'submit', etiqueta: tr('Enviar a aprobación'), icono: Send, deshabilitada: busy, onSelect: () => submit(template) },
            { id: 'delete', etiqueta: tr('Eliminar'), icono: Trash2, destructiva: true, deshabilitada: busy, onSelect: () => setDeleting(template) }] : [])] : [])]} />
    {editing && <HsmEditorDialog key={`${scope}:${editing.template?.id ?? 'new'}:${editing.clone}`} open template={editing.template} clone={editing.clone} canManage={allowed} channels={channels}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{tr('¿Eliminar esta plantilla?')}</AlertDialogTitle><AlertDialogDescription>{tr('La plantilla dejará de estar disponible para nuevos mensajes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>{tr('Cancelar')}</Button><Button variant="destructive" disabled={busy || !allowed} onClick={remove}>{tr('Eliminar')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
