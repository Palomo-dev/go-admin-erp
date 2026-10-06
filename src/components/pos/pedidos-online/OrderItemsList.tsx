'use client';

import { useTranslations } from 'next-intl';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { WebOrderItem } from '@/lib/services/webOrdersService';

interface OrderItemsListProps {
  items: WebOrderItem[];
  variant?: 'full' | 'compact' | 'summary';
  maxItems?: number;
  showStatus?: boolean;
}

const ITEM_STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  preparing: { label: 'Preparando', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  ready: { label: 'Listo', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
};

export function OrderItemsList({ 
  items, 
  variant = 'full',
  maxItems,
  showStatus = false 
}: OrderItemsListProps) {
  const t = useTranslations('pedidoWeb');
  const { formatear } = useMonedaOrganizacion();
  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  const remainingCount = maxItems && items.length > maxItems ? items.length - maxItems : 0;

  if (variant === 'summary') {
    return (
      <div className="text-sm">
        <p className="text-muted-foreground dark:text-gray-400 mb-1">
          {items.length} producto(s)
        </p>
        <div className="space-y-1 max-h-20 overflow-y-auto">
          {displayItems.map((item, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="break-words whitespace-normal dark:text-gray-200">{item.quantity}x {item.product_name}</span>
              <span className="text-muted-foreground dark:text-gray-400">${item.total.toLocaleString()}</span>
            </div>
          ))}
          {remainingCount > 0 && (
            <p className="text-xs text-muted-foreground dark:text-gray-400">+{remainingCount} más...</p>
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
            +{remainingCount} producto(s) más
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-fg">{item.product_name}</p>
              {showStatus && (
                <span className="rounded-full bg-subtle px-2 text-[11px] font-medium leading-5 text-fg-secondary">
                  {ITEM_STATUS_CONFIG[item.status].label}
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
            {item.notes && <p className="mt-0.5 text-[11px] text-fg">{t('notas.notaCocina', { nota: item.notes })}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-fg-muted tabular-nums">{item.quantity} × {formatear(item.unit_price)}</p>
            <p className="text-[13px] font-semibold text-fg tabular-nums">{formatear(item.total)}</p>
          </div>
        </div>
      ))}
      {remainingCount > 0 && (
        <p className="py-2 text-center text-sm text-fg-secondary">+{remainingCount} producto(s) más</p>
      )}
    </div>
  );
}
