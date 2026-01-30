'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  ArrowLeft, ArrowRightLeft, RefreshCw, CheckCircle, 
  XCircle, DollarSign, Calendar, Lock, Unlock, Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConciliacionService } from './ConciliacionService';
import { BankReconciliation, BankReconciliationItem, BankTransaction } from '../bancos/BancosService';
import { formatCurrency } from '@/utils/Utils';

interface ConciliacionDetailPageProps {
  reconciliationId: string;
}

export function ConciliacionDetailPage({ reconciliationId }: ConciliacionDetailPageProps) {
  const router = useRouter();
  const [reconciliation, setReconciliation] = useState<BankReconciliation | null>(null);
  const [items, setItems] = useState<BankReconciliationItem[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<BankTransaction[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const recData = await ConciliacionService.obtenerConciliacion(reconciliationId);
      
      if (!recData) {
        toast.error('Conciliación no encontrada');
        router.push('/app/finanzas/conciliacion-bancaria');
        return;
      }

      setReconciliation(recData);

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
  }, [reconciliationId, router]);

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

  const handleCloseConciliation = async () => {
    try {
      setIsClosing(true);
      await ConciliacionService.cerrarConciliacion(reconciliationId);
      toast.success('Conciliación cerrada exitosamente');
      setShowCloseDialog(false);
      await loadData();
    } catch (error) {
      console.error('Error cerrando:', error);
      toast.error('Error al cerrar la conciliación');
    } finally {
      setIsClosing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Borrador</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">En Progreso</Badge>;
      case 'closed':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Cerrada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!reconciliation) return null;

  const matchedAmount = items.filter(i => i.is_matched).reduce((sum, i) => sum + i.amount, 0);
  const difference = (reconciliation.statement_balance || 0) - (reconciliation.opening_balance + matchedAmount);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/conciliacion-bancaria">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <ArrowRightLeft className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Conciliación Bancaria
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {reconciliation.bank_account?.name} • {formatDate(reconciliation.period_start)} - {formatDate(reconciliation.period_end)}
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
            className="dark:border-gray-600"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {reconciliation.status !== 'closed' && (
            <Button
              onClick={() => setShowCloseDialog(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Lock className="h-4 w-4 mr-2" />
              Cerrar Conciliación
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Saldo Apertura
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(reconciliation.opening_balance)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Saldo Extracto
            </CardTitle>
            <DollarSign className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(reconciliation.statement_balance || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Conciliado
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(matchedAmount)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Diferencia
            </CardTitle>
            {difference === 0 ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${difference === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(difference)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Two Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel A: Transacciones Pendientes */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">
              Movimientos Bancarios Pendientes ({pendingTransactions.length})
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Transacciones sin conciliar en el período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingTransactions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Todas las transacciones están conciliadas
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pendingTransactions.map(tx => (
                  <div 
                    key={tx.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {tx.description || 'Sin descripción'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(tx.trans_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${
                        tx.transaction_type === 'credit' 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {tx.transaction_type === 'credit' ? '+' : '-'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </span>
                      {reconciliation.status !== 'closed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMatchTransaction(tx.id)}
                          className="dark:border-gray-600"
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
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">
              Items Conciliados ({items.filter(i => i.is_matched).length})
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Transacciones ya conciliadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.filter(i => i.is_matched).length === 0 ? (
              <div className="text-center py-8">
                <ArrowRightLeft className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Aún no hay items conciliados
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items.filter(i => i.is_matched).map(item => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.match_type === 'payment' ? 'Pago' : item.match_type === 'journal' ? 'Asiento' : 'Manual'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.match_date ? formatDateTime(item.match_date) : 'Sin fecha'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(item.amount)}
                      </span>
                      {reconciliation.status !== 'closed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnmatchItem(item)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
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

      {/* Close Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Cerrar Conciliación</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              ¿Estás seguro de que deseas cerrar esta conciliación? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Diferencia actual:</strong> {formatCurrency(difference)}
            </p>
            {difference !== 0 && (
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                ⚠️ Existe una diferencia. Se recomienda resolverla antes de cerrar.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button 
              onClick={handleCloseConciliation}
              disabled={isClosing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Lock className="h-4 w-4 mr-2" />
              {isClosing ? 'Cerrando...' : 'Cerrar Conciliación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
