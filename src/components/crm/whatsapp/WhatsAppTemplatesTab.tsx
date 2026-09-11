'use client';

/**
 * WhatsAppTemplatesTab (FASE-16 §5.2): plantillas HSM de la org — estado de
 * aprobación, calidad, crear/editar (DRAFT), enviar a aprobación, sincronizar
 * desde Meta/Twilio. F7 la monta en /app/crm/plantillas (tab WhatsApp) con
 * next/dynamic: import('@/components/crm/whatsapp/WhatsAppTemplatesTab').
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { isRealtimePublished } from '@/components/crm/shared/realtimeTables';
import { waApi, ApiError, type ChannelSummary, type WhatsAppTemplate } from './api';
import { HsmEditorDialog } from './HsmEditorDialog';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' }> = {
  APPROVED: { label: 'Aprobada', variant: 'success' },
  PENDING: { label: 'En revisión', variant: 'warning' },
  REJECTED: { label: 'Rechazada', variant: 'destructive' },
  PAUSED: { label: 'Pausada', variant: 'destructive' },
  DISABLED: { label: 'Deshabilitada', variant: 'destructive' },
  IN_APPEAL: { label: 'En apelación', variant: 'warning' },
  DRAFT: { label: 'Borrador', variant: 'secondary' },
};
const CATEGORY: Record<string, string> = { utility: 'Utility', marketing: 'Marketing', authentication: 'Autenticación' };

/**
 * `canEdit` opcional: si el contenedor no lo pasa (p. ej. la pestaña WhatsApp de
 * /app/crm/plantillas), se resuelve del backend (`can_manage` = admin de
 * organización), porque el CRUD y la sincronización de plantillas exigen ese
 * rol (tester r1 · fallo 8: se ofrecían a cualquier miembro y devolvían 403).
 */
export function WhatsAppTemplatesTab({ canEdit }: { canEdit?: boolean }) {
  const [canManage, setCanManage] = useState(false);
  const effectiveCanEdit = canEdit ?? canManage;
  const [items, setItems] = useState<WhatsAppTemplate[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<WhatsAppTemplate | null | 'new'>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([waApi.templates({ status: 'ALL', includeInactive: true }), waApi.channels()]);
      setItems(t.data);
      setChannels(c.data);
      setCanManage(c.can_manage === true);
    } catch (e) {
      toast({ title: 'No se pudieron cargar las plantillas', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime: el webhook message_template_status_update actualiza templates.metadata
  // `templates` no está en la publicación `supabase_realtime`: abrir un canal consume
  // conexiones del pool sin recibir eventos. Si se publica, agregarla a
  // REALTIME_PUBLISHED_TABLES.
  useEffect(() => {
    if (!isRealtimePublished('templates')) return;
    const orgId = getOrganizationId();
    const ch = supabase.channel(`wa-templates-${orgId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'templates', filter: `organization_id=eq.${orgId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await waApi.syncTemplates();
      toast({ title: 'Sincronizado con el proveedor', description: `${r.created} nuevas · ${r.updated} actualizadas · ${r.total} en el WABA` });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo sincronizar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  const submit = async (t: WhatsAppTemplate) => {
    setBusyId(t.id);
    try {
      const r = await waApi.submitTemplate(t.id, t.meta.channel_id ?? null);
      toast({ title: 'Enviada a aprobación', description: `Estado: ${STATUS[r.data.meta.status]?.label ?? r.data.meta.status}. Meta suele responder en minutos u horas.` });
      await load();
    } catch (e) {
      toast({ title: 'No se pudo enviar', description: e instanceof ApiError ? `${e.message} (${e.code})` : String(e), variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const remove = async (t: WhatsAppTemplate) => {
    if (!confirm(t.meta.meta_template_id ? `"${t.name}" ya existe en Meta: se desactivará aquí (sigue en el WABA). ¿Continuar?` : `¿Eliminar el borrador "${t.name}"?`)) return;
    setBusyId(t.id);
    try { await waApi.deleteTemplate(t.id); await load(); } catch (e) { toast({ title: 'No se pudo eliminar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <p>Plantillas HSM aprobadas por Meta/Twilio. Solo las <strong>aprobadas</strong> se pueden enviar fuera de la ventana de 24 h.</p>
          {!effectiveCanEdit && !loading && <p className="text-xs text-gray-500 dark:text-gray-400">Solo lectura: crear, aprobar, eliminar y sincronizar plantillas requiere rol de administrador de la organización.</p>}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void sync()} disabled={syncing || !effectiveCanEdit}>{syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />}Sincronizar</Button>
          <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setEditing('new')} disabled={!effectiveCanEdit}><Plus className="h-4 w-4 mr-1" aria-hidden="true" />Crear plantilla</Button>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto bg-white dark:bg-gray-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="hidden sm:table-cell">Idioma</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Calidad</TableHead>
              <TableHead className="hidden lg:table-cell">Proveedor</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
              : items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-sm text-gray-500">No hay plantillas. Crea una o sincroniza las de tu WABA.</TableCell></TableRow>
              : items.map((t) => {
                const st = STATUS[t.meta.status] ?? STATUS.DRAFT;
                return (
                  <TableRow key={t.id} className={!t.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <button type="button" className="font-mono text-xs text-left hover:underline" onClick={() => setEditing(t)}>{t.name}</button>
                      {t.description && <p className="text-[11px] text-gray-500 truncate max-w-xs">{t.description}</p>}
                    </TableCell>
                    <TableCell><Badge variant={t.meta.category === 'marketing' ? 'warning' : 'secondary'} className="text-[10px]">{CATEGORY[t.meta.category] ?? t.meta.category}</Badge></TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{t.meta.language}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                      {t.meta.status === 'REJECTED' && t.meta.rejected_reason && <p className="text-[10px] text-red-600 dark:text-red-400">{t.meta.rejected_reason}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{t.meta.quality_score ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{t.meta.provider === 'twilio' ? 'Twilio' : 'Meta'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {t.meta.status === 'DRAFT' && effectiveCanEdit && <Button type="button" size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => void submit(t)} disabled={busyId === t.id}>{busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" aria-hidden="true" />Aprobar</>}</Button>}
                      {effectiveCanEdit && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-600" aria-label={`Eliminar ${t.name}`} onClick={() => void remove(t)} disabled={busyId === t.id}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {editing !== null && <HsmEditorDialog open template={editing === 'new' ? null : editing} channels={channels} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

export default WhatsAppTemplatesTab;
