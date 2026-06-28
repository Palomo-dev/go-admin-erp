'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe, ShoppingBag, TrendingUp } from 'lucide-react';

interface WebTopProduct {
  product_name: string;
  total_qty: number;
  total_revenue: number;
  orders_count: number;
}

interface WebConversionData {
  total_orders: number;
  confirmed_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  total_revenue: number;
  conversion_rate: number;
}

interface WebSalesCardsProps {
  organizationId: number;
  dateFrom: string;
  dateTo: string;
  refreshKey?: number;
  isRefreshing?: boolean;
}

export function WebTopProductosCard({ organizationId, dateFrom, dateTo, refreshKey, isRefreshing }: WebSalesCardsProps) {
  const [products, setProducts] = useState<WebTopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_web_top_products', {
          p_organization_id: organizationId,
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_limit: 10,
        });
        if (!error && data) {
          setProducts(data);
        } else {
          setProducts([]);
        }
      } catch {
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [organizationId, dateFrom, dateTo, refreshKey]);

  if (isLoading || isRefreshing) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-48" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full mb-2" />
        ))}
      </div>
    );
  }

  const maxQty = products.length > 0 ? Math.max(...products.map((p) => p.total_qty)) : 1;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <Globe className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Top Productos Web
        </h3>
      </div>

      {products.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
          No hay ventas web en este período
        </p>
      ) : (
        <div className="space-y-3">
          {products.map((product, idx) => (
            <div key={idx} className="relative">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                    {product.product_name}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {product.total_qty} uds
                  </span>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    ${Number(product.total_revenue).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 dark:bg-purple-400 rounded-full transition-all"
                  style={{ width: `${(product.total_qty / maxQty) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WebConversionCard({ organizationId, dateFrom, dateTo, refreshKey, isRefreshing }: WebSalesCardsProps) {
  const [data, setData] = useState<WebConversionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data: result, error } = await supabase.rpc('get_web_conversion_stats', {
          p_organization_id: organizationId,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        });
        if (!error && result && result.length > 0) {
          setData(result[0]);
        } else {
          setData(null);
        }
      } catch {
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [organizationId, dateFrom, dateTo, refreshKey]);

  if (isLoading || isRefreshing) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-20 w-full mb-3" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Conversión Web
          </h3>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
          No hay datos de conversión en este período
        </p>
      </div>
    );
  }

  const segments = [
    { label: 'Confirmados', value: data.confirmed_orders, color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
    { label: 'Pendientes', value: data.pending_orders, color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400' },
    { label: 'Cancelados', value: data.cancelled_orders, color: 'bg-red-400', textColor: 'text-red-500 dark:text-red-400' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
          <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Conversión Web
        </h3>
      </div>

      {/* Tasa de conversión principal */}
      <div className="text-center mb-4">
        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
          {data.conversion_rate.toFixed(1)}%
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Tasa de conversión (confirmados / total)
        </p>
      </div>

      {/* Barra de segmentos */}
      <div className="h-3 rounded-full overflow-hidden flex mb-3">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{ width: `${data.total_orders > 0 ? (seg.value / data.total_orders) * 100 : 0}%` }}
          />
        ))}
      </div>

      {/* Detalle */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {segments.map((seg) => (
          <div key={seg.label}>
            <p className={`text-sm font-bold ${seg.textColor}`}>{seg.value}</p>
            <p className="text-[10px] text-gray-400">{seg.label}</p>
          </div>
        ))}
      </div>

      {/* Total y revenue */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">{data.total_orders} pedidos web</span>
        </div>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          ${Number(data.total_revenue).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
