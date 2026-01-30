'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  ArrowLeft, Building2, CreditCard, DollarSign, Calendar, 
  ArrowRightLeft, Edit, RefreshCw, FileDown, Upload 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BancosService, BankAccount, BankTransaction } from '../BancosService';
import { formatCurrency } from '@/utils/Utils';

interface CuentaDetailPageProps {
  accountId: string;
}

export function CuentaDetailPage({ accountId }: CuentaDetailPageProps) {
  const router = useRouter();
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [accountData, transactionsData] = await Promise.all([
        BancosService.obtenerCuentaBancaria(parseInt(accountId)),
        BancosService.obtenerTransacciones(parseInt(accountId), { limit: 10 })
      ]);

      if (!accountData) {
        toast.error('Cuenta bancaria no encontrada');
        router.push('/app/finanzas/bancos');
        return;
      }

      setAccount(accountData);
      setTransactions(transactionsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar los datos de la cuenta');
    } finally {
      setIsLoading(false);
    }
  }, [accountId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const getAccountTypeLabel = (type: string | null) => {
    switch (type) {
      case 'checking': return 'Cuenta Corriente';
      case 'savings': return 'Cuenta de Ahorros';
      case 'credit': return 'Línea de Crédito';
      default: return type || 'Cuenta';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!account) {
    return null;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/bancos">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {account.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {account.bank_name} • {getAccountTypeLabel(account.account_type)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge 
            variant={account.is_active ? 'default' : 'secondary'}
            className={account.is_active 
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}
          >
            {account.is_active ? 'Activa' : 'Inactiva'}
          </Badge>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/app/finanzas/bancos/cuentas/${accountId}?edit=true`)}
            className="dark:border-gray-600"
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Saldo Actual
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              account.balance >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(account.balance, account.currency || 'COP')}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Saldo Inicial
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(account.initial_balance || 0, account.currency || 'COP')}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Número de Cuenta
            </CardTitle>
            <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {account.account_number ? `****${account.account_number.slice(-4)}` : 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Moneda
            </CardTitle>
            <Calendar className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {account.currency || 'COP'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Building2 className="h-5 w-5 text-blue-600" />
              Información de la Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Banco</p>
              <p className="font-medium text-gray-900 dark:text-white">{account.bank_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tipo de Cuenta</p>
              <p className="font-medium text-gray-900 dark:text-white">{getAccountTypeLabel(account.account_type)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Número Completo</p>
              <p className="font-medium text-gray-900 dark:text-white">{account.account_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fecha de Creación</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatDate(account.created_at)}</p>
            </div>

            <div className="pt-4 space-y-2">
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => router.push(`/app/finanzas/bancos/cuentas/${accountId}/movimientos`)}
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Ver Movimientos
              </Button>
              <Button 
                variant="outline"
                className="w-full dark:border-gray-600"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar Extracto
              </Button>
              <Button 
                variant="outline"
                className="w-full dark:border-gray-600"
                onClick={() => router.push('/app/finanzas/conciliacion-bancaria/nuevo')}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Nueva Conciliación
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                Últimos Movimientos
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Los 10 movimientos más recientes
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push(`/app/finanzas/bancos/cuentas/${accountId}/movimientos`)}
              className="dark:border-gray-600"
            >
              Ver Todos
            </Button>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-8">
                <ArrowRightLeft className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No hay movimientos registrados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        tx.transaction_type === 'credit' 
                          ? 'bg-green-100 dark:bg-green-900/30' 
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        <DollarSign className={`h-4 w-4 ${
                          tx.transaction_type === 'credit' 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {tx.description || 'Sin descripción'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(tx.trans_date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        tx.transaction_type === 'credit' 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {tx.transaction_type === 'credit' ? '+' : '-'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </p>
                      {tx.reference && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Ref: {tx.reference}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
