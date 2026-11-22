'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { EnlaceLinea } from '@/lib/inventario/enlaceProducto';

/**
 * Nombre de un producto en una línea de pedido, venta o devolución (Figma `2724:191376`):
 * enlace real (`<a>`: Ctrl/⌘ + clic abre otra pestaña) en el color de enlace con «↗»;
 * eliminado, texto con «Producto eliminado»; ítem libre, texto.
 */
export function EnlaceFichaProducto({
  nombre,
  enlace,
  className,
}: {
  nombre: string;
  enlace: EnlaceLinea;
  className?: string;
}) {
  const t = useTranslations('detallesMarca.producto');
  if (enlace.tipo === 'enlace') {
    return (
      <Link
        href={enlace.href}
        onClick={(e) => e.stopPropagation()}
        title={t('abrirFicha')}
        className={cn(
          'inline-flex min-w-0 items-center gap-1 rounded font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          className,
        )}
      >
        <span className="truncate">{nombre}</span>
        <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      </Link>
    );
  }
  return (
    <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-x-2 font-medium text-fg', className)}>
      <span className="truncate">{nombre}</span>
      {enlace.tipo === 'eliminado' && <SelloProductoEliminado />}
    </span>
  );
}

/** «Producto eliminado», el mismo sello en las tres pantallas. */
export function SelloProductoEliminado() {
  const t = useTranslations('detallesMarca.producto');
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-line bg-subtle px-2 text-[11px] font-medium text-fg-secondary">
      {t('eliminado')}
    </span>
  );
}
