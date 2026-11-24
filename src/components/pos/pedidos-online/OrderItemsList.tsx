'use client';

import { useTranslations } from 'next-intl';
import { ImageIcon } from 'lucide-react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { enlaceLineaProducto, type ProductoDeLinea } from '@/lib/inventario/enlaceProducto';
import { EnlaceFichaProducto } from '@/components/inventario/productos/EnlaceFichaProducto';
import type { WebOrderItem } from '@/lib/services/webOrdersService';
import { claveEstadoPedido, claveRubro } from '@/lib/pos/pedidosWeb/rubroPedidos';
import { useRubroPedidos } from './rubroPedidosUi';

/** Producto de una línea: estado y padre (para el enlace) y la miniatura ya resuelta. */
export type ProductoLineaConImagen = ProductoDeLinea & { imagenUrl?: string | null };

interface OrderItemsListProps {
  items: WebOrderItem[];
  variant?: 'full' | 'compact' | 'summary';
  maxItems?: number;
  showStatus?: boolean;
  /** Quitar o restaurar la promoción de la línea. Sin permiso, no se muestra. */
  puedeQuitarPromocion?: boolean;
  onQuitarPromocion?: (itemId: string) => void;
  onRestaurarPromocion?: (itemId: string) => void;
  /**
   * Detalle (Figma `2725:192149`): productos de las líneas por id. Con él, cada línea lleva
   * miniatura de 44 px y el nombre enlaza a la ficha (`enlaceLineaProducto`).
   */
  productos?: ReadonlyMap<number, ProductoLineaConImagen>;
}

/** Miniatura de 44 px: la imagen principal o el marcador. */
function MiniaturaLinea({ url }: { url: string | null | undefined }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de 44 px desde storage público
    return <img src={url} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg border border-line object-cover" />;
  }
  return (
    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-subtle text-fg-muted">
      <ImageIcon className="size-4" strokeWidth={1.5} />
    </span>
  );
}

export function OrderItemsList({ 
  items, 
  variant = 'full',
  maxItems,
  showStatus = false,
  puedeQuitarPromocion = false,
  onQuitarPromocion,
  onRestaurarPromocion,
  productos,
}: OrderItemsListProps) {
  const t = useTranslations('pedidoWeb');
  // Una tienda no tiene cocina: «Alistando» y «Nota para alistar».
  const rubro = useRubroPedidos();
  const { formatear } = useMonedaOrganizacion();
  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  const remainingCount = maxItems && items.length > maxItems ? items.length - maxItems : 0;

  if (variant === 'summary') {
    return (
      <div className="text-sm">
        <p className="text-muted-foreground dark:text-gray-400 mb-1">
          {t('orderItemsList.productoS', { n: items.length })}
        </p>
        <div className="space-y-1 max-h-20 overflow-y-auto">
          {displayItems.map((item, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="break-words whitespace-normal dark:text-gray-200">{item.quantity}x {item.product_name}</span>
              <span className="text-muted-foreground dark:text-gray-400">${item.total.toLocaleString()}</span>
            </div>
          ))}
          {remainingCount > 0 && (
            <p className="text-xs text-muted-foreground dark:text-gray-400">{t('orderItemsList.mas', { remainingCount })}</p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-2">
        {displayItems.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm py-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground dark:text-gray-400">{item.quantity}x</span>
              <span className="break-words whitespace-normal dark:text-gray-200">{item.product_name}</span>
            </div>
            <span className="font-medium dark:text-gray-100">${item.total.toLocaleString()}</span>
          </div>
        ))}
        {remainingCount > 0 && (
          <p className="text-xs text-muted-foreground dark:text-gray-400 text-center">
            {t('orderItemsList.productoSMas', { remainingCount })}
          </p>
        )}
      </div>
    );
  }

  // Detalle (Figma 1981:175699): nombre y estado, SKU, modificadores y nota en
  // una línea cada uno; a la derecha «1 × $ 56.000» y el total de la línea.
  return (
    <div>
      {displayItems.map((item) => (
        <div key={item.id} className="flex items-start justify-between gap-4 border-b border-line py-3 first:pt-0 last:border-0">
          {productos && <MiniaturaLinea url={item.product_id != null ? productos.get(item.product_id)?.imagenUrl : null} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {productos ? (
                <EnlaceFichaProducto
                  nombre={item.product_name}
                  enlace={enlaceLineaProducto(item.product_id != null ? productos.get(item.product_id) ?? { id: item.product_id } : null)}
                  className="text-[13px] font-semibold"
                />
              ) : (
                <p className="text-[13px] font-semibold text-fg">{item.product_name}</p>
              )}
              {showStatus && (
                <span className="rounded-full bg-subtle px-2 text-[11px] font-medium leading-5 text-fg-secondary">
                  {t(`orderItemsList.estados.${claveEstadoPedido(item.status, rubro)}`)}
                </span>
              )}
            </div>
            {item.product_sku && <p className="text-[11px] text-fg-muted">SKU {item.product_sku}</p>}
            {item.modifiers && item.modifiers.length > 0 && (
              <p className="mt-0.5 text-[11px] text-fg-secondary">
                {(item.modifiers as Array<{ name?: string }>).map((mod) => `+ ${mod.name ?? ''}`).join(' · ')}
              </p>
            )}
            {/* Nota de cocina bajo la línea, en texto normal (Figma 1981:175699) */}
            {item.notes && <p className="mt-0.5 text-[11px] text-fg">{t(claveRubro('notas.notaCocina', rubro), { nota: item.notes })}</p>}
            {item.promo_excluded && <p className="mt-0.5 text-[11px] font-medium text-fg-secondary">{t('promocionLinea.sinPromocion')}</p>}
            {puedeQuitarPromocion && (item.promo_excluded ? (
              <button type="button" className="mt-1 text-[12px] font-medium text-brand hover:underline" onClick={() => onRestaurarPromocion?.(item.id)}>
                {t('promocionLinea.restaurar')}
              </button>
            ) : (
              <button type="button" className="mt-1 text-[12px] font-medium text-fg-secondary hover:underline" onClick={() => onQuitarPromocion?.(item.id)}>
                {t('promocionLinea.quitar')}
              </button>
            ))}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-fg-muted tabular-nums">{item.quantity} × {formatear(item.unit_price)}</p>
            <p className="text-[13px] font-semibold text-fg tabular-nums">{formatear(item.total)}</p>
          </div>
        </div>
      ))}
      {remainingCount > 0 && (
        <p className="py-2 text-center text-sm text-fg-secondary">{t('orderItemsList.productoSMas', { remainingCount })}</p>
      )}
    </div>
  );
}
