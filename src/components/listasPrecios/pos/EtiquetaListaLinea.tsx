'use client';

/**
 * Insignia de una línea del carrito con precio de lista (Figma «05 POS y ventas» 07):
 * «Lista Mayoristas · 12+», «−10 %», «Bebidas», con el precio normal tachado.
 */
import { useTranslations } from 'next-intl';
import { Tags } from 'lucide-react';
import { CartTag } from '@/components/kit';
import type { CartItem } from '@/components/pos/types';

export function EtiquetaListaLinea({ item, formatear }: { item: CartItem; formatear: (n: number) => string }) {
  const t = useTranslations('listasPrecios.pos');
  if (!item.price_list_id) return null;
  const d = item.price_list_detail;
  const detalle = !d
    ? null
    : d.minQty
      ? t('detalle.escalon', { n: d.minQty })
      : d.fuente === 'item'
        ? null
        : d.porcentaje
          ? `${d.porcentaje > 0 ? '+' : '−'}${Math.abs(d.porcentaje)} %`
          : d.etiqueta;
  const normal = item.list_base_price;
  return (
    <CartTag
      tono="informacion"
      icono={Tags}
      anchoMaximo={240}
      titulo={normal != null ? t('normalTitulo', { precio: formatear(normal) }) : undefined}
    >
      <span>
        {detalle ? t('linea', { lista: item.price_list_name ?? '', detalle }) : t('lineaSola', { lista: item.price_list_name ?? '' })}
        {normal != null && normal !== item.unit_price && (
          <>
            {' · '}
            <s className="opacity-70">{formatear(normal)}</s>
          </>
        )}
      </span>
    </CartTag>
  );
}
