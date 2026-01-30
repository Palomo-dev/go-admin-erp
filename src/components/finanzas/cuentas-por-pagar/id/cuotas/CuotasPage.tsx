'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  CalendarDays, 
  Plus, 
  Trash2, 
  DollarSign, 
  Download, 
  Upload,
  Edit2,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CuentaPorPagarDetailService } from '../service';
import { CuentaPorPagarDetalle, APInstallment } from '../types';
import { formatCurrency } from '@/utils/Utils';

interface CuotasPageProps {
  accountId: string;
}

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  pending: {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: Clock
  },
  partial: {
    label: 'Parcial',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: DollarSign
  },
  paid: {
    label: 'Pagada',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle
  },
  overdue: {
    label: 'Vencida',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: AlertTriangle
  }
};

export function CuotasPage({ accountId }: CuotasPageProps) {
  const router = useRouter();
  const [account, setAccount] = useState<CuentaPorPagarDetalle | null>(null);
  const [installments, setInstallments] = useState<APInstallment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<APInstallment | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const [createForm, setCreateForm] = useState({
    numberOfInstallments: 3,
    interestRate: 0
  });

  const [payForm, setPayForm] = useState({
    amount: '',
    method: '',
    reference: '',
    bankAccountId: ''
  });

  const [editForm, setEditForm] = useState({
    due_date: '',
    amount: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [accountId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [accountData, installmentsData, methods, accounts] = await Promise.all([
        CuentaPorPagarDetailService.obtenerDetalleCuentaPorPagar(accountId),
        CuentaPorPagarDetailService.obtenerCuotas(accountId),
        CuentaPorPagarDetailService.obtenerMetodosPago(),
        CuentaPorPagarDetailService.obtenerCuentasBancarias()
      ]);

      if (!accountData) {
        toast.error('Cuenta no encontrada');
        router.push('/app/finanzas/cuentas-por-pagar');
        return;
      }

      setAccount(accountData);
      
      // Marcar cuotas vencidas
      const today = new Date();
      const processedInstallments = installmentsData.map(inst => {
        const dueDate = new Date(inst.due_date);
        if (dueDate < today && inst.status === 'pending') {
          return { ...inst, status: 'overdue' as const };
        }
        return inst;
      });
      
      setInstallments(processedInstallments);
      setPaymentMethods(methods);
      setBankAccounts(accounts);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.push(`/app/finanzas/cuentas-por-pagar/${accountId}`);
  };

  const handleCreateInstallments = async () => {
    if (!account) return;

    if (createForm.numberOfInstallments < 2 || createForm.numberOfInstallments > 60) {
      toast.error('El número de cuotas debe estar entre 2 y 60');
      return;
    }

    try {
      setIsCreating(true);
      await CuentaPorPagarDetailService.crearCuotas(
        accountId,
        account.balance,
        createForm.numberOfInstallments,
        new Date(),
        createForm.interestRate
      );
      
      toast.success('Plan de cuotas creado exitosamente');
      setShowCreateDialog(false);
      await loadData();
    } catch (error) {
      console.error('Error creando cuotas:', error);
      toast.error('Error al crear el plan de cuotas');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInstallments = async () => {
    try {
      await CuentaPorPagarDetailService.eliminarCuotas(accountId);
      toast.success('Plan de cuotas eliminado');
      setInstallments([]);
    } catch (error) {
      console.error('Error eliminando cuotas:', error);
      toast.error('Error al eliminar el plan');
    }
  };

  const handlePayInstallment = async () => {
    if (!selectedInstallment) return;

    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (amount > selectedInstallment.balance) {
      toast.error('El monto no puede ser mayor al saldo de la cuota');
      return;
    }

    if (!payForm.method) {
      toast.error('Selecciona un método de pago');
      return;
    }

    try {
      await CuentaPorPagarDetailService.pagarCuota(
        selectedInstallment.id,
        amount,
        payForm.method,
        payForm.reference || undefined,
        payForm.bankAccountId || undefined
      );
      
      toast.success('Pago registrado exitosamente');
      setShowPayDialog(false);
      setPayForm({ amount: '', method: '', reference: '', bankAccountId: '' });
      setSelectedInstallment(null);
      await loadData();
    } catch (error) {
      console.error('Error pagando cuota:', error);
      toast.error('Error al registrar el pago');
    }
  };

  const handleEditInstallment = async () => {
    if (!selectedInstallment) return;

    try {
      await CuentaPorPagarDetailService.actualizarCuota(selectedInstallment.id, {
        due_date: editForm.due_date || selectedInstallment.due_date,
        amount: editForm.amount ? parseFloat(editForm.amount) : selectedInstallment.amount,
        notes: editForm.notes
      });
      
      toast.success('Cuota actualizada');
      setShowEditDialog(false);
      setSelectedInstallment(null);
      await loadData();
    } catch (error) {
      console.error('Error actualizando cuota:', error);
      toast.error('Error al actualizar la cuota');
    }
  };

  const openPayDialog = (installment: APInstallment) => {
    setSelectedInstallment(installment);
    setPayForm({ 
      amount: installment.balance.toString(), 
      method: '', 
      reference: '', 
      bankAccountId: '' 
    });
    setShowPayDialog(true);
  };

  const openEditDialog = (installment: APInstallment) => {
    setSelectedInstallment(installment);
    setEditForm({
      due_date: installment.due_date,
      amount: installment.amount.toString(),
      notes: installment.notes || ''
    });
    setShowEditDialog(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStats = () => {
    const total = installments.reduce((sum, i) => sum + i.amount, 0);
    const paid = installments.reduce((sum, i) => sum + i.paid_amount, 0);
    const pending = installments.filter(i => i.status === 'pending' || i.status === 'overdue').length;
    const overdue = installments.filter(i => i.status === 'overdue').length;
    
    return { total, paid, pending, overdue, remaining: total - paid };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Cuenta no encontrada</p>
        <Button onClick={() => router.push('/app/finanzas/cuentas-por-pagar')} className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Plan de Cuotas
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {account.supplier_name} • {account.invoice_number || 'Sin factura'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadData}
            className="dark:border-gray-600"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          {installments.length === 0 ? (
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear Plan
            </Button>
          ) : (
            <Button 
              variant="outline"
              onClick={handleDeleteInstallments}
              className="text-red-600 dark:text-red-400 dark:border-gray-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar Plan
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Total Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(stats.total)}
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Pagado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.paid)}
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Por Pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(stats.remaining)}
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Cuotas Vencidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {stats.overdue}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Installments List */}
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Cronograma de Pagos
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            {installments.length > 0 
              ? `${installments.length} cuotas programadas`
              : 'No hay cuotas programadas'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {installments.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <CalendarDays className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No hay plan de cuotas</p>
              <p className="text-sm mt-1">Crea un plan para fraccionar el pago de esta cuenta</p>
              <Button 
                onClick={() => setShowCreateDialog(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Plan de Cuotas
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {installments.map((installment) => {
                const config = statusConfig[installment.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                const progress = installment.amount > 0 
                  ? (installment.paid_amount / installment.amount) * 100 
                  : 0;

                return (
                  <div
                    key={installment.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-lg">
                        {installment.installment_number}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(installment.amount)}
                          </p>
                          <Badge className={config.className}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Vence: {formatDate(installment.due_date)}
                        </p>
                        {installment.paid_amount > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                              <span>Pagado: {formatCurrency(installment.paid_amount)}</span>
                              <span>•</span>
                              <span>Saldo: {formatCurrency(installment.balance)}</span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {installment.notes && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">
                            {installment.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {installment.status !== 'paid' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(installment)}
                            className="dark:border-gray-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openPayDialog(installment)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Pagar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Installments Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Crear Plan de Cuotas</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Divide el saldo de {formatCurrency(account.balance)} en cuotas mensuales
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Número de cuotas</Label>
              <Input
                type="number"
                min={2}
                max={60}
                value={createForm.numberOfInstallments}
                onChange={(e) => setCreateForm({ ...createForm, numberOfInstallments: parseInt(e.target.value) || 2 })}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Tasa de interés mensual (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={createForm.interestRate}
                onChange={(e) => setCreateForm({ ...createForm, interestRate: parseFloat(e.target.value) || 0 })}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Cuota estimada:</strong>{' '}
                {formatCurrency(
                  (account.balance / createForm.numberOfInstallments) * 
                  (1 + createForm.interestRate / 100)
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateInstallments} 
              disabled={isCreating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreating ? 'Creando...' : 'Crear Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Installment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Pagar Cuota {selectedInstallment?.installment_number}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Saldo pendiente: {formatCurrency(selectedInstallment?.balance || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Monto a pagar</Label>
              <Input
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPayForm({ ...payForm, amount: selectedInstallment?.balance.toString() || '' })}
                  className="text-xs dark:border-gray-600"
                >
                  Pago total
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Método de pago</Label>
              <Select 
                value={payForm.method} 
                onValueChange={(value) => setPayForm({ ...payForm, method: value })}
              >
                <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.payment_methods?.code || ''}>
                      {method.payment_methods?.name || 'Sin nombre'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bankAccounts.length > 0 && (
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Cuenta bancaria (opcional)</Label>
                <Select 
                  value={payForm.bankAccountId} 
                  onValueChange={(value) => setPayForm({ ...payForm, bankAccountId: value })}
                >
                  <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} - {account.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Referencia (opcional)</Label>
              <Input
                value={payForm.reference}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                placeholder="Número de comprobante"
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button 
              onClick={handlePayInstallment}
              className="bg-green-600 hover:bg-green-700"
            >
              Registrar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Installment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Editar Cuota {selectedInstallment?.installment_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Fecha de vencimiento</Label>
              <Input
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Monto</Label>
              <Input
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Notas</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Notas adicionales..."
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button 
              onClick={handleEditInstallment}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
