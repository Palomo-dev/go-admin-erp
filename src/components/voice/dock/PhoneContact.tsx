'use client';

import Link from 'next/link';
import { Briefcase, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarIniciales, BadgeTono } from '@/components/kit';
import { cn } from '@/utils/Utils';

export interface PhoneContactData {
  id: string | null;
  name: string | null;
  number: string;
  email?: string | null;
  company?: string | null;
  opportunity?: { id?: string; name: string; amount?: number | null; currency?: string | null } | null;
  note?: string | null;
}

/** Contexto de lectura. No decide quién se puede llamar ni crea registros. */
export function PhoneContact({ contact, centered = false, compact = false, card = false, reduced = false, pulse = false }: { contact: PhoneContactData; centered?: boolean; compact?: boolean; card?: boolean; reduced?: boolean; pulse?: boolean }) {
  const t = useTranslations('phoneBrowser');
  const title = contact.name ?? contact.number;
  return <div className={cn('space-y-3', compact && 'rounded-[10px] bg-brand-tint px-2.5 py-2', card && 'rounded-xl border border-line bg-canvas p-3', card && reduced && 'p-2')}>
    <div className={cn('flex items-center gap-2.5', centered && 'flex-col gap-4 text-center')}>
      <div className={cn('shrink-0', centered && 'flex size-28 items-center justify-center', pulse && 'rounded-full bg-brand-tint/40 ring-8 ring-brand-tint/20')}><AvatarIniciales nombre={contact.name ?? (centered ? '?' : title)} tamano={centered ? 'lg' : 'sm'} className={cn('bg-brand font-medium', centered && 'size-12 text-base', card && !reduced && 'size-10 text-sm')} /></div>
      <div className="min-w-0 flex-1">
        {contact.id ? <Link href={`/app/clientes/${contact.id}`} className={cn('block truncate text-sm font-medium leading-5 text-fg hover:underline', centered && 'text-lg font-semibold leading-6')}>{title}</Link>
          : <p className={cn('truncate text-sm font-medium leading-5 text-fg', centered && 'text-lg font-semibold leading-6')}>{title}</p>}
        <p className="mt-0.5 text-xs font-medium leading-4 text-fg-secondary">{contact.company ? `${contact.company}${reduced ? '' : ' · '}` : ''}{reduced && contact.company ? '' : contact.name ? contact.number : t('unknownNumber')}</p>
        {card && !reduced && contact.opportunity?.name && <p className="mt-1 flex items-center gap-1 text-xs leading-4 text-fg-secondary"><Briefcase size={12} strokeWidth={1.5} className="shrink-0" />{contact.opportunity.id ? <Link className="truncate hover:underline" href={`/app/crm/oportunidades/${contact.opportunity.id}`}>{contact.opportunity.name}</Link> : <span className="truncate">{contact.opportunity.name}</span>}</p>}
      </div>
      {compact && contact.id && <BadgeTono tono="marca">{t('customer')}</BadgeTono>}
      {card && contact.id && <Link href={`/app/clientes/${contact.id}`} className="shrink-0 text-fg-secondary hover:text-brand" aria-label={title}><ExternalLink size={16} strokeWidth={1.5} /></Link>}
    </div>
    {!compact && !card && !centered && contact.opportunity?.name && <div className="flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-2 text-xs font-medium leading-4 text-fg">
      <Briefcase size={14} strokeWidth={1.5} className="shrink-0 text-fg-secondary" />
      {contact.opportunity.id ? <Link className="truncate hover:underline" href={`/app/crm/oportunidades/${contact.opportunity.id}`}>{contact.opportunity.name}</Link> : <span className="truncate">{contact.opportunity.name}</span>}
    </div>}
  </div>;
}
