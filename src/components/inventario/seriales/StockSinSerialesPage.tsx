'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { ErrorPeticionSeriales, clienteSeriales } from '@/lib/services/seriales/cliente';
import type { FilaStockSinSerial } from '@/lib/services/seriales/contrato';
import { RUTA_SERIALES } from './logica';

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reporte de existencia sin serial. No genera números: solo muestra el hueco
 * para capturarlo en un ajuste.
 */
export function StockSinSerialesPage() {
  const t = useTranslations('inventarioSeriales.stockSinSeriales');
  const locale = useLocaleIntl();
  const [filas, setFilas] = useState<FilaStockSinSerial[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    clienteSeriales
      .stockSinSeriales(control.signal)
      .then((r) => {
        if (!control.signal.aborted) setFilas(Array.isArray(r.filas) ? r.filas : []);
      })
      .catch((err: unknown) => {
        if (control.signal.aborted || (err instanceof ErrorPeticionSeriales && err.codigo === 'sin_sesion')) return;
        if (!control.signal.aborted) setError(true);
      });
    return () => control.abort();
  }, []);

  const formato = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader titulo={t('titulo')} subtitulo={t('descripcion')} icono={AlertTriangle} variante="form" volverA={RUTA_SERIALES} cargando={filas === null && !error} />
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {t('error')}
        </p>
      )}
      {filas && filas.length === 0 && <p className="text-sm text-fg-secondary">{t('vacio')}</p>}
      {filas && filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-fg-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t('producto')}</th>
                <th className="px-3 py-2 font-medium">{t('sku')}</th>
                <th className="px-3 py-2 font-medium">{t('sucursal')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('existencia')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('seriales')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('disponibles')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('sinSerial')}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.product_id}-${f.branch_id}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Link className="text-brand hover:underline" href={`${RUTA_SERIALES}?producto=${f.product_id}`}>
                      {f.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-fg-secondary">{f.sku || '—'}</td>
                  <td className="px-3 py-2">{f.sucursal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formato(numero(f.qty_on_hand))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formato(numero(f.seriales))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formato(numero(f.seriales_disponibles))}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-warning-text">{formato(numero(f.sin_serial))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
