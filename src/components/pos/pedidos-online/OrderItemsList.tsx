'use client';

import { Badge } from '@/components/ui/badge';
import type { WebOrderItem } from '@/lib/services/webOrdersService';

interface OrderItemsListProps {
  items: WebOrderItem[];
  variant?: 'full' | 'compact' | 'summary';
  maxItems?: number;
  showStatus?: boolean;
}

const ITEM_STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  preparing: { label: 'Preparando', color: 'bg-orange-100 text-orange-800' },
  ready: { label: 'Listo', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export function OrderItemsList({ 
  items, 
  variant = 'full',
  maxItems,
  showStatus = false 
}: OrderItemsListProps) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  const remainingCount = maxItems && items.length > maxItems ? items.length - maxItems : 0;

  if (variant === 'summary') {
    return (
      <div className="text-sm">
        <p className="text-muted-foreground mb-1">
          {items.length} producto(s)
        </p>
        <div className="space-y-1 max-h-20 overflow-y-auto">
          {displayItems.map((item, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="truncate">{item.quantity}x {item.product_name}</span>
              <span className="text-muted-foreground">${item.total.toLocaleString()}</span>
            </div>
          ))}
          {remainingCount > 0 && (
            <p className="text-xs text-muted-foreground">+{remainingCount} más...</p>
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
              <span className="font-medium text-muted-foreground">{item.quantity}x</span>
              <span className="truncate max-w-[200px]">{item.product_name}</span>
            </div>
            <span className="font-medium">${item.total.toLocaleString()}</span>
          </div>
        ))}
        {remainingCount > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            +{remainingCount} producto(s) más
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayItems.map((item) => (
        <div 
          key={item.id} 
          className="flex items-start justify-between py-3 border-b last:border-0"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{item.product_name}</p>
              {showStatus && (
                <Badge className={`${ITEM_STATUS_CONFIG[item.status].color} text-xs`}>
                  {ITEM_STATUS_CONFIG[item.status].label}
                </Badge>
              )}
            </div>
            {item.product_sku && (
              <p className="text-sm text-muted-foreground">SKU: {item.product_sku}</p>
            )}
            {item.notes && (
              <p className="text-sm text-yellow-600 mt-1">📝 {item.notes}</p>
            )}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {item.modifiers.map((mod: any, idx: number) => (
                  <p key={idx} className="text-sm text-muted-foreground">
                    + {mod.name} {mod.price > 0 && `(+$${mod.price.toLocaleString()})`}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="text-right ml-4">
            <p className="text-sm text-muted-foreground">
              {item.quantity} x ${item.unit_price.toLocaleString()}
            </p>
            <p className="font-medium">${item.total.toLocaleString()}</p>
          </div>
        </div>
      ))}
      {remainingCount > 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          +{remainingCount} producto(s) más
        </p>
      )}
    </div>
  );
}
