'use client';

import type { SyntheticEvent } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import { useKitT } from '../useIdiomaKit';
import { ICONO_DOCUMENTO, type TipoDocumento } from './documentos';

/**
 * Chip de un documento relacionado (Figma `ChipDocumento` 680:406423 y los 5
 * tipos de `729:18827…18863`): icono del tipo + número. Va en la columna
 * «Documentos» de ventas y CxC y en los enlaces de un detalle. El nombre
 * accesible dice el tipo («Factura FV-00042»), no solo el número.
 */
export interface ChipDocumentoProps {
  tipo: TipoDocumento;
  numero: string;
  href?: string;
  onClick?: () => void;
  /** Tachado y atenuado (documento anulado). */
  anulado?: boolean;
  tamano?: 'sm' | 'md';
  className?: string;
}

export function ChipDocumento({ tipo, numero, href, onClick, anulado, tamano = 'sm', className }: ChipDocumentoProps) {
  const t = useKitT();
  const Icono = ICONO_DOCUMENTO[tipo];
  const nombreTipo = t(`documento.tipos.${tipo}`);
  const etiqueta = anulado ? t('documento.chipAnulado', { tipo: nombreTipo, numero }) : `${nombreTipo} ${numero}`;
  const clases = cn(
    'inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-surface font-medium text-fg-secondary',
    tamano === 'sm' ? 'h-6 px-1.5 text-xs' : 'h-7 px-2 text-[13px]',
    (href || onClick) && 'hover:border-line-strong hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    anulado && 'text-fg-muted line-through',
    className,
  );
  const contenido = (
    <>
      <Icono aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
      <span className="truncate tabular-nums">{numero}</span>
    </>
  );
  const detener = (e: SyntheticEvent) => e.stopPropagation();
  if (href) {
    return (
      <Link href={href} aria-label={etiqueta} title={etiqueta} onClick={detener} className={clases}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        aria-label={etiqueta}
        title={etiqueta}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={clases}
      >
        {contenido}
      </button>
    );
  }
  return (
    <span title={etiqueta} className={clases}>
      <span className="sr-only">{anulado ? etiqueta : nombreTipo}</span>
      <span aria-hidden={anulado || undefined} className="contents">
        {contenido}
      </span>
    </span>
  );
}
