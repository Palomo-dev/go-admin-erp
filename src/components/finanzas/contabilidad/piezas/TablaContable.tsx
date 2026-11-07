'use client';

/**
 * Tabla contable de lectura (Figma `kit/contabilidad · TablaContable`
 * 978:605473): cuenta (código enlazado al mayor + nombre), descripción, tercero
 * y centro opcionales, débito y crédito, y el pie con los totales. Por debajo
 * de `lg`, una tarjeta por línea. Recibe las líneas ya leídas: sin servicio.
 */
import type React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { cuadreDe } from '@/lib/finanzas/contabilidad/cuadre';

export interface LineaTablaContable {
  id: string | number;
  cuenta: string;
  nombreCuenta?: string | null;
  descripcion?: string | null;
  tercero?: string | null;
  centro?: string | null;
  debito: number;
  credito: number;
  /** Fila resaltada (línea de redondeo). */
  resaltada?: boolean;
  /** Aviso en la fila («agrupadora», «no existe»). */
  aviso?: string | null;
}

export interface TablaContableProps {
  lineas: readonly LineaTablaContable[];
  formatear: (valor: number) => string;
  /** Columnas opcionales; por defecto se muestran si alguna línea las tiene. */
  conDescripcion?: boolean;
  conTercero?: boolean;
  conCentro?: boolean;
  /** El código enlaza al mayor de la cuenta. */
  enlazarMayor?: boolean;
  sinPie?: boolean;
  etiqueta?: string;
  /** Columnas propias antes de Débito (p. ej. sede y moneda de un contra-asiento). */
  columnasExtra?: readonly { id: string; encabezado: string; valor: (l: LineaTablaContable) => React.ReactNode }[];
  className?: string;
}

const RAYA = '—';

export function TablaContable({
  lineas,
  formatear,
  conDescripcion,
  conTercero,
  conCentro,
  enlazarMayor = true,
  sinPie,
  etiqueta,
  columnasExtra = [],
  className,
}: TablaContableProps) {
  const t = useTranslations('finanzasContabilidadR3.comun.tabla');
  const desc = conDescripcion ?? lineas.some((l) => l.descripcion);
  const terc = conTercero ?? lineas.some((l) => l.tercero);
  const cent = conCentro ?? lineas.some((l) => l.centro);
  const totales = cuadreDe(lineas.map((l) => ({ debit: l.debito, credit: l.credito })));
  const importe = (v: number) => (Math.abs(v) < 0.005 ? RAYA : formatear(v));

  const Cuenta = ({ l }: { l: LineaTablaContable }) => (
    <span className="flex flex-col">
      {enlazarMayor ? (
        <Link
          href={`/app/finanzas/contabilidad/mayor-contable?cuenta=${encodeURIComponent(l.cuenta)}`}
          className="font-mono text-sm text-brand hover:underline"
        >
          {l.cuenta}
        </Link>
      ) : (
        <span className="font-mono text-sm text-brand">{l.cuenta}</span>
      )}
      {l.nombreCuenta && <span className="text-sm text-fg">{l.nombreCuenta}</span>}
      {l.aviso && <span className="text-xs text-danger-text">{l.aviso}</span>}
    </span>
  );

  return (
    <div className={cn('overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <table className="hidden w-full text-sm lg:table" aria-label={etiqueta ?? t('etiqueta')}>
        <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
          <tr>
            <th scope="col" className="px-3 py-2.5">{t('cuenta')}</th>
            {desc && <th scope="col" className="px-3 py-2.5">{t('descripcion')}</th>}
            {terc && <th scope="col" className="px-3 py-2.5">{t('tercero')}</th>}
            {cent && <th scope="col" className="px-3 py-2.5">{t('centro')}</th>}
            {columnasExtra.map((c) => (
              <th key={c.id} scope="col" className="px-3 py-2.5">{c.encabezado}</th>
            ))}
            <th scope="col" className="px-3 py-2.5 text-right">{t('debito')}</th>
            <th scope="col" className="px-3 py-2.5 text-right">{t('credito')}</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.id} className={cn('border-t border-line', l.resaltada && 'bg-info-subtle font-medium')}>
              <td className="px-3 py-2.5 align-top"><Cuenta l={l} /></td>
              {desc && <td className="px-3 py-2.5 align-top text-fg-secondary">{l.descripcion || RAYA}</td>}
              {terc && <td className="px-3 py-2.5 align-top text-fg-secondary">{l.tercero || RAYA}</td>}
              {cent && <td className="px-3 py-2.5 align-top text-fg-secondary">{l.centro || RAYA}</td>}
              {columnasExtra.map((c) => (
                <td key={c.id} className="px-3 py-2.5 align-top text-fg-secondary">{c.valor(l) ?? RAYA}</td>
              ))}
              <td className="px-3 py-2.5 text-right align-top tabular-nums text-fg">{importe(l.debito)}</td>
              <td className="px-3 py-2.5 text-right align-top tabular-nums text-fg">{importe(l.credito)}</td>
            </tr>
          ))}
        </tbody>
        {!sinPie && (
          <tfoot className="border-t border-line bg-subtle font-semibold">
            <tr>
              <td className="px-3 py-2.5 text-fg-secondary" colSpan={1 + (desc ? 1 : 0) + (terc ? 1 : 0) + (cent ? 1 : 0) + columnasExtra.length}>
                {t('totales')}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-fg">{formatear(totales.debitos)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-fg">{formatear(totales.creditos)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <ul className="divide-y divide-line lg:hidden" aria-label={etiqueta ?? t('etiqueta')}>
        {lineas.map((l) => (
          <li key={l.id} className={cn('flex items-start justify-between gap-3 p-3', l.resaltada && 'bg-info-subtle')}>
            <span className="min-w-0">
              <Cuenta l={l} />
              {(l.descripcion || l.tercero || l.centro) && (
                <span className="mt-0.5 block text-xs text-fg-secondary">
                  {[l.descripcion, l.tercero, l.centro].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <span className="shrink-0 text-right text-sm">
              <span className="block text-xs text-fg-muted">{l.debito > 0 ? t('debito') : t('credito')}</span>
              <span className="font-semibold tabular-nums text-fg">{formatear(l.debito > 0 ? l.debito : l.credito)}</span>
            </span>
          </li>
        ))}
        {!sinPie && (
          <li className="flex items-center justify-between bg-subtle p-3 text-sm font-semibold">
            <span className="text-fg-secondary">{t('totales')}</span>
            <span className="tabular-nums text-fg">
              {t('totalesDC', { debito: formatear(totales.debitos), credito: formatear(totales.creditos) })}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
