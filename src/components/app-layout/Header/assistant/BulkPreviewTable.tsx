'use client';

/**
 * Vista previa de una carga masiva, de solo lectura (§6.3; Figma
 * `AsistenteCargaMasiva` 663:16533, Layout = acoplado / ampliado; pantallas 08
 * `667:37374` y 09 `668:37351`).
 *
 * - **Acoplado (400 px)**: contadores con badges, las filas con problemas
 *   primero (hasta tres, con su motivo) y «Ver las N filas en grande».
 * - **Ampliado (720 px)**: la tabla completa —#, producto, SKU, precio, stock y
 *   estado— virtualizada: un listado de 500 filas no pinta 500 filas.
 *
 * «Ver en grande» pasa el PANEL a ampliado (sin cambiar de conversación). Donde
 * no cabe el ampliado (por debajo de 1280 px, o en móvil) despliega la tabla
 * aquí mismo, como antes: la persona siempre puede ver todas las filas antes
 * de confirmar.
 *
 * El texto no promete lo que no sabe: el Figma decía «leído sin IA, sin
 * costo», pero una foto de un listado sí pasa por visión. Aquí solo se cuentan
 * filas.
 */

import React, { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Virtuoso } from 'react-virtuoso';
import { ChevronDown, ChevronUp, FileSpreadsheet, Maximize2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import type { ActionPreview, BulkPreviewRow } from '@/lib/ai/assistant/clientTypes';

type Bulk = NonNullable<ActionPreview['bulk']>;

const ORDEN: Record<BulkPreviewRow['estado'], number> = { error: 0, existente: 1, nuevo: 2 };
const TONO = { nuevo: 'exito', existente: 'advertencia', error: 'peligro' } as const;

/** Problemas primero; dentro de cada grupo, el orden del archivo. */
export function ordenarFilas(rows: readonly BulkPreviewRow[]): BulkPreviewRow[] {
  return [...rows].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.n - b.n);
}

interface Props {
  bulk: Bulk;
  modo?: 'acoplado' | 'ampliado';
  /** Pasar el panel a ampliado. Sin él (móvil, pantallas estrechas) se despliega aquí. */
  onVerEnGrande?: () => void;
}

