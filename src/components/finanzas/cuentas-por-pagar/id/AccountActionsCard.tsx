'use client';

import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, Edit, DollarSign, AlertTriangle, Download, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CuentaPorPagarDetalle, AccountActions } from './types';
import { CuentaPorPagarDetailService } from './service';
import { formatCurrency } from '@/utils/Utils';

interface AccountActionsCardProps {
  account: CuentaPorPagarDetalle;
  actions: AccountActions;
  onUpdate: () => void;
}

interface Installment {
  id: string;
  installment_number: number;
  amount: number;
  balance: number;
  status: string;
  due_date: string;
}

export function AccountActionsCard({ account, actions, onUpdate }: AccountActionsCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: '',
    reference: '',
    bankAccountId: '',
    installmentId: ''
  });

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const [methods, accounts, cuotas] = await Promise.all([
        CuentaPorPagarDetailService.obtenerMetodosPago(),
        CuentaPorPagarDetailService.obtenerCuentasBancarias(),
        CuentaPorPagarDetailService.obtenerCuotas(account.id)
      ]);
      setPaymentMethods(methods);
      setBankAccounts(accounts);
      setInstallments(cuotas.filter((c: Installment) => c.status !== 'paid'));
    } catch (error) {
      console.error('Error cargando opciones:', error);
    }
  };

  const selectedMethod = paymentMethods.find(
    m => m.payment_method?.code === paymentData.method
  );
  const requiresReference = selectedMethod?.payment_method?.requires_reference || false;

  const handleApplyPayment = async () => {
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      toast.error('Por favor ingresa un monto válido');
      return;
    }

    if (parseFloat(paymentData.amount) > account.balance) {
      toast.error('El monto no puede ser mayor al balance pendiente');
      return;
    }

    if (!paymentData.method) {
      toast.error('Por favor selecciona un método de pago');
      return;
    }

    if (requiresReference && !paymentData.reference) {
      toast.error('Este método de pago requiere una referencia');
      return;
    }

    try {
      setIsLoading(true);
      const amount = parseFloat(paymentData.amount);

      // Si seleccionó una cuota específica, pagar esa cuota
      if (paymentData.installmentId && paymentData.installmentId !== 'general') {
        await CuentaPorPagarDetailService.pagarCuota(
          paymentData.installmentId,
          amount,
          paymentData.method,
          paymentData.reference || undefined,
          paymentData.bankAccountId || undefined
        );
      } else if (installments.length > 0) {
        // Aplicar automáticamente a cuotas pendientes (de la más antigua a la más nueva)
        let remainingAmount = amount;
        for (const installment of installments) {
          if (remainingAmount <= 0) break;
          
          const paymentForInstallment = Math.min(remainingAmount, installment.balance);
          await CuentaPorPagarDetailService.pagarCuota(
            installment.id,
            paymentForInstallment,
            paymentData.method,
            paymentData.reference || undefined,
            paymentData.bankAccountId || undefined
          );
          remainingAmount -= paymentForInstallment;
        }
      } else {
        // Si no hay cuotas, pago directo
        await CuentaPorPagarDetailService.registrarPago(
          account.id,
          amount,
          paymentData.method,
          paymentData.reference || undefined,
          paymentData.bankAccountId || undefined
        );
      }
      
      toast.success('Pago registrado exitosamente');
      setPaymentData({ amount: '', method: '', reference: '', bankAccountId: '', installmentId: '' });
      onUpdate();
    } catch (error) {
      console.error('Error al aplicar pago:', error);
      toast.error('Error al registrar el pago');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    try {
      setIsLoading(true);
      await CuentaPorPagarDetailService.registrarPago(
        account.id,
        account.balance,
        'efectivo',
        'Marcado como pagado'
      );
      
      toast.success('Cuenta marcada como pagada');
      onUpdate();
    } catch (error) {
      console.error('Error al marcar como pagada:', error);
      toast.error('Error al marcar la cuenta como pagada');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportStatement = async () => {
    try {
      const content = await CuentaPorPagarDetailService.generarEstadoCuenta(account.id);
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estado_cuenta_${account.supplier_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
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

  const getSeverityBadge = () => {
    if (account.days_overdue <= 0) return null;
    
    if (account.days_overdue <= 30) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          Atención requerida
        </span>
      );
    } else if (account.days_overdue <= 60) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
          Urgente
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Crítico
        </span>
      );
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Edit className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Acciones de Cuenta
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Gestiona pagos y operaciones para esta cuenta
            </CardDescription>
          </div>
          {getSeverityBadge()}
        </div>
      </CardHeader>
      <CardContent>
        {/* Botones de Acciones en fila */}
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Registrar Pago */}
          {actions.canRegisterPayment && (
            <Dialog>
              <DialogTrigger asChild>
                <Button id="btn-registrar-pago" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Registrar Pago
                </Button>
              </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Registrar Pago
                </DialogTitle>
                <DialogDescription className="dark:text-gray-400">
                  Balance pendiente: {formatCurrency(account.balance)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Selector de cuota si hay cuotas */}
                {installments.length > 0 && (
                  <div>
                    <Label className="text-gray-700 dark:text-gray-300">
                      Aplicar a cuota (opcional)
                    </Label>
                    <Select 
                      value={paymentData.installmentId} 
                      onValueChange={(value) => {
                        const selectedInst = installments.find(i => i.id === value);
                        setPaymentData({ 
                          ...paymentData, 
                          installmentId: value,
                          amount: selectedInst ? selectedInst.balance.toString() : paymentData.amount
                        });
                      }}
                    >
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                        <SelectValue placeholder="Seleccionar cuota o aplicar automáticamente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">Aplicar automáticamente a cuotas pendientes</SelectItem>
                        {installments.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            Cuota #{inst.installment_number} - Saldo: {formatCurrency(inst.balance)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Si no seleccionas una cuota, el pago se aplicará automáticamente a las cuotas más antiguas
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-gray-700 dark:text-gray-300">
                    Monto del pago
                  </Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentData({ ...paymentData, amount: account.balance.toString() })}
                      className="text-xs dark:border-gray-600"
                    >
                      Pago total
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentData({ ...paymentData, amount: (account.balance / 2).toString() })}
                      className="text-xs dark:border-gray-600"
                    >
                      50%
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-gray-700 dark:text-gray-300">
                    Método de pago
                  </Label>
                  <Select 
                    value={paymentData.method} 
                    onValueChange={(value) => setPaymentData({ ...paymentData, method: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.id} value={method.payment_method?.code || method.id.toString()}>
                          {method.payment_method?.name || 'Sin nombre'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {bankAccounts.length > 0 && (
                  <div>
                    <Label className="text-gray-700 dark:text-gray-300">
                      Cuenta bancaria (opcional)
                    </Label>
                    <Select 
                      value={paymentData.bankAccountId} 
                      onValueChange={(value) => setPaymentData({ ...paymentData, bankAccountId: value })}
                    >
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              {account.name} - {account.bank_name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {requiresReference && (
                  <div>
                    <Label className="text-gray-700 dark:text-gray-300">
                      Referencia *
                    </Label>
                    <Input
                      placeholder="Número de comprobante"
                      value={paymentData.reference}
                      onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                      className="dark:bg-gray-900 dark:border-gray-600"
                    />
                  </div>
                )}
                <Button 
                  onClick={handleApplyPayment}
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {isLoading ? 'Procesando...' : 'Registrar Pago'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}

          {/* Marcar como Pagada */}
          {actions.canMarkAsPaid && (
            <Dialog>
              <DialogTrigger asChild>
                <Button id="btn-marcar-pagada" variant="outline" className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marcar como Pagada
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-gray-900 dark:text-white">
                    Marcar como Pagada
                  </DialogTitle>
                  <DialogDescription className="dark:text-gray-400">
                    ¿Estás seguro de que deseas marcar esta cuenta como pagada?
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                        Balance pendiente: {formatCurrency(account.balance)}
                      </span>
                    </div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                      Esta acción creará un registro de pago por el balance total pendiente.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" className="dark:border-gray-600">
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleMarkAsPaid}
                      disabled={isLoading}
                      className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {isLoading ? 'Procesando...' : 'Confirmar'}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Exportar Estado de Cuenta */}
          <Button 
            variant="outline" 
            className="dark:border-gray-600 dark:hover:bg-gray-700"
            onClick={handleExportStatement}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Estado
          </Button>
        </div>

        {/* Información de la cuenta */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Monto original:</span>
              <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(account.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total pagado:</span>
              <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(account.amount - account.balance)}</span>
            </div>
            <div className="flex justify-between">
              <span>Balance pendiente:</span>
              <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(account.balance)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
