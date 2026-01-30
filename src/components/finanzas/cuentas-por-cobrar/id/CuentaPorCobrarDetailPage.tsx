'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, Clock, DollarSign, User, MapPin, Phone, Mail, CreditCard, AlertCircle, Receipt, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CuentaPorCobrarDetailService } from './service';
import { CuentaPorCobrarDetalle, AgingInfo, AccountActions } from './types';
import { AccountStatusBadge } from './AccountStatusBadge';
import { PaymentHistoryCard } from './PaymentHistoryCard';
import { AccountActionsCard } from './AccountActionsCard';
import { InstallmentsCard } from './InstallmentsCard';
import { formatCurrency } from '@/utils/Utils';

interface CuentaPorCobrarDetailPageProps {
  accountId: string;
}

export function CuentaPorCobrarDetailPage({ accountId }: CuentaPorCobrarDetailPageProps) {
  const router = useRouter();
  const [account, setAccount] = useState<CuentaPorCobrarDetalle | null>(null);
  const [agingInfo, setAgingInfo] = useState<AgingInfo | null>(null);
  const [accountActions, setAccountActions] = useState<AccountActions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadAccountDetails();
  }, [accountId]);

  const loadAccountDetails = async () => {
    try {
      setIsLoading(true);
      const data = await CuentaPorCobrarDetailService.obtenerDetallesCuentaPorCobrar(accountId);
      
      if (!data) {
        toast.error('Cuenta por cobrar no encontrada');
        router.push('/app/finanzas/cuentas-por-cobrar');
        return;
      }

      setAccount(data);
      setAgingInfo(CuentaPorCobrarDetailService.getAgingInfo(data.days_overdue));
      setAccountActions(CuentaPorCobrarDetailService.getAccountActions(data));
    } catch (error) {
      console.error('Error al cargar detalles:', error);
      toast.error('Error al cargar los detalles de la cuenta');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAccountDetails();
    setIsRefreshing(false);
  };

  const handleBack = () => {
    router.push('/app/finanzas/cuentas-por-cobrar');
  };

  const handleViewInvoice = () => {
    if (account?.invoice_id) {
      router.push(`/app/finanzas/facturas-venta/${account.invoice_id}`);
    }
  };

  const handleExportStatement = () => {
    if (!account) return;
    
    try {
      const content = `
ESTADO DE CUENTA POR COBRAR
===========================

Cliente: ${account.customer_name}
NIT: ${account.customer_nit || 'N/A'}

Factura: ${account.invoice_number || 'N/A'}
Fecha de Vencimiento: ${account.due_date ? new Date(account.due_date).toLocaleDateString('es-CO') : 'N/A'}

Monto Original: ${formatCurrency(account.amount)}
Total Cobrado: ${formatCurrency(account.amount - account.balance)}
Balance Pendiente: ${formatCurrency(account.balance)}

Estado: ${account.status}
Días de Atraso: ${account.days_overdue > 0 ? account.days_overdue : 0}

Fecha de Generación: ${new Date().toLocaleDateString('es-CO')}
      `.trim();
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estado_cuenta_${account.customer_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Estado de cuenta exportado');
    } catch (error) {
      console.error('Error exportando:', error);
      toast.error('Error al exportar el estado de cuenta');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48 mt-2" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Cuenta no encontrada
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            La cuenta por cobrar solicitada no existe o no tienes permisos para verla.
          </p>
          <Button onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Cuentas por Cobrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Receipt className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Cuenta por Cobrar
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              ID: {account.id}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AccountStatusBadge status={account.status} />
          {accountActions?.canApplyPayment && (
            <Button
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => document.getElementById('btn-registrar-cobro')?.click()}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Registrar Cobro
            </Button>
          )}
          {accountActions?.canMarkAsPaid && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20"
              onClick={() => document.getElementById('btn-marcar-cobrada')?.click()}
            >
              Marcar como Cobrada
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportStatement}
            className="dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Estado
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="dark:border-gray-600 dark:hover:bg-gray-800"
          >
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Monto Original
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(account.amount)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Monto inicial de la cuenta
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Balance Pendiente
            </CardTitle>
            <CreditCard className="h-4 w-4 text-red-600 dark:text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(account.balance)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pendiente por cobrar
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Fecha de Vencimiento
            </CardTitle>
            <Calendar className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatDateShort(account.due_date)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Fecha límite de pago
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Días de Atraso
            </CardTitle>
            <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${agingInfo?.color || 'text-gray-900 dark:text-white'}`}>
              {account.days_overdue}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {agingInfo?.period || 'Al día'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Customer Information */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Información del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-white">
                {account.customer_name}
              </span>
            </div>
            
            {account.customer_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300">
                  {account.customer_email}
                </span>
              </div>
            )}

            {account.customer_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300">
                  {account.customer_phone}
                </span>
              </div>
            )}

            {account.customer_address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300">
                  {account.customer_address}
                </span>
              </div>
            )}

            <Separator className="dark:bg-gray-700" />

            {/* Invoice Info */}
            {account.invoice_number && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Factura de Venta
                </h4>
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {account.invoice_number}
                      </p>
                      {account.invoice_date && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDateShort(account.invoice_date)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleViewInvoice}
                      className="dark:border-gray-600"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Ver Factura
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm pt-2">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Fecha de Creación</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDate(account.created_at)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Última Actualización</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDate(account.updated_at)}
                </p>
              </div>
            </div>

            {account.last_reminder_date && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Último Recordatorio</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDate(account.last_reminder_date)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Actions */}
        {accountActions && (
          <AccountActionsCard
            account={account}
            actions={accountActions}
            onUpdate={handleRefresh}
          />
        )}
      </div>

      {/* Plan de Cuotas */}
      <div className="mt-8">
        <InstallmentsCard
          accountId={account.id}
          totalAmount={account.balance}
          accountStatus={account.status}
          onUpdate={handleRefresh}
        />
      </div>

      {/* Payment History */}
      <div className="mt-8">
        <PaymentHistoryCard
          accountId={account.id}
          organizationId={account.organization_id}
          onUpdate={handleRefresh}
        />
      </div>
    </div>
  );
}
