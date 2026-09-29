'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import type { DocumentoMovimiento } from '@/lib/inventario/nucleo/tipos';

/**
 * Enlace al documento que explica un movimiento de kardex («Venta FACT-1605»,
 * «Ajuste AJ-147», «Factura de compra COMP-2026-0055»). El número y la ruta los
 * resuelve el servidor (`fn_inv_documentos`, en lote con
 * `useDocumentosMovimiento`); si el documento no existe o no es de la
 * organización, se muestra el tipo sin enlace.
 *
 * ```tsx
 * const docs = useDocumentosMovimiento(orgId, movimientos);
 * <EnlaceDocumento documento={docs.de(mov)} />
 * ```
 */
export interface EnlaceDocumentoProps {
  documento: DocumentoMovimiento | null | undefined;
  /** Mientras resuelve: muestra el tipo en gris sin enlace. */
  cargando?: boolean;
  className?: string;
}

export function EnlaceDocumento({ documento, cargando, className }: EnlaceDocumentoProps) {
  const t = useTranslations('inventario.documentos');
  if (!documento) return <span className={cn('text-sm text-fg-muted', className)}>{t('otro')}</span>;
  const tipo = t.has(documento.tipo) ? t(documento.tipo) : t('otro');
  const texto = documento.numero ? `${tipo} ${documento.numero}` : tipo;

  if (!documento.ruta || cargando) {
    return (
      <span
        className={cn('text-sm', cargando ? 'text-fg-muted' : 'text-fg-secondary', className)}
        title={!cargando && documento.source_id && !documento.ruta && documento.tipo !== 'producto' ? t('sinAcceso') : undefined}
      >
        {texto}
      </span>
    );
  }

  return (
    <Link
      href={documento.ruta}
      aria-label={t('abrir', { documento: texto })}
      className={cn(
        'inline-flex max-w-full items-center gap-1 text-sm font-medium text-brand hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-sm',
        className,
      )}
    >
      <span className="truncate">{texto}</span>
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
    </Link>
  );
}
