'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ClienteSegmento } from '@/lib/services/crm/segmentosLogica';
export function SegmentoMiembros({ rows, snapshot }: { rows: ClienteSegmento[]; snapshot: string | null }) {
  const t = useTranslations('crm.segmentosNuevo');
  const { formatDateTime } = useFormatDate(null);
  return <div className="overflow-x-auto rounded-xl border border-line bg-surface">
    <table className="w-full text-sm"><thead className="border-b border-line bg-subtle text-left text-xs text-fg-secondary">
      <tr>{['customers', 'city', 'phone', 'email', 'whatsapp', 'health', 'joined'].map(key => <th key={key} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{t(key)}</th>)}</tr>
    </thead><tbody className="divide-y divide-line">{rows.map(c => <tr key={c.id} className="text-fg hover:bg-hover">
      <td className="min-w-40 px-4 py-3"><Link href={`/app/clientes/${c.id}`} className="font-medium text-link hover:underline">{c.full_name || '—'}</Link></td>
      <td className="px-4 py-3">{c.city || '—'}</td><td className="whitespace-nowrap px-4 py-3"><p>{c.phone || '—'}</p>{c.rne_excluded === true && <small className="text-danger-text">{t('rne')}</small>}</td>
      <td className="px-4 py-3">{c.email || '—'}</td><td className="px-4 py-3">{c.whatsapp_contactable === true ? t('yes') : t('no')}</td>
      <td className="px-4 py-3 tabular-nums">{typeof c.health_score === 'number' ? c.health_score : '—'}</td>
      <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">{snapshot ? formatDateTime(snapshot) : '—'}</td>
    </tr>)}</tbody></table>
  </div>;
}
