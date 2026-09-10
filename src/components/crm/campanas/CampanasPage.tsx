'use client';

/** /app/crm/campanas (FASE-16 §5.1): lista con estado efectivo, progreso, métricas en vivo (realtime `campaigns`) y acciones. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Eye, Mail, Megaphone, MessageCircle, MoreVertical, Pause, Play, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatDate } from '@/utils/Utils';
import { CampanasService } from './CampanasService';
import { CAMPAIGN_STATUS_CONFIG, type Campaign } from './types';

function progressOf(c: Campaign): { done: number; total: number; pct: number } {
  const counts = c.statistics.counts;
  const total = c.statistics.total_contacts ?? counts?.total ?? 0;
  const done = counts ? counts.sent + counts.failed + counts.skipped : c.statistics.sent_count ?? 0;
  return { done, total, pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

export function CampanasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  // Lanzar/pausar/reanudar/cancelar exigen admin de organización: sin ese rol
  // las acciones no se ofrecen (antes se ofrecían y devolvían 403 en un toast
  // genérico — tester r1 · fallo 8).
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try { const r = await CampanasService.getCampaignsWithPermissions(); setCampaigns(r.data); setCanManage(r.can_manage === true); } catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudieron cargar las campañas', variant: 'destructive' }); } finally { setIsLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('campaigns-list').on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns', filter: `organization_id=eq.${getOrganizationId()}` }, () => void load(true)).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); await load(true); } catch (e) { toast({ title: 'No se pudo completar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }); }
  };

  const stats = { total: campaigns.length, sending: campaigns.filter((c) => c.effective_status === 'sending').length, scheduled: campaigns.filter((c) => c.effective_status === 'scheduled').length, sent: campaigns.filter((c) => c.effective_status === 'sent').length, draft: campaigns.filter((c) => c.effective_status === 'draft').length };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm"><Button variant="ghost" size="icon" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3"><div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><Megaphone className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" /></div>Campañas</h1>
            <p className="text-gray-500 dark:text-gray-400">CRM / Campañas · WhatsApp y email masivo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={isLoading} aria-label="Actualizar"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></Button>
          <Link href="/app/crm/campanas/nuevo"><Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />Nueva campaña</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
        {[['Total', stats.total], ['Borradores', stats.draft], ['Programadas', stats.scheduled], ['Enviando', stats.sending], ['Enviadas', stats.sent]].map(([label, n]) => (
          <Card key={String(label)} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardContent className="p-3 sm:pt-4 sm:px-4"><p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{n}</p><p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{label}</p></CardContent></Card>
        ))}
      </div>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                <TableHead>Campaña</TableHead>
                <TableHead className="hidden sm:table-cell">Canal</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell w-56">Progreso</TableHead>
                <TableHead className="hidden lg:table-cell">Entregados · Leídos · Resp.</TableHead>
                <TableHead className="hidden lg:table-cell">Costo</TableHead>
                <TableHead className="hidden xl:table-cell">Programada</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell></TableRow>)
                : campaigns.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12"><Megaphone className="h-12 w-12 mx-auto text-gray-400 mb-4" /><h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No hay campañas</h3><p className="text-gray-500 mb-4">Envía una plantilla de WhatsApp a un segmento, una etapa del pipeline o una selección.</p><Link href="/app/crm/campanas/nuevo"><Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />Crear campaña</Button></Link></TableCell></TableRow>
                ) : campaigns.map((c) => {
                  const st = CAMPAIGN_STATUS_CONFIG[c.effective_status] ?? CAMPAIGN_STATUS_CONFIG.draft;
                  const p = progressOf(c);
                  const k = c.statistics.counts;
                  const es = c.effective_status;
                  return (
                    <TableRow key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => router.push(`/app/crm/campanas/${c.id}`)}>
                      <TableCell className="py-2 sm:py-3"><p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{c.name}</p><p className="text-[11px] text-gray-500 truncate max-w-[200px]">{c.statistics.audience?.source === 'segment' ? 'Segmento' : c.statistics.audience?.source === 'stage' ? 'Etapas del pipeline' : 'Selección manual'} · {c.statistics.total_contacts ?? 0} contactos</p></TableCell>
                      <TableCell className="hidden sm:table-cell">{c.channel === 'email' ? <span className="inline-flex items-center gap-1 text-xs"><Mail className="h-3.5 w-3.5 text-blue-600" />Email</span> : <span className="inline-flex items-center gap-1 text-xs"><MessageCircle className="h-3.5 w-3.5 text-emerald-600" />WhatsApp</span>}</TableCell>
                      <TableCell><Badge className={`${st.bgColor} ${st.color} text-[10px] sm:text-xs`}>{st.label}</Badge></TableCell>
                      <TableCell className="hidden md:table-cell"><div className="space-y-1"><Progress value={p.pct} className="h-2" aria-label={`Progreso ${p.pct}%`} /><p className="text-[11px] text-gray-500">{p.done} / {p.total}</p></div></TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-gray-600 dark:text-gray-300">{k ? `${k.delivered} · ${k.read} · ${k.replied}` : '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-gray-600 dark:text-gray-300">{c.statistics.estimated_cost != null ? `≈ $${Number(c.statistics.estimated_cost).toFixed(2)}` : '—'}{k?.cost ? ` · real $${k.cost.toFixed(2)}` : ''}</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-gray-600 dark:text-gray-300">{c.scheduled_at ? formatDate(c.scheduled_at) : '—'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => router.push(`/app/crm/campanas/${c.id}`)}><Eye className="h-4 w-4 mr-2" />Ver detalle</DropdownMenuItem>
                            {canManage && (es === 'sending' || es === 'scheduled') && <DropdownMenuItem onClick={() => void act(() => CampanasService.pause(c.id), 'Campaña pausada')}><Pause className="h-4 w-4 mr-2" />Pausar</DropdownMenuItem>}
                            {canManage && es === 'paused' && <DropdownMenuItem onClick={() => void act(() => CampanasService.resume(c.id), 'Campaña reanudada')}><Play className="h-4 w-4 mr-2" />Reanudar</DropdownMenuItem>}
                            {canManage && ['sending', 'scheduled', 'paused'].includes(es) && <DropdownMenuItem onClick={() => void act(() => CampanasService.cancel(c.id), 'Campaña cancelada')}><XCircle className="h-4 w-4 mr-2" />Cancelar</DropdownMenuItem>}
                            <DropdownMenuItem onClick={() => void act(() => CampanasService.duplicateCampaign(c.id), 'Campaña duplicada')}><Copy className="h-4 w-4 mr-2" />Duplicar</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" disabled={es === 'sending'} onClick={() => setDeleteTarget(c)}><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle><AlertDialogDescription>Se borran sus contactos y métricas. Los mensajes ya enviados permanecen en las conversaciones.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { if (deleteTarget) void act(() => CampanasService.deleteCampaign(deleteTarget.id), 'Campaña eliminada'); setDeleteTarget(null); }}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
