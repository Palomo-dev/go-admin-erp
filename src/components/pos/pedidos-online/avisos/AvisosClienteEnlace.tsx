'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BellRing, ChevronRight } from 'lucide-react';

/** Tarjeta de Configuración › POS que abre «Avisos al cliente». */
export function AvisosClienteEnlace() {
  const t = useTranslations('posAvisosCliente');
  return (
    <Link
      href="/app/configuracion/pos/avisos-cliente"
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-4 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
        <BellRing className="size-5" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-fg">{t('titulo')}</span>
        <span className="block text-sm text-fg-secondary">{t('subtitulo')}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 text-fg-muted" />
    </Link>
  );
}
