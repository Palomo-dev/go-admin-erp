'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import EmployeeLoansService from '@/lib/services/employeeLoansService';
import type { EmployeeLoan, LoanInstallment } from '@/lib/services/employeeLoansService';
import { InstallmentsTable } from '@/components/hrm/prestamos/[id]';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Banknote,
  RefreshCw,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  DollarSign,
  Percent,
  Hash,
  FileText,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  paid: 'Pagado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
};

const loanTypeLabels: Record<string, string> = {
  personal: 'Personal',
  emergency: 'Emergencia',
  education: 'Educación',
  housing: 'Vivienda',
  vehicle: 'Vehículo',
  medical: 'Médico',
  other: 'Otro',
};

export default function PrestamoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const loanId = params.id as string;

  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [loan, setLoan] = useState<EmployeeLoan | null>(null);
  const [installments, setInstallments] = useState<LoanInstallment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentInstallment, setPaymentInstallment] = useState<LoanInstallment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmployeeLoansService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [loanData, installmentsData] = await Promise.all([
        service.getById(loanId),
        service.getInstallments(loanId),
      ]);

      if (!loanData) {
        toast({
          title: 'Error',
          description: 'Préstamo no encontrado',
          variant: 'destructive',
        });
        router.push('/app/hrm/prestamos');
        return;
      }

      setLoan(loanData);
      setInstallments(installmentsData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el préstamo',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, loanId, router, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && loanId) {
      loadData();
    }
  }, [organization?.id, orgLoading, loanId, loadData]);

  // Handlers
  const handleApprove = async () => {
    const service = getService();
    if (!service || !loan) return;

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        toast({ title: 'Error', description: 'No se pudo obtener el usuario actual', variant: 'destructive' });
        return;
      }
      await service.approve(loan.id, userId);
      toast({ title: 'Préstamo aprobado y activado' });
      setApproveOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar el préstamo',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    const service = getService();
    if (!service || !loan) return;

    try {
      await service.cancel(loan.id);
      toast({ title: 'Préstamo cancelado' });
      setCancelOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo cancelar el préstamo',
        variant: 'destructive',
      });
    }
  };

  const handleRegisterPayment = async () => {
    if (!paymentInstallment || !paymentAmount) return;
    const service = getService();
    if (!service) return;

    try {
      await service.registerPayment(
        paymentInstallment.id,
        parseFloat(paymentAmount)
      );
      toast({ title: 'Pago registrado correctamente' });
      setPaymentInstallment(null);
      setPaymentAmount('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo registrar el pago',
        variant: 'destructive',
      });
    }
  };

  const openPaymentDialog = (installment: LoanInstallment) => {
    const remaining = installment.amount - (installment.amount_paid || 0);
    setPaymentInstallment(installment);
    setPaymentAmount(remaining.toString());
  };

  // Calculated values
  const getProgress = () => {
    if (!loan || loan.total_amount === 0) return 0;
    const paid = loan.total_amount - loan.balance;
    return (paid / loan.total_amount) * 100;
  };

  const getOverdueCount = () => {
    const today = new Date().toISOString().split('T')[0];
    return installments.filter(i => i.status !== 'paid' && i.due_date < today).length;
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Préstamo no encontrado</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm/prestamos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Banknote className="h-7 w-7 text-blue-600" />
              {loan.loan_number || 'Préstamo'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Préstamos / Detalle
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {loan.status === 'pending' && (
            <>
              <Button
                onClick={() => setApproveOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Aprobar
              </Button>
            </>
          )}
          {loan.status === 'active' && (
            <Button
              variant="outline"
              onClick={() => setCancelOpen(true)}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Loan Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">Información del Préstamo</span>
              <Badge className={statusColors[loan.status || 'pending']}>
                {statusLabels[loan.status || 'pending']}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Employee Info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <User className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {loan.employee_name}
                </p>
                {loan.employee_code && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {loan.employee_code}
                  </p>
                )}
              </div>
            </div>

            {/* Loan Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tipo</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {loanTypeLabels[loan.loan_type || 'personal'] || loan.loan_type}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Principal</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(loan.principal, loan.currency_code)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Percent className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tasa</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {loan.interest_rate || 0}% anual
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Hash className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Cuotas</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {loan.installments_paid || 0} / {loan.installments_total}
                  </p>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              {loan.disbursement_date && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Desembolso:</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatDate(loan.disbursement_date)}
                  </span>
                </div>
              )}
              {loan.first_payment_date && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Primera cuota:</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatDate(loan.first_payment_date)}
                  </span>
                </div>
              )}
              {loan.last_payment_date && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Último pago:</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatDate(loan.last_payment_date)}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {loan.description && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción</p>
                <p className="text-gray-900 dark:text-white">{loan.description}</p>
              </div>
            )}

            {/* Rejection Reason */}
            {loan.status === 'rejected' && loan.rejection_reason && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Motivo del rechazo:</p>
                <p className="text-red-700 dark:text-red-300">{loan.rejection_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">
              Resumen Financiero
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total a Pagar</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(loan.total_amount, loan.currency_code)}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Saldo Pendiente</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(loan.balance, loan.currency_code)}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Cuota Mensual</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(loan.installment_amount, loan.currency_code)}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">Progreso de Pago</p>
              <Progress value={getProgress()} className="h-3" />
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {getProgress().toFixed(1)}% completado
              </p>
            </div>
            {getOverdueCount() > 0 && (
              <div className="p-2 rounded bg-red-100 dark:bg-red-900/30">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  ⚠️ {getOverdueCount()} cuota(s) vencida(s)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Installments */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Calendar className="h-5 w-5 text-blue-600" />
            Plan de Cuotas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InstallmentsTable
            installments={installments}
            currencyCode={loan.currency_code}
            onRegisterPayment={openPaymentDialog}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/prestamos">
              <Button variant="outline" size="sm">
                ← Volver a Préstamos
              </Button>
            </Link>
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← HRM
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Aprobar préstamo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Al aprobar se activará el préstamo y se generarán las {loan.installments_total} cuotas de{' '}
              {formatCurrency(loan.installment_amount, loan.currency_code)} cada una.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Cancelar préstamo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción cancelará el préstamo activo. Las cuotas pendientes quedarán sin efecto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sí, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Dialog */}
      <Dialog open={!!paymentInstallment} onOpenChange={() => setPaymentInstallment(null)}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Registrar Pago - Cuota {paymentInstallment?.installment_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {paymentInstallment && (
              <>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Monto cuota:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                        {formatCurrency(paymentInstallment.amount, loan.currency_code)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Ya pagado:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                        {formatCurrency(paymentInstallment.amount_paid || 0, loan.currency_code)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Pendiente:</span>
                      <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                        {formatCurrency(
                          paymentInstallment.amount - (paymentInstallment.amount_paid || 0),
                          loan.currency_code
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Monto a registrar</Label>
                  <Input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPaymentInstallment(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterPayment}
              disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Registrar Pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
