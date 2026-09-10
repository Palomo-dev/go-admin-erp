'use client';

/**
 * Lista de plantillas de email: buscador, filtro por tipo, activar/desactivar,
 * duplicar y eliminar (409 si es base → se ofrece desactivar).
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, FileText, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import type { TemplateKind, TemplateSummary } from '@/lib/services/crm/email/types';
import { deleteTemplate, duplicateTemplate, listTemplates, updateTemplate } from '@/components/crm/email/emailApi';
import { TEMPLATE_KIND_LABELS } from '@/components/crm/email/TemplatePicker';

const KIND_FILTERS: Array<{ value: 'all' | TemplateKind; label: string }> = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'transactional', label: TEMPLATE_KIND_LABELS.transactional },
  { value: 'marketing', label: TEMPLATE_KIND_LABELS.marketing },
  { value: 'sequence', label: TEMPLATE_KIND_LABELS.sequence },
  { value: 'onboarding', label: TEMPLATE_KIND_LABELS.onboarding },
];

function fmtDate(iso: string): string {
  try { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso)); } catch { return iso; }
}

export function TemplateList() {
  const router = useRouter();
  const [rows, setRows] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | TemplateKind>('all');
  const [pendingDelete, setPendingDelete] = useState<TemplateSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listTemplates({ channel: 'email', pageSize: 100 });
      setRows(r.data);
    } catch (err) {
      toast({ title: 'No se pudieron cargar las plantillas', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => (kind === 'all' || t.kind === kind) && (!needle || t.name.toLowerCase().includes(needle) || (t.subject ?? '').toLowerCase().includes(needle)));
  }, [rows, q, kind]);

  const toggleActive = async (t: TemplateSummary, active: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, is_active: active } : r)));
    try {
      await updateTemplate(t.id, { is_active: active });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, is_active: !active } : r)));
      toast({ title: 'No se pudo actualizar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const duplicate = async (t: TemplateSummary) => {
    try {
      const r = await duplicateTemplate(t.id);
      toast({ title: 'Plantilla duplicada', description: r.data.name });
      router.push(`/app/crm/plantillas/${r.data.id}`);
    } catch (err) {
      toast({ title: 'No se pudo duplicar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const r = await deleteTemplate(pendingDelete.id);
      toast({ title: r.data.deleted ? 'Plantilla eliminada' : 'Plantilla desactivada', description: r.data.deleted ? pendingDelete.name : 'Tiene envíos asociados; se desactivó en lugar de borrarla.' });
      setPendingDelete(null);
      await load();
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o asunto" aria-label="Buscar plantillas" className="pl-8 dark:bg-gray-900" />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as 'all' | TemplateKind)}>
          <SelectTrigger className="w-48 dark:bg-gray-900" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger>
          <SelectContent>{KIND_FILTERS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button asChild size="sm" className="gap-1"><Link href="/app/crm/plantillas/nueva"><Plus className="h-4 w-4" aria-hidden="true" /> Nueva plantilla</Link></Button>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-400" aria-hidden="true" />
          <p className="text-sm text-gray-600 dark:text-gray-300">{rows.length === 0 ? 'Aún no hay plantillas de email.' : 'Ninguna plantilla coincide con el filtro.'}</p>
          {rows.length === 0 && <Button asChild size="sm" className="mt-3"><Link href="/app/crm/plantillas/nueva">Crear la primera</Link></Button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Asunto</TableHead>
                <TableHead className="hidden lg:table-cell">Motor</TableHead>
                <TableHead className="hidden lg:table-cell">Usos</TableHead>
                <TableHead>Activa</TableHead>
                <TableHead className="hidden md:table-cell">Actualizada</TableHead>
                <TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/app/crm/plantillas/${t.id}`} className="font-medium text-gray-900 hover:underline dark:text-gray-100">{t.name}</Link>
                    {t.metadata?.is_system ? <Badge variant="outline" className="ml-2 text-[10px]">Base</Badge> : null}
                    <span className="ml-2 text-[11px] text-gray-400">v{t.version}</span>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{TEMPLATE_KIND_LABELS[(t.kind ?? 'transactional') as TemplateKind] ?? t.kind}</Badge></TableCell>
                  <TableCell className="hidden max-w-[280px] truncate text-gray-600 md:table-cell dark:text-gray-300">{t.subject}</TableCell>
                  <TableCell className="hidden text-xs text-gray-500 lg:table-cell dark:text-gray-400">{t.engine === 'html' ? 'HTML' : 'Bloques'}</TableCell>
                  <TableCell className="hidden text-xs text-gray-500 lg:table-cell dark:text-gray-400">{t.metadata?.usage_count ?? 0}</TableCell>
                  <TableCell><Switch checked={t.is_active} onCheckedChange={(v) => toggleActive(t, v)} aria-label={`${t.is_active ? 'Desactivar' : 'Activar'} ${t.name}`} /></TableCell>
                  <TableCell className="hidden text-xs text-gray-500 md:table-cell dark:text-gray-400">{fmtDate(t.updated_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Acciones de ${t.name}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="dark:bg-gray-800">
                        <DropdownMenuItem onClick={() => router.push(`/app/crm/plantillas/${t.id}`)}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(t)}><Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Duplicar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={!!t.metadata?.is_system} onClick={() => setPendingDelete(t)} className="text-red-600 focus:text-red-600 dark:text-red-400">
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Eliminar plantilla"
        description={`¿Eliminar “${pendingDelete?.name ?? ''}”? Si ya se usó en envíos se desactivará en lugar de borrarse.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