export default function BulkPreviewTable({ bulk, modo = 'acoplado', onVerEnGrande }: Props) {
  const t = useTranslations('asistente.masiva');
  const locale = useLocale();
  const [abierta, setAbierta] = useState(false);
  const filas = useMemo(() => ordenarFilas(bulk.rows), [bulk.rows]);
  const aCargar = bulk.nuevos + bulk.duplicados;
  const numero = (n: number | null) => (n === null ? '—' : n.toLocaleString(locale));

  const motivo = (row: BulkPreviewRow): string | null => {
    if (row.estado === 'error') return row.motivo ? t('seOmiteMotivo', { motivo: row.motivo }) : t('seOmite');
    if (row.estado === 'existente') return row.coincide ? t('coincidePor', { campo: t(`campo.${row.coincide}`) }) : t('yaExiste');
    return null;
  };

  const cabecera = (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-subtle">
        <FileSpreadsheet className="h-5 w-5 text-success-text" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{t('filas', { n: bulk.total })}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {bulk.nuevos > 0 && <Badge tono="exito" tamano="sm">{t('nuevos', { n: bulk.nuevos })}</Badge>}
          {bulk.duplicados > 0 && <Badge tono="advertencia" tamano="sm">{t('existen', { n: bulk.duplicados })}</Badge>}
          {bulk.conErrores > 0 && <Badge tono="peligro" tamano="sm">{t('omiten', { n: bulk.conErrores })}</Badge>}
        </div>
      </div>
    </div>
  );

  const pie = (
    <p className="text-xs text-fg-muted">{t('pie', { n: aCargar })}</p>
  );

  const tabla = (alto: number) => (
    <div className="overflow-x-auto" role="table" aria-label={t('tabla')} aria-rowcount={filas.length}>
      <div role="row" className="grid min-w-[520px] grid-cols-[2.5rem_minmax(0,1fr)_7rem_5.5rem_4rem_6rem] gap-2 border-b border-line px-3 py-2 text-xs font-semibold text-fg-secondary">
        <span role="columnheader">#</span>
        <span role="columnheader">{t('colProducto')}</span>
        <span role="columnheader">{t('colSku')}</span>
        <span role="columnheader" className="text-right">{t('colPrecio')}</span>
        <span role="columnheader" className="text-right">{t('colStock')}</span>
        <span role="columnheader">{t('colEstado')}</span>
      </div>
      <Virtuoso
        style={{ height: alto }}
        data={filas}
        itemContent={(_, row) => (
          <div
            role="row"
            className={cn(
              'grid min-w-[520px] grid-cols-[2.5rem_minmax(0,1fr)_7rem_5.5rem_4rem_6rem] items-center gap-2 border-b border-line px-3 py-2 text-[13px]',
              row.estado === 'error' && 'bg-danger-subtle'
            )}
          >
            <span role="cell" className="tabular-nums text-fg-muted">{row.n}</span>
            <span role="cell" className="min-w-0">
              <span className="block truncate text-fg" title={row.nombre}>{row.nombre || t('sinNombre')}</span>
              {row.estado !== 'nuevo' && (
                <span className={cn('block truncate text-xs', row.estado === 'error' ? 'text-danger-text' : 'text-warning-text')}>
                  {motivo(row)}
                </span>
              )}
            </span>
            <span role="cell" className="truncate text-xs text-fg-secondary">{row.sku ?? row.barcode ?? '—'}</span>
            <span role="cell" className="text-right tabular-nums text-fg">{numero(row.precio)}</span>
            <span role="cell" className="text-right tabular-nums text-fg">{numero(row.stock)}</span>
            <span role="cell">
              <Badge tono={TONO[row.estado]} tamano="sm">{t(`estado.${row.estado}`)}</Badge>
            </span>
          </div>
        )}
      />
    </div>
  );

  if (modo === 'ampliado') {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        {cabecera}
        <div className="-mx-4">{tabla(Math.min(filas.length, 10) * 45)}</div>
        {pie}
      </div>
    );
  }

  const destacadas = filas.filter((f) => f.estado !== 'nuevo').slice(0, 3);

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      {cabecera}
      {destacadas.length > 0 && (
        <ul className="-mx-4 divide-y divide-line border-y border-line">
          {destacadas.map((row) => (
            <li key={row.n} className={cn('flex gap-3 px-4 py-2', row.estado === 'error' && 'bg-danger-subtle')}>
              <span className="w-8 shrink-0 text-xs tabular-nums text-fg-muted">#{row.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{row.nombre || t('sinNombre')}</span>
                <span className={cn('block text-xs', row.estado === 'error' ? 'text-danger-text' : 'text-warning-text')}>
                  {motivo(row)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {onVerEnGrande ? (
        <>
          {/* Donde cabe el ampliado (≥ 1280 px) el panel se ensancha; por debajo, la tabla se despliega aquí. */}
          <button type="button" onClick={onVerEnGrande} className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true, className: 'hidden xl:inline-flex' })}>
            <Maximize2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            {t('verEnGrande', { n: bulk.total })}
          </button>
          <BotonDesplegar abierta={abierta} total={bulk.total} onClick={() => setAbierta((v) => !v)} className="xl:hidden" />
        </>
      ) : (
        <BotonDesplegar abierta={abierta} total={bulk.total} onClick={() => setAbierta((v) => !v)} />
      )}
      {abierta && <div className={cn('-mx-4', onVerEnGrande && 'xl:hidden')}>{tabla(Math.min(filas.length, 8) * 45)}</div>}
      {pie}
    </div>
  );
}

function BotonDesplegar({ abierta, total, onClick, className }: { abierta: boolean; total: number; onClick(): void; className?: string }) {
  const t = useTranslations('asistente.masiva');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierta}
      className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true, className })}
    >
      {abierta ? <ChevronUp className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> : <ChevronDown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
      {abierta ? t('ocultarFilas') : t('verFilas', { n: total })}
    </button>
  );
}
