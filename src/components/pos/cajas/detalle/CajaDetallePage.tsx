'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  RefreshCw,
  Plus,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Receipt,
  Calculator,
  EyeOff,
  ArrowDownCircle
} from 'lucide-react';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency, cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { useTranslations } from 'next-intl';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { CajasService, type SessionSaleRow } from '../CajasService';
import { CierreCajaDialog } from '../CierreCajaDialog';
import { useBlindCloseMode } from '../useBlindCloseMode';
import type { CashSession, CashMovement, CashCount, CashSummary } from '../types';
import { useEtiquetaMetodoPago } from '../paymentMethodLabels';
import { toast } from 'sonner';

interface CajaDetallePageProps {
  sessionUuid: string;
}

export function CajaDetallePage({ sessionUuid }: CajaDetallePageProps) {
  const { organization, isLoading: orgLoading } = useOrganization();
  const t = useTranslations('cajas.detalle');
  const localeIntl = useLocaleIntl();
  const { timezone } = useFormatDate();
  const formatDateTime = (value: string | Date | null | undefined) =>
    formatDateTimeInTz(value, timezone, { locale: localeIntl });
  const getPaymentMethodLabel = useEtiquetaMetodoPago();
  const [session, setSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [counts, setCounts] = useState<CashCount[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [sales, setSales] = useState<SessionSaleRow[]>([]);
  const [paymentsByMethod, setPaymentsByMethod] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');
  const [showCierreDialog, setShowCierreDialog] = useState(false);
  const { showExpected } = useBlindCloseMode();

  const loadSessionData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [detail, salesData, paymentsData] = await Promise.all([
        CajasService.getSessionDetailByUuid(sessionUuid),
        CajasService.getSessionSalesByUuid(sessionUuid),
        CajasService.getSessionPaymentsByMethodByUuid(sessionUuid)
      ]);
      
      setSession(detail.session);
      setMovements(detail.movements);
      setCounts(detail.counts);
      setSummary(detail.summary);
      setSales(salesData);
      setPaymentsByMethod(paymentsData);
    } catch (error: unknown) {
      console.error('Error loading session data:', error);
      toast.error(t('comun.errorCargar'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionUuid, t]);

  useEffect(() => {
    if (organization?.id && sessionUuid) {
      loadSessionData();
    }
  }, [organization, sessionUuid, loadSessionData]);

  const handleSessionClosed = (closedSession: CashSession) => {
    setSession(closedSession);
    setShowCierreDialog(false);
    loadSessionData();
    toast.success(t('pagina.toastCerrada'));
  };

  const getCountTypeBadge = (type: string) => {
    switch (type) {
      case 'opening':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{t('comun.tipoArqueo.opening')}</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{t('comun.tipoArqueo.partial')}</Badge>;
      case 'closing':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('comun.tipoArqueo.closing')}</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <Card className="dark:bg-gray-800 max-w-md w-full">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-lg font-semibold mb-2 dark:text-white">{t('comun.sesionNoEncontrada')}</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t('comun.sesionNoExiste')}</p>
            <Button variant="outline" asChild>
              <Link href="/app/pos/cajas">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('comun.volverCajas')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
      {/* Header compacto */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/app/pos/cajas" aria-label={t('comun.volverCajas')}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold dark:text-white">{t('pagina.titulo', { id: session.id })}</h1>
              <Badge className={cn(
                session.status === 'open'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              )}>
                {session.status === 'open' ? t('pagina.estadoAbierta') : t('pagina.estadoCerrada')}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('pagina.abiertaEl', { fecha: formatDateTime(session.opened_at) })}
              {session.closed_at && ` | ${t('pagina.cerradaEl', { fecha: formatDateTime(session.closed_at) })}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSessionData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('pagina.acciones.actualizar')}
          </Button>
          {session.status === 'open' && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/app/pos/cajas/${sessionUuid}/arqueos/nuevo`}>
                  <Calculator className="h-4 w-4 mr-2" />
                  {t('pagina.acciones.arqueo')}
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/app/pos/cajas/${sessionUuid}/movimientos/nuevo`}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('pagina.acciones.movimiento')}
                </Link>
              </Button>
              <Button size="sm" onClick={() => setShowCierreDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                {t('pagina.acciones.cerrarCaja')}
              </Button>
            </>
          )}
        </div>
      </div>

        {/* Resumen Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('pagina.tarjetas.montoInicial')}</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(summary?.initial_amount || 0)}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('pagina.tarjetas.ventasEfectivo')}</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary?.sales_cash || 0)}
                  </p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {showExpected ? (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('pagina.tarjetas.montoEsperado')}</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(summary?.expected_amount || 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                    <Calculator className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="dark:bg-gray-800 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
              <CardContent className="p-4 flex items-center gap-3">
                <EyeOff className="h-6 w-6 text-purple-600 dark:text-purple-400 shrink-0" />
                <div>
                  <p className="text-sm text-purple-700 dark:text-purple-400">{t('comun.cierreCiego')}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-500">{t('pagina.tarjetas.noVisibleCajeros')}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {showExpected ? (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('pagina.tarjetas.diferencia')}</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      (summary?.difference || 0) >= 0 
                        ? "text-green-600 dark:text-green-400" 
                        : "text-red-600 dark:text-red-400"
                    )}>
                      {formatCurrency(summary?.difference || 0)}
                    </p>
                  </div>
                  <div className={cn(
                    "p-3 rounded-full",
                    (summary?.difference || 0) >= 0 
                      ? "bg-green-100 dark:bg-green-900/30" 
                      : "bg-red-100 dark:bg-red-900/30"
                  )}>
                    {(summary?.difference || 0) >= 0 
                      ? <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      : <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4 flex items-center gap-3">
                <EyeOff className="h-6 w-6 text-gray-400 dark:text-gray-500 shrink-0" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('pagina.tarjetas.diferencia')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('pagina.tarjetas.soloAdministradores')}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="resumen">{t('pagina.pestanas.resumen')}</TabsTrigger>
            <TabsTrigger value="movimientos">{t('pagina.pestanas.movimientos', { n: movements.length })}</TabsTrigger>
            <TabsTrigger value="arqueos">{t('pagina.pestanas.arqueos', { n: counts.length })}</TabsTrigger>
            <TabsTrigger value="ventas">{t('pagina.pestanas.ventas', { n: sales.length })}</TabsTrigger>
          </TabsList>

          {/* Tab Resumen */}
          <TabsContent value="resumen" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Info de sesión */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm dark:text-white">{t('pagina.info.titulo')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('pagina.info.cajero')}</span>
                    <span className="font-medium dark:text-white">{session.opened_by_name || t('pagina.info.usuario')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('pagina.info.sucursal')}</span>
                    <span className="font-medium dark:text-white">{session.branch_name ||`#${session.branch_id}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('pagina.info.apertura')}</span>
                    <span className="dark:text-white">{formatDateTime(session.opened_at)}</span>
                  </div>
                  {session.closed_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('pagina.info.cierre')}</span>
                      <span className="dark:text-white">{formatDateTime(session.closed_at)}</span>
                    </div>
                  )}
                  {session.notes && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('pagina.info.notas')}</span>
                      <span className="dark:text-white text-right max-w-[60%]">{session.notes}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Desglose de Caja */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm dark:text-white">{t('pagina.desglose.titulo')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.montoInicial')}</span>
                    <span className="font-medium dark:text-white">{formatCurrency(summary?.initial_amount || 0)}</span>
                  </div>
                  {/* Ventas por cada método de pago */}
                  {summary?.income_by_method && Object.keys(summary.income_by_method).length > 0 ? (
                    Object.entries(summary.income_by_method).map(([method, amount]) => (
                      <div key={method} className="flex justify-between py-2 border-b dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('pagina.desglose.ventasEn', { metodo: getPaymentMethodLabel(method) })}
                        </span>
                        <span className="font-medium text-green-600 dark:text-green-400">+{formatCurrency(amount)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.ventasEfectivo')}</span>
                      <span className="font-medium text-green-600 dark:text-green-400">+{formatCurrency(summary?.sales_cash || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.ingresos')}</span>
                    <span className="font-medium text-green-600 dark:text-green-400">+{formatCurrency(summary?.cash_in || 0)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.egresos')}</span>
                    <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(summary?.cash_out || 0)}</span>
                  </div>
                  {summary && summary.change_total > 0 && (
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.vuelto')}</span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">-{formatCurrency(summary.change_total)}</span>
                    </div>
                  )}
                  {summary && summary.returns_total > 0 && (
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.devoluciones')}</span>
                      <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(summary.returns_total)}</span>
                    </div>
                  )}
                  {summary && summary.folio_consumptions_total > 0 && (
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.consumosHabitaciones')}</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatCurrency(summary.folio_consumptions_total)}</span>
                    </div>
                  )}
                  {summary && summary.cash_receipts_total > 0 && (
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 text-blue-500" />
                        {t('pagina.desglose.recibosCaja')}
                      </span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{formatCurrency(summary.cash_receipts_total)}</span>
                    </div>
                  )}
                  {summary && summary.purchases_total > 0 && (
                    <div className="flex justify-between py-2 border-b dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                        <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
                        {t('pagina.desglose.pagosProveedores')}
                      </span>
                      <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(summary.purchases_total)}</span>
                    </div>
                  )}
                  <Separator />
                  {showExpected ? (
                    <div className="flex justify-between py-2">
                      <span className="font-semibold dark:text-white">{t('pagina.desglose.montoEsperado')}</span>
                      <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{formatCurrency(summary?.expected_amount || 0)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <EyeOff className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-sm text-purple-700 dark:text-purple-400">{t('pagina.desglose.cierreCiego')}</span>
                    </div>
                  )}
                  {session.status === 'closed' && summary?.counted_amount !== undefined && showExpected && (
                    <>
                      <div className="flex justify-between py-2 border-t dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">{t('pagina.desglose.montoContado')}</span>
                        <span className="font-medium dark:text-white">{formatCurrency(summary.counted_amount)}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="font-semibold dark:text-white">{t('pagina.desglose.diferencia')}</span>
                        <span className={cn(
                          "font-bold",
                          (summary.difference || 0) >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatCurrency(summary.difference || 0)}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Pagos por Método */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm dark:text-white">{t('pagina.pagos.titulo')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(paymentsByMethod).length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">{t('pagina.pagos.vacio')}</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(paymentsByMethod).map(([method, amount]) => (
                        <div key={method} className="flex justify-between items-center py-2 border-b dark:border-gray-700 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "p-2 rounded-full",
                              method === 'cash' ? "bg-green-100 dark:bg-green-900/30" :
                              method === 'card' ? "bg-blue-100 dark:bg-blue-900/30" :
                              "bg-gray-100 dark:bg-gray-700"
                            )}>
                              <DollarSign className={cn(
                                "h-4 w-4",
                                method === 'cash' ? "text-green-600 dark:text-green-400" :
                                method === 'card' ? "text-blue-600 dark:text-blue-400" :
                                "text-gray-600 dark:text-gray-400"
                              )} />
                            </div>
                            <span className="dark:text-white">
                              {getPaymentMethodLabel(method)}
                            </span>
                          </div>
                          <span className="font-semibold dark:text-white">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between py-2">
                        <span className="font-semibold dark:text-white">{t('pagina.pagos.total')}</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {formatCurrency(Object.values(paymentsByMethod).reduce((a, b) => a + b, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Movimientos */}
          <TabsContent value="movimientos">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg dark:text-white">{t('pagina.movimientos.titulo')}</CardTitle>
                {session.status === 'open' && (
                  <Button size="sm" asChild>
                    <Link href={`/app/pos/cajas/${sessionUuid}/movimientos/nuevo`}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('pagina.movimientos.nuevo')}
                    </Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {movements.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('pagina.movimientos.vacio')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('pagina.movimientos.columnas.fecha')}</TableHead>
                        <TableHead>{t('pagina.movimientos.columnas.tipo')}</TableHead>
                        <TableHead>{t('pagina.movimientos.columnas.concepto')}</TableHead>
                        <TableHead>{t('pagina.movimientos.columnas.notas')}</TableHead>
                        <TableHead className="text-right">{t('pagina.movimientos.columnas.monto')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((mov) => (
                        <TableRow key={mov.id}>
                          <TableCell className="text-sm">{formatDateTime(mov.created_at)}</TableCell>
                          <TableCell>
                            <Badge className={cn(
                              mov.type === 'in' 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            )}>
                              {mov.type === 'in' ? t('pagina.movimientos.ingreso') : t('pagina.movimientos.egreso')}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium dark:text-white">{mov.concept}</TableCell>
                          <TableCell className="text-gray-500 dark:text-gray-400">{mov.notes || '-'}</TableCell>
                          <TableCell className={cn(
                            "text-right font-semibold",
                            mov.type === 'in' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {mov.type === 'in' ? '+' : '-'}{formatCurrency(mov.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Arqueos */}
          <TabsContent value="arqueos">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg dark:text-white">{t('pagina.arqueos.titulo')}</CardTitle>
                {session.status === 'open' && (
                  <Button size="sm" asChild>
                    <Link href={`/app/pos/cajas/${sessionUuid}/arqueos/nuevo`}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('pagina.arqueos.nuevo')}
                    </Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {counts.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('pagina.arqueos.vacio')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('pagina.arqueos.columnas.fecha')}</TableHead>
                        <TableHead>{t('pagina.arqueos.columnas.tipo')}</TableHead>
                        <TableHead className="text-right">{t('pagina.arqueos.columnas.contado')}</TableHead>
                        {showExpected && <TableHead className="text-right">{t('pagina.arqueos.columnas.esperado')}</TableHead>}
                        {showExpected && <TableHead className="text-right">{t('pagina.arqueos.columnas.diferencia')}</TableHead>}
                        <TableHead>{t('pagina.arqueos.columnas.notas')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {counts.map((count) => (
                        <TableRow key={count.id}>
                          <TableCell className="text-sm">{formatDateTime(count.created_at)}</TableCell>
                          <TableCell>{getCountTypeBadge(count.count_type)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">
                            {formatCurrency(count.counted_amount)}
                          </TableCell>
                          {showExpected && (
                            <TableCell className="text-right text-gray-500 dark:text-gray-400">
                              {formatCurrency(count.expected_amount || 0)}
                            </TableCell>
                          )}
                          {showExpected && (
                            <TableCell className={cn(
                              "text-right font-semibold",
                              (count.difference || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                            )}>
                              {formatCurrency(count.difference || 0)}
                            </TableCell>
                          )}
                          <TableCell className="text-gray-500 dark:text-gray-400">{count.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Ventas */}
          <TabsContent value="ventas">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white">{t('pagina.ventas.titulo')}</CardTitle>
              </CardHeader>
              <CardContent>
                {sales.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('pagina.ventas.vacio')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('pagina.ventas.columnas.fecha')}</TableHead>
                        <TableHead>{t('pagina.ventas.columnas.id')}</TableHead>
                        <TableHead>{t('pagina.ventas.columnas.estado')}</TableHead>
                        <TableHead>{t('pagina.ventas.columnas.pago')}</TableHead>
                        <TableHead className="text-right">{t('pagina.ventas.columnas.total')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="text-sm">{formatDateTime(sale.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{sale.id.slice(0, 8)}...</TableCell>
                          <TableCell>
                            <Badge variant={sale.status === 'completed' ? 'default' : 'secondary'}>
                              {sale.status === 'completed' ? t('pagina.ventas.completada') : sale.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              sale.payment_status === 'paid' 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            )}>
                              {sale.payment_status === 'paid' ? t('pagina.ventas.pagado') : sale.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold dark:text-white">
                            {formatCurrency(sale.total)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/app/pos/ventas/${sale.id}`}>
                                <Receipt className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        
        {session.status === 'open' && (
          <CierreCajaDialog
            session={session}
            open={showCierreDialog}
            onOpenChange={setShowCierreDialog}
            onSessionClosed={handleSessionClosed}
          />
        )}
    </div>
  );
}
