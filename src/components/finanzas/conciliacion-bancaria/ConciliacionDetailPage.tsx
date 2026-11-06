'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, ArrowRightLeft, RefreshCw, CheckCircle,
  XCircle, Lock, Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConciliacionService } from './ConciliacionService';
import { esEntradaBancaria } from '@/lib/finanzas/movimientoBancario';
import { AIMatchingPanel } from './AIMatchingPanel';
import { ImportarExtracto } from './ImportarExtracto';
import { CerrarConciliacionDialog, SaldoExtractoDialog } from './CerrarConciliacionDialog';
import { PartidasConciliacion } from './PartidasConciliacion';
import type { PartidasDeConciliacion } from './ConciliacionService';
import { BankReconciliation, BankReconciliationItem, BankTransaction } from '../bancos/BancosService';
import { AvisoTonal, KpiStrip, StatCard } from '@/components/kit';
import {
  diferenciaConciliacion,
  errorCierre,
  importeItem,
  planCierre,
  saldoEnLibros,
  sentidoDiferencia,
  totalConciliado,
} from '@/lib/finanzas/conciliacion/diferencia';
import { SIN_DATO } from '@/lib/finanzas/pendientesContables';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

interface ConciliacionDetailPageProps {
  reconciliationId: string;
}

export function ConciliacionDetailPage({ reconciliationId }: ConciliacionDetailPageProps) {
  const router = useRouter();
  const t = useTranslations('conciliacionCierre');
  const permisos = usePermisosFinanzas();
  const { formatDate: formatDateInstante, formatDateTime } = useFormatDate();
  const { paraDocumento } = useMonedaOrganizacion();
  const [reconciliation, setReconciliation] = useState<BankReconciliation | null>(null);
  const [items, setItems] = useState<BankReconciliationItem[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<BankTransaction[]>([]);
  const [, setPayments] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [errorCerrar, setErrorCerrar] = useState<string | null>(null);
  const [showSaldoDialog, setShowSaldoDialog] = useState(false);
  const [guardandoSaldo, setGuardandoSaldo] = useState(false);
  // `null` con error: las partidas se desconocen, no son cero.
  const [partidas, setPartidas] = useState<PartidasDeConciliacion | null>(null);
  const [errorPartidas, setErrorPartidas] = useState(false);

  const cargarPartidas = useCallback(async () => {
    try {
      setPartidas(await ConciliacionService.obtenerPartidas(reconciliationId));
      setErrorPartidas(false);
    } catch (error) {
      console.error('Error cargando partidas:', error);
      setPartidas(null);
      setErrorPartidas(true);
    }
  }, [reconciliationId]);

  const loadData = useCallback(async () => {
    try {
      const recData = await ConciliacionService.obtenerConciliacion(reconciliationId);

      if (!recData) {
        toast.error('Conciliación no encontrada');
        router.push('/app/finanzas/conciliacion-bancaria');
        return;
      }

      setReconciliation(recData);
      await cargarPartidas();

      const [itemsData, txData, paymentsData] = await Promise.all([
        ConciliacionService.obtenerItemsConciliacion(reconciliationId),
        ConciliacionService.obtenerTransaccionesPendientes(
          recData.bank_account_id,
          recData.period_start,
          recData.period_end
        ),
        ConciliacionService.obtenerPagosCandidatos(recData.period_start, recData.period_end)
      ]);

      setItems(itemsData);
      setPendingTransactions(txData);
      setPayments(paymentsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar la conciliación');
    } finally {
      setIsLoading(false);
    }
  }, [reconciliationId, router, cargarPartidas]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleMatchTransaction = async (transactionId: number) => {
    try {
      await ConciliacionService.matchTransaccion(reconciliationId, transactionId, 'manual');
      toast.success('Transacción conciliada');
      await loadData();
    } catch (error) {
      console.error('Error conciliando:', error);
      toast.error('Error al conciliar la transacción');
    }
  };

  const handleUnmatchItem = async (item: BankReconciliationItem) => {
    if (!item.bank_transaction_id) return;

    try {
      await ConciliacionService.unmatchTransaccion(item.id, item.bank_transaction_id);
      toast.success('Conciliación deshecha');
      await loadData();
    } catch (error) {
      console.error('Error deshaciendo:', error);
      toast.error('Error al deshacer la conciliación');
    }
  };

  const handleCloseConciliation = async (motivo: string | null) => {
    try {
      setIsClosing(true);
      setErrorCerrar(null);
      await ConciliacionService.cerrarConciliacion(reconciliationId, motivo);
      toast.success(t('cerrar.exito'));
      setShowCloseDialog(false);
      await loadData();
    } catch (error) {
      console.error('Error cerrando:', error);
      setErrorCerrar(t(`errores.${errorCierre(error)}`));
    } finally {
      setIsClosing(false);
    }
  };

  const abrirCierre = () => {
    setErrorCerrar(null);
    if (reconciliation?.statement_balance === null) {
      setShowSaldoDialog(true);
      return;
    }
    setShowCloseDialog(true);
  };

  const guardarSaldoExtracto = async (saldo: number) => {
    try {
      setGuardandoSaldo(true);
      await ConciliacionService.actualizarConciliacion(reconciliationId, { statement_balance: saldo });
      setShowSaldoDialog(false);
      await loadData();
      setShowCloseDialog(true);
    } catch (error) {
      console.error('Error guardando el saldo del extracto:', error);
      toast.error(t(`errores.${errorCierre(error)}`));
    } finally {
      setGuardandoSaldo(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-700">Borrador</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700">En Progreso</Badge>;
      case 'closed':
        return <Badge className="bg-green-100 text-green-700">Cerrada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Celular: una sola barra. «←» y el título van en el MobileHeader del shell.
  useCabeceraMovil({ modo: 'page', titulo: 'Conciliación Bancaria', subtitulo: reconciliation?.bank_account?.name, volverA: '/app/finanzas/conciliacion-bancaria' });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 min-h-screen">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!reconciliation) return null;

  // Saldos y movimientos de la cuenta conciliada: en la moneda de esa cuenta
  // (sin ella, la base de la organizacion).
  const monedaCuenta = paraDocumento(reconciliation.bank_account?.currency);
  const formatearCuenta = (valor: number) => formatMoneda(valor, monedaCuenta);

  const cerrada = reconciliation.status === 'closed';
  const matchedAmount = totalConciliado(items);
  // Abierta se calcula con lo que se ve; cerrada vale lo que quedó guardado.
  const saldoLibros = cerrada ? reconciliation.closing_balance : saldoEnLibros(reconciliation.opening_balance, items);
  const saldoExtracto = reconciliation.statement_balance;
  const difference = diferenciaConciliacion(saldoLibros, saldoExtracto);
  const periodo = `${formatPlainDate(reconciliation.period_start)} - ${formatPlainDate(reconciliation.period_end)}`;
  const plan = saldoExtracto !== null && partidas
    ? planCierre(saldoLibros, saldoExtracto, partidas.traidas_pendientes)
    : null;
  const resueltasAqui = partidas?.traidas.filter((p) => p.resuelta_aqui).length ?? 0;
  const pendientesVisibles = partidas
    ? [...partidas.propias, ...partidas.traidas].filter((p) => p.estado === 'pendiente').length
    : null;
  const textoDiferencia = difference === null
    ? t('sentido.faltaExtracto')
    : [
        t(`sentido.${sentidoDiferencia(difference)}`),
        resueltasAqui > 0 ? t('sentido.resueltas', { n: resueltasAqui }) : null,
      ].filter(Boolean).join(' · ');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* En celular «←» ya está en el MobileHeader del shell: aquí sería la segunda flecha. */}
          <Link href="/app/finanzas/conciliacion-bancaria" className="hidden lg:block">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 rounded-xl">
            <ArrowRightLeft className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Conciliación Bancaria
            </h1>
            <p className="text-gray-500">
              {reconciliation.bank_account?.name} • {periodo}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {getStatusBadge(reconciliation.status)}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {!cerrada && permisos.crear && (
            <Button onClick={abrirCierre} disabled={partidas === null}>
              <Lock className="h-4 w-4 mr-2" />
              {t('cerrar.titulo')}
            </Button>
          )}
        </div>
      </div>

      <KpiStrip etiqueta={t('tarjetas.resumen')}>
        <StatCard
          etiqueta={t('tarjetas.saldoLibros')}
          valor={formatearCuenta(saldoLibros)}
          detalle={t('tarjetas.saldoInicial', { valor: formatearCuenta(reconciliation.opening_balance) })}
        />
        <StatCard
          etiqueta={t('tarjetas.saldoExtracto')}
          valor={saldoExtracto === null ? SIN_DATO : formatearCuenta(saldoExtracto)}
        />
        {!cerrada && (
          <StatCard etiqueta={t('tarjetas.conciliado')} valor={formatearCuenta(matchedAmount)} />
        )}
        <StatCard
          etiqueta={t('tarjetas.diferencia')}
          valor={difference === null ? SIN_DATO : formatearCuenta(difference)}
          detalle={textoDiferencia}
        />
        {cerrada && (
          <StatCard
            etiqueta={t('tarjetas.partidasPendientes')}
            valor={pendientesVisibles === null ? SIN_DATO : pendientesVisibles}
          />
        )}
      </KpiStrip>

      {errorPartidas && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('partidas.errorTitulo')}
          descripcion={t('partidas.errorDetalle')}
          accion={{ etiqueta: t('partidas.reintentar'), onClick: () => void cargarPartidas() }}
        />
      )}

      {cerrada && partidas?.cierre && (
        <AvisoTonal
          tono="informacion"
          titulo={t('cerrada.por', {
            nombre: partidas.cierre.cerrada_por ?? SIN_DATO,
            fecha: formatDateInstante(partidas.cierre.cerrada_en),
          })}
          descripcion={partidas.cierre.motivo ? t('cerrada.motivo', { motivo: partidas.cierre.motivo }) : undefined}
        />
      )}

      {partidas && (
        <PartidasConciliacion
          reconciliationId={reconciliationId}
          partidas={partidas}
          cerrada={cerrada}
          puedeResolver={permisos.crear}
          items={items}
          formatear={formatearCuenta}
          onCambio={loadData}
        />
      )}

      {/* Main Content - Tabs: Conciliacion manual / Sugerencias */}
      <Tabs defaultValue="manual" className="w-full">
        <TabsList>
          <TabsTrigger value="manual">Conciliacion manual</TabsTrigger>
          <TabsTrigger value="extracto">Extracto</TabsTrigger>
          <TabsTrigger value="ai">Sugerencias</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel A: Transacciones Pendientes */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">
              Movimientos Bancarios Pendientes ({pendingTransactions.length})
            </CardTitle>
            <CardDescription>
              Transacciones sin conciliar en el período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingTransactions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500">
                  Todas las transacciones están conciliadas
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pendingTransactions.map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">
                        {tx.description || 'Sin descripción'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(tx.trans_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${
                        esEntradaBancaria(tx)
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}>
                        {esEntradaBancaria(tx) ? '+' : '-'}
                        {formatearCuenta(Math.abs(tx.amount))}
                      </span>
                      {!cerrada && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMatchTransaction(tx.id)}
                        >
                          <Link2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel B: Items Conciliados */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">
              Items Conciliados ({items.filter(i => i.is_matched).length})
            </CardTitle>
            <CardDescription>
              Transacciones ya conciliadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.filter(i => i.is_matched).length === 0 ? (
              <div className="text-center py-8">
                <ArrowRightLeft className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  Aún no hay items conciliados
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items.filter(i => i.is_matched).map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {item.match_type === 'payment' ? 'Pago' : item.match_type === 'journal' ? 'Asiento' : 'Manual'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.match_date ? formatDateTime(item.match_date) : 'Sin fecha'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">
                        {formatearCuenta(importeItem(item))}
                      </span>
                      {!cerrada && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnmatchItem(item)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="extracto">
          <ImportarExtracto
            reconciliationId={reconciliationId}
            bankAccountId={reconciliation.bank_account_id}
            pendientes={pendingTransactions}
            cerrada={cerrada}
            onCambio={loadData}
            formatear={formatearCuenta}
          />
        </TabsContent>

        {/* Tab: Sugerencias */}
        <TabsContent value="ai">
          <AIMatchingPanel
            reconciliationId={reconciliationId}
            onMatchComplete={loadData}
            monedaCuenta={reconciliation.bank_account?.currency}
          />
        </TabsContent>
      </Tabs>

      {plan && (
        <CerrarConciliacionDialog
          abierto={showCloseDialog}
          onAbiertoChange={setShowCloseDialog}
          contexto={`${reconciliation.bank_account?.name ?? ''} · ${periodo}`}
          plan={plan}
          formatear={formatearCuenta}
          cargando={isClosing}
          error={errorCerrar}
          onConfirmar={handleCloseConciliation}
        />
      )}
      <SaldoExtractoDialog
        abierto={showSaldoDialog}
        onAbiertoChange={setShowSaldoDialog}
        cargando={guardandoSaldo}
        onGuardar={guardarSaldoExtracto}
      />
    </div>
  );
}
