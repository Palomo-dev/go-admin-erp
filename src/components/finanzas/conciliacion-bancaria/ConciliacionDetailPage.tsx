'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ArrowRightLeft, RefreshCw, CheckCircle,
  XCircle, Lock, Link2
} from 'lucide-react';
import { ConciliacionService } from './ConciliacionService';
import { esEntradaBancaria } from '@/lib/finanzas/movimientoBancario';
import { AIMatchingPanel } from './AIMatchingPanel';
import { ImportarExtracto } from './ImportarExtracto';
import { CerrarConciliacionDialog, SaldoExtractoDialog } from './CerrarConciliacionDialog';
import { PartidasConciliacion } from './PartidasConciliacion';
import type { PartidasDeConciliacion } from './ConciliacionService';
import { BankReconciliation, BankReconciliationItem, BankTransaction } from '../bancos/BancosService';
import { AvisoTonal, KpiStrip, PageHeader, Skeleton, StatCard, StatusBadge, TabBar, Tarjeta, clasesBoton, idPanel, idPestana } from '@/components/kit';
import { RUTAS_TESORERIA } from '@/lib/finanzas/tesoreria/rutas';
import { periodoAntesDelCorte } from '@/lib/finanzas/tesoreria/cuentasDinero';
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

const ID_PESTANAS = 'conciliacion-detalle';

