'use client';

import { useTranslations } from 'next-intl';
import { NombreLinea, type AjusteNombreLinea } from '@/components/kit/documento/NombreLinea';
import type { EnlaceLinea } from '@/lib/inventario/enlaceProducto';

/**
 * Nombre de un producto en una línea de pedido, venta o devolución (Figma `2724:191376`):
 * enlace real (`<a>`: Ctrl/⌘ + clic abre otra pestaña) en el color de enlace con «↗»;
 * eliminado, texto con «Producto eliminado»; ítem libre, texto.
 *
 * Lo pinta `NombreLinea` del kit (la misma pieza de las líneas de factura), así
 * un nombre largo no se monta sobre el total: `ajuste` decide si va en una
 * línea con «…» o en hasta tres (tarjetas de celular).
 */
export function EnlaceFichaProducto({
  nombre,
  enlace,
  ajuste = 'truncar',
  className,
}: {
  nombre: string;
  enlace: EnlaceLinea;
  ajuste?: AjusteNombreLinea;
  className?: string;
}) {
  const t = useTranslations('detallesMarca.producto');
  if (enlace.tipo === 'enlace') {
    return <NombreLinea nombre={nombre} href={enlace.href} titulo={t('abrirFicha')} ajuste={ajuste} className={className} />;
  }
  return (
    <NombreLinea nombre={nombre} ajuste={ajuste} className={className}>
      {enlace.tipo === 'eliminado' && <SelloProductoEliminado />}
    </NombreLinea>
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
