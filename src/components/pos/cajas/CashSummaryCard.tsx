'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Wallet, RotateCcw, Coins, UserCircle, Store, Globe, EyeOff, Receipt, ArrowDownCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { useTranslations } from 'next-intl';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { CajasService } from './CajasService';
import { useBlindCloseMode } from './useBlindCloseMode';
import type { CashSession, CashSummary } from './types';
import { useEtiquetaMetodoPago } from './paymentMethodLabels';

interface CashSummaryCardProps {
  session: CashSession;
  refreshTrigger?: number; // Para forzar actualización desde componente padre
}

export function CashSummaryCard({ session, refreshTrigger }: CashSummaryCardProps) {
  const t = useTranslations('cajas.detalle');
  const localeIntl = useLocaleIntl();
  const { timezone } = useFormatDate();
  const formatDateTime = (value: string | Date | null | undefined) =>
    formatDateTimeInTz(value, timezone, { locale: localeIntl });
  const getPaymentMethodLabel = useEtiquetaMetodoPago();
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { showExpected } = useBlindCloseMode();

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CajasService.getCashSummary(session.id);
      setSummary(data);
    } catch (error) {
      console.error('Error loading cash summary:', error);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshTrigger]);

  if (loading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg dark:text-white text-gray-900">
            {t('resumenCaja.titulo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg dark:text-white text-gray-900">
            {t('resumenCaja.titulo')}
          </CardTitle>
          <Badge
            variant={session.status === 'open' ? "default" : "secondary"}
            className={session.status === 'open' 
              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300" 
              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
            }
          >
            {session.status === 'open' ? t('resumenCaja.abierta') : t('resumenCaja.cerrada')}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Información de la sesión */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="dark:text-gray-400 text-gray-600">{t('resumenCaja.abiertaEl')}</span>
            <p className="font-medium dark:text-white text-gray-900">
              {formatDateTime(session.opened_at)}
            </p>
          </div>
          {session.closed_at && (
            <div>
              <span className="dark:text-gray-400 text-gray-600">{t('resumenCaja.cerradaEl')}</span>
              <p className="font-medium dark:text-white text-gray-900">
                {formatDateTime(session.closed_at)}
              </p>
            </div>
          )}
        </div>

        {/* Info de cajero y sucursal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            <UserCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs dark:text-gray-400 text-gray-500">{t('resumenCaja.cajero')}</p>
              <p className="text-sm font-medium dark:text-white text-gray-900 break-words whitespace-normal">
                {session.opened_by_name || t('resumenCaja.usuario')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            {session.branch_id ? (
              <Store className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            ) : (
              <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs dark:text-gray-400 text-gray-500">{t('resumenCaja.sucursal')}</p>
              <p className="text-sm font-medium dark:text-white text-gray-900 break-words whitespace-normal">
                {session.branch_name || (session.branch_id ? `#${session.branch_id}` : t('resumenCaja.todasSucursales'))}
              </p>
            </div>
          </div>
        </div>

        <Separator className="dark:bg-gray-700 bg-gray-200" />

        {summary && (
          <>
            {/* Resumen de movimientos */}
            <div className="grid grid-cols-2 gap-4">
              {/* Monto inicial */}
              <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
                  <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.inicial')}</p>
                  <p className="font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(summary.initial_amount)}
                  </p>
                </div>
              </div>

              {/* Ventas en efectivo */}
              <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-800 rounded-full">
                  <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.ventasEfectivo')}</p>
                  <p className="font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary.sales_cash)}
                  </p>
                </div>
              </div>

              {/* Ventas totales (todos los métodos) */}
              <div className="flex items-center space-x-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-emerald-100 dark:bg-emerald-800 rounded-full">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.ventasTotales')}</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(summary.sales_total ?? summary.sales_cash)}
                  </p>
                </div>
              </div>

              {/* Ingresos */}
              <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-800 rounded-full">
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.ingresos')}</p>
                  <p className="font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary.cash_in)}
                  </p>
                </div>
              </div>

              {/* Egresos */}
              <div className="flex items-center space-x-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-800 rounded-full">
                  <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.egresos')}</p>
                  <p className="font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(summary.cash_out)}
                  </p>
                </div>
              </div>

              {/* Vuelto entregado */}
              {summary.change_total > 0 && (
                <div className="flex items-center space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="flex-shrink-0 p-2 bg-orange-100 dark:bg-orange-800 rounded-full">
                    <Coins className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.vuelto')}</p>
                    <p className="font-bold text-orange-600 dark:text-orange-400">
                      -{formatCurrency(summary.change_total)}
                    </p>
                  </div>
                </div>
              )}

              {/* Recibos de caja (abonos a cuentas por cobrar) */}
              {summary.cash_receipts_total > 0 && (
                <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
                    <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.recibosCaja')}</p>
                    <p className="font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(summary.cash_receipts_total)}
                    </p>
                  </div>
                </div>
              )}

              {/* Pagos a proveedores (cuentas por pagar) */}
              {summary.purchases_total > 0 && (
                <div className="flex items-center space-x-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-800 rounded-full">
                    <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.pagosProveedores')}</p>
                    <p className="font-bold text-red-600 dark:text-red-400">
                      -{formatCurrency(summary.purchases_total)}
                    </p>
                  </div>
                </div>
              )}

              {/* Devoluciones */}
              {summary.returns_total > 0 && (
                <div className="flex items-center space-x-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-800 rounded-full">
                    <RotateCcw className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm dark:text-gray-300 text-gray-600">{t('resumenCaja.devoluciones')}</p>
                    <p className="font-bold text-red-600 dark:text-red-400">
                      -{formatCurrency(summary.returns_total)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Desglose por método de pago */}
            {summary.income_by_method && Object.keys(summary.income_by_method).length > 0 && (
              <>
                <Separator className="dark:bg-gray-700 bg-gray-200" />
                <div>
                  <p className="text-sm font-medium dark:text-gray-200 text-gray-700 mb-2">
                    {t('resumenCaja.pagosPorMetodo')}
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(summary.income_by_method).map(([method, amount]) => {
                      return (
                        <div key={method} className="flex justify-between items-center text-sm">
                          <span className="dark:text-gray-400 text-gray-600">
                            {getPaymentMethodLabel(method)}
                          </span>
                          <span className="font-medium dark:text-white text-gray-900">
                            {formatCurrency(amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Desglose de VENTAS por método de pago (solo ventas, sin abonos ni compras) */}
            {summary.sales_by_method && Object.keys(summary.sales_by_method).length > 0 && (
              <>
                <Separator className="dark:bg-gray-700 bg-gray-200" />
                <div>
                  <p className="text-sm font-medium dark:text-gray-200 text-gray-700 mb-2">
                    {t('resumenCaja.ventasPorMetodo')}
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(summary.sales_by_method).map(([method, amount]) => {
                      return (
                        <div key={method} className="flex justify-between items-center text-sm">
                          <span className="dark:text-gray-400 text-gray-600">
                            {getPaymentMethodLabel(method)}
                          </span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(method === 'cash' ? amount - (summary.change_total || 0) : amount)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center text-sm pt-1.5 border-t dark:border-gray-700 border-gray-200">
                      <span className="font-medium dark:text-gray-200 text-gray-700">{t('resumenCaja.totalVentas')}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(summary.sales_total ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Desglose de pagos a proveedores por método */}
            {summary.purchases_by_method && Object.keys(summary.purchases_by_method).length > 0 && (
              <>
                <Separator className="dark:bg-gray-700 bg-gray-200" />
                <div>
                  <p className="text-sm font-medium dark:text-gray-200 text-gray-700 mb-2">
                    {t('resumenCaja.pagosProveedoresPorMetodo')}
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(summary.purchases_by_method).map(([method, amount]) => (
                      <div key={method} className="flex justify-between items-center text-sm">
                        <span className="dark:text-gray-400 text-gray-600">
                          {getPaymentMethodLabel(method)}
                        </span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          -{formatCurrency(amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator className="dark:bg-gray-700 bg-gray-200" />

            {/* Total esperado */}
            {showExpected ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium dark:text-gray-200 text-gray-700">
                    {t('resumenCaja.totalEsperado')}
                  </span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(summary.expected_amount)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <p className="text-sm text-purple-700 dark:text-purple-400">
                  {t('comun.cierreCiegoActivo')}
                </p>
              </div>
            )}

            {/* Si la caja está cerrada, mostrar información del arqueo */}
            {session.status === 'closed' && summary.counted_amount !== undefined && showExpected && (
              <>
                <Separator className="dark:bg-gray-700 bg-gray-200" />
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium dark:text-gray-200 text-gray-700">
                      {t('resumenCaja.montoContado')}
                    </span>
                    <span className="font-bold dark:text-white text-gray-900">
                      {formatCurrency(summary.counted_amount)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium dark:text-gray-200 text-gray-700">
                      {t('resumenCaja.diferencia')}
                    </span>
                    <span className={`font-bold ${
                      summary.difference === 0 
                        ? 'text-gray-600 dark:text-gray-400'
                        : summary.difference! > 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                    }`}>
                      {summary.difference! >= 0 ? '+' : ''}{formatCurrency(summary.difference || 0)}
                    </span>
                  </div>
                  
                  {summary.difference !== 0 && (
                    <div className={`p-2 rounded text-center text-sm ${
                      summary.difference! > 0 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                    }`}>
                      {summary.difference! > 0 ? t('resumenCaja.sobrante') : t('resumenCaja.faltante')}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Notas de la sesión */}
            {session.notes && (
              <>
                <Separator className="dark:bg-gray-700 bg-gray-200" />
                <div>
                  <span className="text-sm font-medium dark:text-gray-200 text-gray-700 block mb-2">
                    {t('resumenCaja.observaciones')}
                  </span>
                  <p className="text-sm dark:text-gray-400 text-gray-600 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    {session.notes}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
