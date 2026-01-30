'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CreditCard, Plus, Loader2, Trash2, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { CuentaPorCobrarDetailService } from './service';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Installment {
  id: string;
  account_receivable_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal?: number;
  interest?: number;
  balance: number;
  status: string;
  paid_amount: number;
  paid_at?: string;
  days_overdue?: number;
  notes?: string;
}

interface InstallmentsCardProps {
  accountId: string;
  totalAmount: number;
  accountStatus?: string;
  onUpdate?: () => void;
}

export function InstallmentsCard({ accountId, totalAmount, accountStatus, onUpdate }: InstallmentsCardProps) {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [numberOfInstallments, setNumberOfInstallments] = useState(3);
  const [interestRate, setInterestRate] = useState(0);

  // Estados para pagar cuota
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: '',
    reference: ''
  });

  useEffect(() => {
    loadInstallments();
  }, [accountId]);

  const loadInstallments = async () => {
    setIsLoading(true);
    try {
      const data = await CuentaPorCobrarDetailService.obtenerCuotas(accountId);
      setInstallments(data);
    } catch (error) {
      console.error('Error al cargar cuotas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInstallments = async () => {
    if (numberOfInstallments < 2 || numberOfInstallments > 36) {
      toast.error('El número de cuotas debe estar entre 2 y 36');
      return;
    }

    setIsCreating(true);
    try {
      await CuentaPorCobrarDetailService.crearCuotas(
        accountId,
        totalAmount,
        numberOfInstallments,
        new Date()
      );
      toast.success(`Se han creado ${numberOfInstallments} cuotas exitosamente`);
      setShowCreateDialog(false);
      loadInstallments();
      onUpdate?.();
    } catch (error) {
      console.error('Error al crear cuotas:', error);
      toast.error('Error al crear las cuotas');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInstallments = async () => {
    try {
      await CuentaPorCobrarDetailService.eliminarCuotas(accountId);
      toast.success('Cuotas eliminadas');
      setShowDeleteDialog(false);
      setInstallments([]);
      onUpdate?.();
    } catch (error) {
      console.error('Error eliminando cuotas:', error);
      toast.error('Error al eliminar las cuotas');
    }
  };

  // Abrir diálogo para pagar cuota
  const openPayDialog = async (installment: Installment) => {
    setSelectedInstallment(installment);
    setPaymentData({
      amount: installment.balance.toString(),
      method: '',
      reference: ''
    });
    
    // Cargar métodos de pago
    try {
      const methods = await CuentaPorCobrarDetailService.obtenerMetodosPago();
      setPaymentMethods(methods);
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
    }
    
    setShowPayDialog(true);
  };

  // Pagar cuota
  const handlePayInstallment = async () => {
    if (!selectedInstallment) return;
    
    const amount = parseFloat(paymentData.amount);
    if (!amount || amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    
    if (amount > selectedInstallment.balance) {
      toast.error('El monto no puede ser mayor al saldo de la cuota');
      return;
    }
    
    if (!paymentData.method) {
      toast.error('Selecciona un método de pago');
      return;
    }

    try {
      setIsPaying(true);
      await CuentaPorCobrarDetailService.pagarCuota(
        selectedInstallment.id,
        amount,
        paymentData.method,
        paymentData.reference || undefined
      );
      
      toast.success('Pago registrado exitosamente');
      setShowPayDialog(false);
      setSelectedInstallment(null);
      setPaymentData({ amount: '', method: '', reference: '' });
      await loadInstallments();
      onUpdate?.();
    } catch (error) {
      console.error('Error pagando cuota:', error);
      toast.error('Error al registrar el pago');
    } finally {
      setIsPaying(false);
    }
  };

  const getStatusBadge = (status: string, daysOverdue?: number) => {
    if (status === 'paid') {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Pagada</Badge>;
    }
    if (daysOverdue && daysOverdue > 0) {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Vencida ({daysOverdue}d)</Badge>;
    }
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Pendiente</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Plan de Cuotas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Plan de Cuotas
        </CardTitle>
        <div className="flex items-center gap-2">
          {installments.length === 0 && accountStatus !== 'paid' ? (
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-1" />
                  Crear Cuotas
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-gray-800">
                <DialogHeader>
                  <DialogTitle>Crear Plan de Cuotas</DialogTitle>
                  <DialogDescription>
                    Divide el saldo pendiente de {formatCurrency(totalAmount)} en cuotas mensuales
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="installments">Número de cuotas</Label>
                    <Input
                      id="installments"
                      type="number"
                      min={2}
                      max={60}
                      value={numberOfInstallments}
                      onChange={(e) => setNumberOfInstallments(parseInt(e.target.value) || 2)}
                      className="dark:bg-gray-900 dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interest">Tasa de interés mensual (%)</Label>
                    <Input
                      id="interest"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={interestRate}
                      onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                      className="dark:bg-gray-900 dark:border-gray-600"
                    />
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Cuota estimada: <span className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(totalAmount / numberOfInstallments)}</span>
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="dark:border-gray-600">
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateInstallments} disabled={isCreating} className="bg-blue-600 hover:bg-blue-700">
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      'Crear Cuotas'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-red-600 border-red-600 hover:bg-red-50 dark:text-red-400 dark:border-red-400 dark:hover:bg-red-900/20">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar Plan
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-gray-800">
                <DialogHeader>
                  <DialogTitle>Eliminar Plan de Cuotas</DialogTitle>
                  <DialogDescription>
                    ¿Estás seguro de eliminar todas las cuotas? Esta acción no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="dark:border-gray-600">
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={handleDeleteInstallments}>
                    Eliminar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {installments.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay cuotas configuradas para esta cuenta.</p>
            <p className="text-sm mt-1">Crea un plan de cuotas para facilitar el cobro.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {installments.map((installment) => (
              <div
                key={installment.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-semibold text-sm">
                    {installment.installment_number}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Cuota {installment.installment_number}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Vence: {formatDate(installment.due_date)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 sm:mt-0">
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(installment.amount)}
                    </div>
                    {installment.paid_amount > 0 && (
                      <div className="text-xs text-green-600 dark:text-green-400">
                        Pagado: {formatCurrency(installment.paid_amount)}
                      </div>
                    )}
                  </div>
                  {getStatusBadge(installment.status, installment.days_overdue)}
                  {installment.status !== 'paid' && (
                    <>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Saldo: {formatCurrency(installment.balance)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPayDialog(installment)}
                        className="ml-2 text-blue-600 border-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-400 dark:hover:bg-blue-900/20"
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        Pagar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Resumen */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total Pagado</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(installments.reduce((sum, i) => sum + i.paid_amount, 0))}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500 dark:text-gray-400">Pendiente</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(installments.reduce((sum, i) => sum + i.balance, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Diálogo para pagar cuota */}
        <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white">
                Pagar Cuota #{selectedInstallment?.installment_number}
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
                  placeholder="0.00"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="mt-1 dark:bg-gray-900 dark:border-gray-600"
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentData({ ...paymentData, amount: (selectedInstallment?.balance || 0).toString() })}
                    className="text-xs dark:border-gray-600"
                  >
                    Pago total
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentData({ ...paymentData, amount: ((selectedInstallment?.balance || 0) / 2).toString() })}
                    className="text-xs dark:border-gray-600"
                  >
                    50%
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Método de pago</Label>
                <Select 
                  value={paymentData.method} 
                  onValueChange={(value) => setPaymentData({ ...paymentData, method: value })}
                >
                  <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
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
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Referencia (opcional)</Label>
                <Input
                  placeholder="Número de comprobante"
                  value={paymentData.reference}
                  onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
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
                disabled={isPaying}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {isPaying ? 'Procesando...' : 'Registrar Pago'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
