'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Home, ArrowLeft, Compass } from 'lucide-react';
import { Firma } from '@/components/shell/marca/Firma';

export default function NotFound() {
  const t = useTranslations('errorPages.notFound');

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md text-center">
        {/* Firma del manual de marca */}
        <div className="mb-6 flex items-center justify-center">
          <Firma />
        </div>

        {/* Aviso */}
        <div className="rounded-xl border border-line-warning bg-warning-subtle p-4 shadow-sm">
          <div className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface">
              <Compass className="h-5 w-5 text-warning" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warning-text">{t('title')}</p>
              <p className="mt-1 text-xs text-warning-text">{t('description')}</p>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-action px-5 py-2.5 text-sm font-medium text-fg-on-brand shadow-sm transition-colors hover:bg-brand-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            {t('home')}
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg shadow-sm transition-colors hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('back')}
          </button>
        </div>
      </div>
    </div>
  );
}
