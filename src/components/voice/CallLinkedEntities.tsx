'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Briefcase, ChevronRight, User } from 'lucide-react';
export function CallLinkedEntities({ customerId, opportunityId, customerName, opportunityName, opportunityStage, opportunityAmount }: {
  customerId: string | null; opportunityId: string | null; customerName?: string | null; opportunityName?: string | null; opportunityStage?: string | null; opportunityAmount?: string | null;
}) {
  const t = useTranslations('crm.llamadas.ficha');
  const links = [
    opportunityId ? { id: opportunityId, href: `/app/crm/oportunidades/${opportunityId}`, name: [opportunityName ?? t('oportunidad'), opportunityAmount].filter(Boolean).join(' · '), detail: [t('oportunidad'), opportunityStage ? t('etapa', { nombre: opportunityStage }) : null].filter(Boolean).join(' · '), icon: Briefcase } : null,
    customerId ? { id: customerId, href: `/app/clientes/${customerId}`, name: customerName || t('clienteVinculado'), detail: t('cliente'), icon: User } : null,
  ];
  return <div className="space-y-2.5">{links.map((link) => link && <Link key={link.id} href={link.href} className="flex items-center gap-2.5 rounded-lg border border-line p-2.5 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
    <link.icon aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-5 text-fg">{link.name}</span><span className="block text-xs font-medium leading-4 text-fg-secondary">{link.detail}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
  </Link>)}</div>;
}
