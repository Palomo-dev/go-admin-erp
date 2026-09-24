'use client';

import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { StatusBadge } from '../StatusBadge';
import { useKitT } from '../useIdiomaKit';
import { ICONO_DOCUMENTO, ordenarCadena, type EslabonDocumento } from './documentos';

/**
 * Cadena del documento (Figma `CadenaDocumento` 680:409052 + `EslabonDocumento`
 * 680:408881): venta → factura → pagos → devolución → nota crédito, o pedido
 * → venta, u orden de compra → factura de compra → entrada → CxP → pagos.
 *
 * Escritorio: fila con flechas; móvil: lista vertical con conector. El
 * documento que se ve lleva `aria-current="page"` y borde de marca; uno que
 * aún no existe (`pendiente`) va punteado con su acción («Crear devolución»).
 *
 * Los datos llegan del route handler del detalle (un solo pedido); fechas e
 * importes ya formateados en la zona y la moneda de la organización.
 */
export interface CadenaDocumentoProps {
  eslabones: readonly EslabonDocumento[];
  /** Ordena por tipo (por defecto). `false` respeta el orden recibido. */
  ordenar?: boolean;
  etiqueta?: string;
  className?: string;
}

function Eslabon({ e }: { e: EslabonDocumento }) {
  const t = useKitT();
  const Icono = ICONO_DOCUMENTO[e.tipo];
  const nombreTipo = t(`documento.tipos.${e.tipo}`);
  const numero = e.href ? (
    <Link
      href={e.href}
      className="truncate rounded text-sm font-medium tabular-nums text-fg underline-offset-2 hover:text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {e.numero}
    </Link>
  ) : e.onClick ? (
    <button
      type="button"
      onClick={e.onClick}
      className="truncate rounded text-left text-sm font-medium tabular-nums text-fg underline-offset-2 hover:text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {e.numero}
    </button>
  ) : (
    <span className="truncate text-sm font-medium tabular-nums text-fg">{e.numero}</span>
  );
  const meta = [e.fecha, e.importe].filter(Boolean).join(' · ');
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-start gap-2.5 rounded-lg border px-3 py-2.5 lg:min-w-[168px]',
        e.actual ? 'border-line-brand bg-brand-tint' : e.pendiente ? 'border-dashed border-line-strong bg-surface' : 'border-line bg-surface',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          e.pendiente ? 'bg-subtle text-fg-muted' : 'bg-brand-tint text-brand',
          e.actual && 'bg-surface',
        )}
      >
        <Icono className="size-4" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs text-fg-secondary">
          {nombreTipo}
          {e.actual && <span className="sr-only"> · {t('documento.actual')}</span>}
        </span>
        {e.pendiente ? (
          e.accion ? (
            <button
              type="button"
              onClick={e.accion.onClick}
              className="inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              {e.accion.etiqueta}
            </button>
          ) : (
            <span className="text-sm text-fg-muted">{e.numero}</span>
          )
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {numero}
            {e.estado && <StatusBadge estado={e.estado} tamano="sm" />}
          </div>
        )}
        {meta && <span className="truncate text-xs tabular-nums text-fg-muted">{meta}</span>}
      </div>
    </div>
  );
}

export function CadenaDocumento({ eslabones, ordenar = true, etiqueta, className }: CadenaDocumentoProps) {
  const t = useKitT();
  const lista = ordenar ? ordenarCadena(eslabones) : [...eslabones];
  if (lista.length === 0) return null;
  return (
    <nav aria-label={etiqueta ?? t('documento.cadena')} className={cn('min-w-0', className)}>
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-x-auto lg:pb-1">
        {lista.map((e, i) => (
          <li key={e.id} aria-current={e.actual ? 'page' : undefined} className="relative flex min-w-0 lg:flex-1 lg:items-center">
            {/* Conector vertical en móvil */}
            {i > 0 && <span aria-hidden="true" className="absolute -top-2 left-[27px] h-2 w-px bg-line-strong lg:hidden" />}
            <Eslabon e={e} />
            {i < lista.length - 1 && (
              <ChevronRight aria-hidden="true" className="mx-1 hidden size-4 shrink-0 text-fg-muted lg:block" strokeWidth={1.5} />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
