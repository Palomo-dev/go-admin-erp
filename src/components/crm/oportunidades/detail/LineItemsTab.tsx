'use client';

import type { ComponentType } from 'react';
import { BedDouble, FileText, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import type { OpportunityCustomLine, OpportunityProduct, OpportunitySpace } from '../types';

/** Pestañas Productos / Espacios / Conceptos del detalle (misma UI, extraída de OpportunityDetail). */
interface Item { id: string; title: string; subtitle: string; total: number }

const KINDS: Record<'products' | 'spaces' | 'custom', { icon: ComponentType<{ className?: string }>; empty: string; subtotal: string; tone: string }> = {
  products: { icon: Package, empty: 'No hay productos cotizados', subtotal: 'Subtotal productos', tone: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  spaces: { icon: BedDouble, empty: 'No hay espacios cotizados', subtotal: 'Subtotal espacios', tone: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  custom: { icon: FileText, empty: 'No hay conceptos personalizados', subtotal: 'Subtotal conceptos', tone: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
};

export function toItems(kind: 'products' | 'spaces' | 'custom', rows: Array<OpportunityProduct | OpportunitySpace | OpportunityCustomLine>): Item[] {
  return rows.map((r) => {
    if (kind === 'products') { const p = r as OpportunityProduct; return { id: p.id, title: p.product?.name || 'Producto', subtitle: `${p.quantity} x ${formatCurrency(p.unit_price)}`, total: p.total_price || 0 }; }
    if (kind === 'spaces') { const s = r as OpportunitySpace & { space?: { label?: string } }; return { id: s.id, title: s.space?.label || 'Espacio', subtitle: `${s.nights} noche${s.nights !== 1 ? 's' : ''} x ${formatCurrency(s.unit_price)}`, total: s.total_price || 0 }; }
    const c = r as OpportunityCustomLine;
    return { id: c.id, title: c.concept, subtitle: `${c.quantity} x ${formatCurrency(c.unit_price)}`, total: c.total_price || 0 };
  });
}

export function LineItemsTab({ kind, items }: { kind: 'products' | 'spaces' | 'custom'; items: Item[] }) {
  const cfg = KINDS[kind];
  const Icon = cfg.icon;
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="pt-6">
        {items.length === 0 ? (
          <div className="text-center py-8"><Icon className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" /><p className="text-sm text-gray-500 dark:text-gray-400">{cfg.empty}</p></div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.tone}`}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0"><p className="font-medium text-sm text-gray-900 dark:text-white truncate">{it.title}</p><p className="text-xs text-gray-500 dark:text-gray-400">{it.subtitle}</p></div>
                </div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white shrink-0">{formatCurrency(it.total)}</p>
              </div>
            ))}
            <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="font-bold text-sm text-gray-900 dark:text-white">{cfg.subtotal}</span>
              <span className="font-bold text-sm text-gray-900 dark:text-white">{formatCurrency(subtotal)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
