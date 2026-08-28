'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Package,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Boxes,
  Timer,
} from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Panel de observabilidad de comercio web (F11.7).
 *
 * Muestra:
 *  1. Stock reservado vs disponible por sucursal, con alerta de reservas
 *     huérfanas (>24h sin moverse).
 *  2. Pedidos pendientes próximos a expirar.
 *
 * Se alimenta del endpoint GET /api/web-orders/observability.
 * Es colapsable para no estorbar el flujo principal de pedidos.
 */

interface ReservedStockItem {
  productId: number;
  productName: string;
  sku: string | null;
  branchId: number;
  branchName: string;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
  updatedAt: string;
  isOrphan: boolean;
}

interface OrderNearExpiry {
  id: string;
  orderNumber: string;
  organizationId: number;
  branchId: number;
  branchName: string | null;
  paymentMethod: string;
  total: number;
  customerName: string | null;
  createdAt: string;
  expiresAt: string;
  minutesUntilExpiry: number;
  effectiveExpirationMinutes: number;
  isNearExpiry: boolean;
}

interface ObservabilityData {
  summary: {
    totalReservedItems: number;
    totalReservedUnits: number;
    orphanReservations: number;
    pendingOrdersCount: number;
    ordersNearExpiryCount: number;
  };
  reservedStock: ReservedStockItem[];
  ordersNearExpiry: OrderNearExpiry[];
  withinMinutes: number;
  timestamp: string;
}

interface WebCommerceObservabilityProps {
  /** ID de organización. Si se omite, se lee de la sesión activa. */
  organizationId?: number;
  /** Minutos hacia adelante para considerar "próximo a expirar". */
  withinMinutes?: number;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-CO')}`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `hace ${hours}h ${mins}m`;
  return `hace ${mins}m`;
}

export function WebCommerceObservability({
  organizationId,
  withinMinutes = 30,
}: WebCommerceObservabilityProps) {
  const [data, setData] = useState<ObservabilityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = organizationId ?? getOrganizationId();

  const fetchData = useCallback(async () => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/web-orders/observability?organization_id=${orgId}&within_minutes=${withinMinutes}`
      );
      if (!res.ok) throw new Error('Error al cargar observabilidad');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, withinMinutes]);

  useEffect(() => {
    fetchData();
    // Refrescar cada 60s mientras esté expandido
    if (!isExpanded) return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData, isExpanded]);

  const hasAlerts =
    (data?.summary.orphanReservations ?? 0) > 0 ||
    (data?.summary.ordersNearExpiryCount ?? 0) > 0;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Boxes className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Observabilidad de comercio
            {hasAlerts && (
              <Badge variant="destructive" className="ml-1 gap-1">
                <AlertTriangle className="h-3 w-3" />
                {data!.summary.orphanReservations + data!.summary.ordersNearExpiryCount} alertas
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? 'Contraer' : 'Expandir'}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Resumen siempre visible */}
      <CardContent className="pt-0">
        {isLoading && !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryTile
              icon={<Package className="h-4 w-4" />}
              label="Items reservados"
              value={data!.summary.totalReservedItems}
              sub={`${data!.summary.totalReservedUnits} unidades`}
              color="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
            />
            <SummaryTile
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Reservas huérfanas"
              value={data!.summary.orphanReservations}
              sub=">24h sin moverse"
              color={
                data!.summary.orphanReservations > 0
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                  : 'text-gray-500 bg-gray-50 dark:bg-gray-700/30'
              }
            />
            <SummaryTile
              icon={<Clock className="h-4 w-4" />}
              label="Pedidos pendientes"
              value={data!.summary.pendingOrdersCount}
              sub="esperando pago"
              color="text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
            />
            <SummaryTile
              icon={<Timer className="h-4 w-4" />}
              label="Próximos a expirar"
              value={data!.summary.ordersNearExpiryCount}
              sub={`en ${withinMinutes} min`}
              color={
                data!.summary.ordersNearExpiryCount > 0
                  ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
                  : 'text-gray-500 bg-gray-50 dark:bg-gray-700/30'
              }
            />
          </div>
        )}

        {/* Detalle colapsable */}
        {isExpanded && data && (
          <div className="mt-4 space-y-4">
            {/* Stock reservado vs disponible */}
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                Stock reservado vs disponible
              </h4>
              {data.reservedStock.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay productos con stock reservado actualmente.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3">Producto</th>
                        <th className="py-1.5 pr-3">Sucursal</th>
                        <th className="py-1.5 pr-3 text-right">Disp.</th>
                        <th className="py-1.5 pr-3 text-right">Reserv.</th>
                        <th className="py-1.5 pr-3 text-right">Total</th>
                        <th className="py-1.5">Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reservedStock.map((item) => (
                        <tr
                          key={`${item.productId}-${item.branchId}`}
                          className={`border-b border-gray-100 dark:border-gray-800 ${
                            item.isOrphan ? 'bg-red-50 dark:bg-red-900/10' : ''
                          }`}
                        >
                          <td className="py-1.5 pr-3 font-medium">
                            {item.productName}
                            {item.sku && (
                              <span className="text-muted-foreground ml-1">
                                ({item.sku})
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3">{item.branchName}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {item.qtyAvailable}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                            {item.qtyReserved}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                            {item.qtyOnHand}
                          </td>
                          <td className="py-1.5">
                            <span
                              className={
                                item.isOrphan
                                  ? 'text-red-600 dark:text-red-400 font-medium'
                                  : 'text-muted-foreground'
                              }
                            >
                              {formatTimeAgo(item.updatedAt)}
                              {item.isOrphan && ' ⚠'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pedidos próximos a expirar */}
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Timer className="h-4 w-4" />
                Pedidos próximos a expirar ({withinMinutes} min)
              </h4>
              {data.ordersNearExpiry.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay pedidos próximos a expirar en los próximos {withinMinutes} minutos.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {data.ordersNearExpiry.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{order.orderNumber}</span>
                        {order.customerName && (
                          <span className="text-muted-foreground">
                            · {order.customerName}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          · {order.paymentMethod}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(order.total)}
                        </span>
                        <Badge
                          variant={
                            order.minutesUntilExpiry <= 5
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {order.minutesUntilExpiry < 0
                            ? `Expirado hace ${Math.abs(order.minutesUntilExpiry)}m`
                            : `${order.minutesUntilExpiry}m`}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className={`inline-flex items-center justify-center w-7 h-7 rounded-md mb-1.5 ${color}`}>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
