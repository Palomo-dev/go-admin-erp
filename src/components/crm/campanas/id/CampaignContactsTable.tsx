'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { contactState } from '@/lib/services/crm/whatsapp/types';
import { ERROR_CODE_LABELS, SKIP_REASON_LABELS } from '@/components/crm/whatsapp/api';
import { CampanasService } from '../CampanasService';
import { CONTACT_STATE_LABEL, type CampaignContact, type ContactState } from '../types';

const PAGE = 50;
const VARIANT: Partial<Record<ContactState, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'>> = { sent: 'secondary', delivered: 'success', read: 'success', replied: 'success', failed: 'destructive', skipped: 'outline', pending: 'warning', queued: 'warning' };

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—');

export function CampaignContactsTable({ campaignId, refreshKey }: { campaignId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<CampaignContact[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      CampanasService.contacts(campaignId, { state: state === 'all' ? undefined : state, q: q || undefined, page, pageSize: PAGE })
        .then((r) => { if (!cancelled) { setRows(r.data); setTotal(r.total); } })
        .catch(() => undefined)
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [campaignId, state, q, page, refreshKey]);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <CardTitle className="text-base">Contactos ({total})</CardTitle>
        <div className="flex gap-2">
          <Input aria-label="Buscar contacto" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar nombre, teléfono…" className="h-8 w-48 text-xs bg-gray-50 dark:bg-gray-900" />
          <Select value={state} onValueChange={(v) => { setState(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-900" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem>{(Object.keys(CONTACT_STATE_LABEL) as ContactState[]).map((s) => <SelectItem key={s} value={s}>{CONTACT_STATE_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Estado</TableHead><TableHead className="hidden md:table-cell">Enviado</TableHead><TableHead className="hidden md:table-cell">Entregado</TableHead><TableHead className="hidden md:table-cell">Leído</TableHead><TableHead className="hidden lg:table-cell">Respondió</TableHead><TableHead className="hidden lg:table-cell">Detalle</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-gray-500">Cargando…</TableCell></TableRow>
              : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-gray-500">Sin contactos. Calcula la audiencia para materializar la campaña.</TableCell></TableRow>
              : rows.map((r) => {
                const s = contactState(r);
                const m = r.metadata ?? {};
                return (
                  <TableRow key={r.id}>
                    <TableCell><p className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.customer?.full_name ?? 'Sin nombre'}</p><p className="text-xs text-gray-500">{r.customer?.phone ?? r.customer?.email ?? m.recipient ?? ''}</p></TableCell>
                    <TableCell><Badge variant={VARIANT[s] ?? 'outline'} className="text-[10px]">{CONTACT_STATE_LABEL[s]}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-gray-500">{fmt(r.sent_at)}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-gray-500">{fmt(m.delivered_at)}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-gray-500">{fmt(m.read_at)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-gray-500">{fmt(r.replied_at)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-gray-500">
                      {s === 'skipped' && (SKIP_REASON_LABELS[String(m.skipped_reason)] ?? m.skipped_reason)}
                      {s === 'failed' && (ERROR_CODE_LABELS[String(m.error_code)] ?? m.error_message ?? m.error_code)}
                      {m.opportunity_id && <Link href={`/app/crm/oportunidades/${m.opportunity_id}`} className="ml-1 text-blue-600 dark:text-blue-400 hover:underline">→ oportunidad</Link>}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        {total > PAGE && (
          <div className="flex items-center justify-between p-3 text-xs">
            <span>Página {page} de {Math.ceil(total / PAGE)}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" className="h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" variant="outline" className="h-7" disabled={page * PAGE >= total} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
