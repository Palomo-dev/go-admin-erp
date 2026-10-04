"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { FormField } from '@/components/kit/FormField';
import { Pagination } from '@/components/kit/Pagination';
import { SearchInput } from '@/components/kit/SearchInput';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { contactState } from '@/lib/services/crm/whatsapp/types';
import { ApiError } from '@/components/crm/whatsapp/api';
import { CampanasService } from '../CampanasService';
import type { CampaignContact, ContactState } from '../types';

const PAGE = 50;
const STATES: ContactState[] = ['pending', 'queued', 'sent', 'delivered', 'read', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'skipped'];
export function CampaignContactsTable({ campaignId, refreshKey }: { campaignId: string; refreshKey?: string | number }) {
  const t = useTranslations('crm.campanasDetalle');
  const { formatDateTime } = useFormatDate(null);
  const [rows, setRows] = useState<CampaignContact[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    let current = true;
    setLoading(true); setRows([]); setTotal(0); setError(false); setForbidden(false);
    const timer = setTimeout(() => {
      const timeout = setTimeout(() => request.abort(), 20000);
      void CampanasService.contacts(campaignId, { state: state === 'all' ? undefined : state, q: q || undefined, page, pageSize: PAGE }, request.signal)
        .then(r => { if (current) { setRows(r.data); setTotal(r.total); } })
        .catch(e => { if (current) { setError(true); setForbidden(e instanceof ApiError && [401, 403].includes(e.status)); } })
        .finally(() => { clearTimeout(timeout); if (current) setLoading(false); });
    }, 250);
    return () => { current = false; request.abort(); clearTimeout(timer); };
  }, [campaignId, state, q, page, refreshKey, revision]);
  const clear = () => { setState('all'); setQ(''); setPage(1); };
  const reasonLabel = (code: string) => t.has(`razones.${code}`) ? t(`razones.${code}`) : t('otraExclusion');
  const detail = (row: CampaignContact) => <div className="space-y-1 text-xs text-fg-secondary">
    {contactState(row) === 'failed' && <p>{row.metadata?.error_code ? t('errorProveedor', { code: row.metadata.error_code }) : t('estadosContacto.failed')}</p>}
    {contactState(row) === 'skipped' && <p>{reasonLabel(String(row.metadata?.skipped_reason ?? ''))}</p>}
    {row.metadata?.opportunity_id && <Link className="text-link hover:underline" href={`/app/crm/oportunidades/${row.metadata.opportunity_id}`}>{t('oportunidad')}</Link>}
  </div>;
  const customer = (row: CampaignContact) => <div className="min-w-0">
    <p className="break-words font-medium text-fg">{row.customer?.full_name || t('sinNombre')}</p>
    <p className="break-all text-xs text-fg-secondary">{row.customer?.phone || row.customer?.email || row.metadata?.recipient || '—'}</p>
  </div>;
  const status = (row: CampaignContact) => <StatusBadge estado={contactState(row)} etiqueta={t(`estadosContacto.${contactState(row)}`)} />;
  const columns: ColumnaTabla<CampaignContact>[] = [
    { id: 'customer', encabezado: t('cliente'), celda: customer },
    { id: 'state', encabezado: t('filtro'), celda: status },
    { id: 'sent', encabezado: t('enviado'), celda: row => formatDateTime(row.sent_at), ocultarDebajo: 'md' },
    { id: 'delivered', encabezado: t('entregado'), celda: row => formatDateTime(row.metadata?.delivered_at), ocultarDebajo: 'lg' },
    { id: 'read', encabezado: t('leido'), celda: row => formatDateTime(row.metadata?.read_at), ocultarDebajo: 'lg' },
    { id: 'replied', encabezado: t('respondio'), celda: row => formatDateTime(row.replied_at), ocultarDebajo: 'xl' },
    { id: 'detail', encabezado: t('detalle'), celda: detail },
  ];
  const hasFilters = !!q || state !== 'all';
  return <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="text-base font-semibold text-fg">{t('contactos', { n: total })}</h2>
      <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
        <SearchInput value={q} onChange={value => { setQ(value); setPage(1); }} etiqueta={t('buscar')} placeholder={t('buscarAyuda')} className="w-full sm:w-56" />
        <FormField etiqueta={t('filtro')}><select className={CLASE_CAMPO} value={state} onChange={event => { setState(event.target.value); setPage(1); }}>
          <option value="all">{t('todos')}</option>{STATES.map(key => <option key={key} value={key}>{t(`estadosContacto.${key}`)}</option>)}
        </select></FormField>
      </div>
    </div>
    <DataTable columnas={columns} filas={rows} obtenerId={row => row.id} etiqueta={t('contactos', { n: total })}
      estado={loading ? 'cargando' : error ? forbidden ? 'sinPermiso' : 'error' : !rows.length ? hasFilters ? 'sinResultados' : 'vacio' : 'listo'}
      error={{ titulo: t('errorContactos') }} sinPermiso={{ titulo: t('sinPermiso') }}
      vacio={{ titulo: t('sinContactos'), descripcion: t('sinContactosDetalle') }} sinResultados={{ titulo: t('sinResultados') }}
      onReintentar={() => setRevision(n => n + 1)} onLimpiarFiltros={clear}
      tarjetaMovil={row => <article className="space-y-2 rounded-lg border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-2">{customer(row)}{status(row)}</div>
        <p className="text-xs text-fg-secondary">{t('enviado')} · {formatDateTime(row.sent_at)}</p>{detail(row)}
      </article>}
      pie={<Pagination pagina={page} tamano={PAGE} total={total} onPaginaChange={setPage} cargando={loading} />} />
  </section>;
}
