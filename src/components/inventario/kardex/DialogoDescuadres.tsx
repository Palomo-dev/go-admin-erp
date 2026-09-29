'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Scale } from 'lucide-react';
import { Dialogo, EmptyState } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { descuadres, type Descuadres } from '@/lib/services/kardexService';
import { cn } from '@/utils/Utils';
import { useCantidadStock, useMensajeErrorInventario } from '../stock/useInventarioB1';

/**
 * Descuadres del kardex (Figma 522:71624): pares (producto, sucursal) cuyo saldo
 * de kardex no coincide con la existencia (`fn_kardex_descuadres`, D2) y cuántas
 * filas de stock no tienen ningún movimiento (D3). Solo informa: la corrección
 * (movimiento de apertura, P2) la hace B10.
 */
export interface DialogoDescuadresProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  sucursales: readonly number[];
  producto?: number;
  onVerProducto: (productoId: number) => void;
}

export function DialogoDescuadres({ abierto, onAbiertoChange, organizacionId, sucursales, producto, onVerProducto }: DialogoDescuadresProps) {
  const t = useTranslations('inventarioKardex.descuadres');
  const cantidad = useCantidadStock();
  const { formatDate } = useFormatDate();
  const mensajeError = useMensajeErrorInventario();
  const [datos, setDatos] = useState<Descuadres | null>(null);
  const [error, setError] = useState<string | null>(null);
  const claveSucursales = sucursales.join(',');

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setDatos(null);
    setError(null);
    descuadres(organizacionId, { sucursales, producto }, 200)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(mensajeError(e)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, organizacionId, claveSucursales, producto]);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Scale}
      ancho={880}
      primario={{ etiqueta: t('cerrar'), onClick: () => onAbiertoChange(false) }}
      textoCancelar={t('cerrar')}
    >
      {error ? (
        <EmptyState variante="error" compacto descripcion={error} />
      ) : !datos ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-secondary">
            {t('resumen', {
              count: datos.total,
              n: cantidad(datos.total),
              kardex: cantidad(datos.saldo_kardex),
              existencias: cantidad(datos.existencias),
            })}
            {datos.sin_historia > 0 && ` ${t('sinHistoria', { count: datos.sin_historia, n: cantidad(datos.sin_historia) })}`}
          </p>
          {datos.pares.length === 0 ? (
            <EmptyState compacto titulo={t('cuadraTitulo')} descripcion={t('cuadraDescripcion')} icono={Scale} />
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('titulo')}</caption>
                <thead className="sticky top-0 bg-subtle text-xs text-fg-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t('producto')}</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t('sucursal')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('kardex')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('existencias')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('diferencia')}</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t('ultimo')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {datos.pares.map((p) => (
                    <tr key={`${p.product_id}-${p.branch_id}`}>
                      <td className="max-w-[240px] px-3 py-2">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          onClick={() => onVerProducto(p.product_id)}
                        >
                          {p.nombre}
                        </button>
                        {p.sku && <span className="block truncate text-xs text-fg-secondary">{p.sku}</span>}
                      </td>
                      <td className="px-3 py-2 text-fg">{p.sucursal}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg">{cantidad(p.saldo_kardex)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg">{cantidad(p.existencia)}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', p.diferencia > 0 ? 'text-warning-text' : 'text-danger-text')}>
                        {p.diferencia > 0 ? '+' : '−'}
                        {cantidad(Math.abs(p.diferencia))}
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-secondary">{p.ultimo_movimiento ? formatDate(p.ultimo_movimiento) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {datos.total > datos.pares.length && <p className="text-xs text-fg-muted">{t('mostrando', { n: cantidad(datos.pares.length), total: cantidad(datos.total) })}</p>}
          <p className="text-xs text-fg-muted">{t('nota')}</p>
        </div>
      )}
    </Dialogo>
  );
}