export function ConciliacionDetailPage({ reconciliationId }: ConciliacionDetailPageProps) {
  const router = useRouter();
  const t = useTranslations('conciliacionCierre');
  const tr = useTranslations('finanzasTesoreriaR3.conciliacion');
  const [pestana, setPestana] = useState<'manual' | 'extracto' | 'ai'>('manual');
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
        router.push(RUTAS_TESORERIA.conciliacion);
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

  // Celular: una sola barra. «←» y el título van en el MobileHeader del shell.
  useCabeceraMovil({ modo: 'page', titulo: tr('titulo'), subtitulo: reconciliation?.bank_account?.name, volverA: RUTAS_TESORERIA.conciliacion });

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
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
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variante="detail"
        titulo={tr('tituloDetalle', { cuenta: reconciliation.bank_account?.name ?? '' })}
        subtitulo={periodo}
        icono={ArrowRightLeft}
        badge={<StatusBadge estado={reconciliation.status} etiqueta={tr(`estados.${reconciliation.status}`)} />}
        volverA={RUTAS_TESORERIA.conciliacion}
        migas={[
          { etiqueta: tr('migaTesoreria'), href: RUTAS_TESORERIA.movimientos },
          { etiqueta: tr('titulo'), href: RUTAS_TESORERIA.conciliacion },
          { etiqueta: `${reconciliation.bank_account?.name ?? ''} · ${periodo}` },
        ]}
        movil={{
          menu: [
            { id: 'actualizar', etiqueta: tr('actualizar'), icono: RefreshCw, onSelect: handleRefresh, deshabilitada: isRefreshing },
            { id: 'cerrar', etiqueta: t('cerrar.titulo'), icono: Lock, onSelect: abrirCierre, oculta: cerrada || !permisos.crear, deshabilitada: partidas === null },
          ],
        }}
        acciones={
          <>
            <button type="button" onClick={handleRefresh} disabled={isRefreshing} className={clasesBoton({ variante: 'secundario' })}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
              {tr('actualizar')}
            </button>
            {!cerrada && permisos.crear && (
              <button type="button" onClick={abrirCierre} disabled={partidas === null} className={clasesBoton({ variante: 'primario' })}>
                <Lock className="h-4 w-4" aria-hidden />
                {t('cerrar.titulo')}
              </button>
            )}
          </>
        }
      />

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

      {reconciliation.bank_account?.initial_balance_date && (
        <p className="text-xs text-fg-secondary">
          {tr('corte.saldoInicial', {
            saldo: formatearCuenta(reconciliation.bank_account.initial_balance ?? 0),
            fecha: formatPlainDate(reconciliation.bank_account.initial_balance_date),
          })}
        </p>
      )}
      {periodoAntesDelCorte(reconciliation.period_start, reconciliation.bank_account?.initial_balance_date) && (
        <AvisoTonal
          tono="advertencia"
          titulo={tr('corte.antes', { fecha: formatPlainDate(reconciliation.bank_account?.initial_balance_date ?? '') })}
        />
      )}

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

      <TabBar
        id={ID_PESTANAS}
        etiqueta={tr('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'manual', etiqueta: tr('pestanas.emparejar'), contador: pendingTransactions.length },
          { valor: 'extracto', etiqueta: tr('pestanas.extracto') },
          { valor: 'ai', etiqueta: tr('pestanas.sugerencias') },
        ]}
      />

      <div role="tabpanel" id={idPanel(ID_PESTANAS, 'manual')} aria-labelledby={idPestana(ID_PESTANAS, 'manual')} hidden={pestana !== 'manual'}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel A: Transacciones Pendientes */}
        <Tarjeta titulo={tr('pendientes.titulo', { n: pendingTransactions.length })} descripcion={tr('pendientes.descripcion')}>
            {pendingTransactions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 text-success-text" aria-hidden />
                <p className="text-fg-secondary">{tr('pendientes.vacio')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pendingTransactions.map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg bg-subtle p-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-fg">
                        {tx.description || tr('sinDescripcion')}
                      </p>
                      <p className="text-xs text-fg-secondary">
                        {formatDateTime(tx.trans_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${
                        esEntradaBancaria(tx)
                          ? 'text-success-text'
                          : 'text-danger-text'
                      }`}>
                        {esEntradaBancaria(tx) ? '+' : '-'}
                        {formatearCuenta(Math.abs(tx.amount))}
                      </span>
                      {!cerrada && (
                        <button
                          type="button"
                          aria-label={tr('conciliar')}
                          title={tr('conciliar')}
                          onClick={() => handleMatchTransaction(tx.id)}
                          className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                        >
                          <Link2 className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Tarjeta>

        {/* Panel B: Items Conciliados */}
        <Tarjeta titulo={tr('conciliados.titulo', { n: items.filter(i => i.is_matched).length })} descripcion={tr('conciliados.descripcion')}>
            {items.filter(i => i.is_matched).length === 0 ? (
              <div className="text-center py-8">
                <ArrowRightLeft className="mx-auto mb-4 h-12 w-12 text-fg-tertiary" aria-hidden />
                <p className="text-fg-secondary">{tr('conciliados.vacio')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items.filter(i => i.is_matched).map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-success-subtle bg-success-subtle p-3"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success-text" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-fg">
                          {tr(`tipoItem.${item.match_type === 'payment' || item.match_type === 'journal' ? item.match_type : 'manual'}`)}
                        </p>
                        <p className="text-xs text-fg-secondary">
                          {item.match_date ? formatDateTime(item.match_date) : tr('sinFecha')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-success-text">
                        {formatearCuenta(importeItem(item))}
                      </span>
                      {!cerrada && (
                        <button
                          type="button"
                          aria-label={tr('deshacer')}
                          title={tr('deshacer')}
                          onClick={() => handleUnmatchItem(item)}
                          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-danger-text' })}
                        >
                          <XCircle className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Tarjeta>
      </div>
      </div>

      <div role="tabpanel" id={idPanel(ID_PESTANAS, 'extracto')} aria-labelledby={idPestana(ID_PESTANAS, 'extracto')} hidden={pestana !== 'extracto'}>
          <ImportarExtracto
            reconciliationId={reconciliationId}
            bankAccountId={reconciliation.bank_account_id}
            pendientes={pendingTransactions}
            cerrada={cerrada}
            onCambio={loadData}
            formatear={formatearCuenta}
          />
      </div>

      {/* Sugerencias */}
      <div role="tabpanel" id={idPanel(ID_PESTANAS, 'ai')} aria-labelledby={idPestana(ID_PESTANAS, 'ai')} hidden={pestana !== 'ai'}>
          <AIMatchingPanel
            reconciliationId={reconciliationId}
            onMatchComplete={loadData}
            monedaCuenta={reconciliation.bank_account?.currency}
          />
      </div>

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
