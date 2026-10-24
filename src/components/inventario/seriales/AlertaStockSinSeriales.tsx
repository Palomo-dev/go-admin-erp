'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { clienteSeriales } from '@/lib/services/seriales/cliente';
import { RUTA_STOCK_SIN_SERIALES } from './logica';

/** Aviso en el listado de seriales cuando hay existencia sin un serial que la ocupe. */
export function AlertaStockSinSeriales() {
  const t = useTranslations('inventarioSeriales.stockSinSeriales');
  const entero = useFormatoEntero();
  const [casos, setCasos] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    clienteSeriales
      .stockSinSeriales(control.signal)
      .then((r) => {
        if (!control.signal.aborted) setCasos(Array.isArray(r.filas) ? r.filas.length : 0);
      })
      .catch(() => {
        if (!control.signal.aborted) setCasos(0);
      });
    return () => control.abort();
  }, []);

  if (casos <= 0) return null;

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center">
      <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-warning-text">{t('avisoTitulo', { count: casos, n: entero(casos) })}</p>
        <p className="text-[13px] text-fg-secondary">{t('avisoDescripcion')}</p>
      </div>
      <Button variant="outline" className="h-9 bg-surface" asChild>
        <Link href={RUTA_STOCK_SIN_SERIALES}>{t('verReporte')}</Link>
      </Button>
    </div>
  );
}
