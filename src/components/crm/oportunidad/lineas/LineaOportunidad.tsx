'use client';

import { useTranslations } from 'next-intl';
import { BedDouble, Calendar, FileText, Package, Pencil, Ticket, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

/**
 * Una fila de «Qué le vas a vender» / «Líneas» (Figma `LineaOportunidad`,
 * 1764:137304 y 1785:897400): icono por clase, nombre, detalle (variante y
 * SKU, servicio, hospedaje o concepto), insignias, modificadores como chips,
 * aviso de stock (solo productos que controlan stock), resumen del servicio u
 * hospedaje, total y «cantidad × precio», con editar y quitar.
 * Presentación pura: la pantalla arma el texto.
 */
export type ClaseLinea = 'producto' | 'servicio' | 'hospedaje' | 'concepto';

export interface InsigniaLinea {
  texto: string;
  tono: TonoBadge;
}

export interface FilaLineaOportunidad {
  clave: string;
  clase: ClaseLinea;
  nombre: string;
  detalle: string | null;
  insignias: InsigniaLinea[];
  chips: string[];
  aviso?: { texto: string; tono: 'advertencia' | 'peligro' } | null;
  resumen?: string | null;
  total: number;
  cantidadPorPrecio: string;
}

const ICONO: Record<ClaseLinea, LucideIcon> = { producto: Package, servicio: Ticket, hospedaje: BedDouble, concepto: FileText };

export interface LineaOportunidadProps {
  fila: FilaLineaOportunidad;
  moneda: ContextoMoneda;
  onEditar?: () => void;
  onQuitar?: () => void;
  deshabilitado?: boolean;
  compacta?: boolean;
}

export function LineaOportunidad({ fila, moneda, onEditar, onQuitar, deshabilitado, compacta }: LineaOportunidadProps) {
  const t = useTranslations('crm.oportunidad.lineas');
  const Icono = ICONO[fila.clase];
  return (
    <li className={cn('flex items-start gap-3 rounded-lg border border-line bg-surface', compacta ? 'p-3' : 'p-4')}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
        <Icono className="size-4" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-fg">{fila.nombre}</span>
          {fila.detalle && <span className="text-[13px] text-fg-secondary">{fila.detalle}</span>}
          {fila.insignias.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {fila.insignias.map((b) => (
                <StatusBadge key={b.texto} estado={b.texto} etiqueta={b.texto} tono={b.tono} tamano="sm" />
              ))}
            </div>
          )}
          {fila.chips.length > 0 && (
            <ul aria-label={t('modificadores')} className="flex flex-wrap gap-1.5">
              {fila.chips.map((c) => (
                <li key={c} className="rounded-full bg-subtle px-2.5 py-1 text-xs text-fg-secondary">{c}</li>
              ))}
            </ul>
          )}
          {fila.aviso && (
            <p className={cn('flex items-start gap-1.5 text-[13px]', fila.aviso.tono === 'peligro' ? 'text-danger-text' : 'text-warning-text')}>
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {fila.aviso.texto}
            </p>
          )}
          {fila.resumen && (
            <p className="flex items-start gap-1.5 text-[13px] text-brand-deep">
              <Calendar aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {fila.resumen}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col sm:items-end">
          <span className="text-sm font-semibold tabular-nums text-fg">{formatMoneda(fila.total, moneda)}</span>
          <span className="text-[13px] tabular-nums text-fg-secondary">{fila.cantidadPorPrecio}</span>
        </div>
      </div>
      {(onEditar || onQuitar) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onEditar && (
            <button type="button" aria-label={t('editarLinea', { nombre: fila.nombre })} onClick={onEditar} disabled={deshabilitado} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50">
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          )}
          {onQuitar && (
            <button type="button" aria-label={t('quitarLinea', { nombre: fila.nombre })} onClick={onQuitar} disabled={deshabilitado} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50">
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
