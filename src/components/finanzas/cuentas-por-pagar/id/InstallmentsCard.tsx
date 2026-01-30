'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, Plus, Trash2, DollarSign, AlertTriangle, CheckCircle, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CuentaPorPagarDetailService } from './service';
import { APInstallment } from './types';
import { formatCurrency } from '@/utils/Utils';

interface InstallmentsCardProps {
  accountId: string;
  totalAmount: number;
  onUpdate?: () => void;
}

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  pending: {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: CalendarDays
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

export function InstallmentsCard({ accountId, totalAmount, onUpdate }: InstallmentsCardProps) {
  const [installments, setInstallments] = useState<APInstallment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    numberOfInstallments: 3,
    interestRate: 0
  });

  // Estados para pagar cuota
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<APInstallment | null>(null);
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
    try {
      setIsLoading(true);
      const data = await CuentaPorPagarDetailService.obtenerCuotas(accountId);
      
      // Marcar cuotas vencidas
      const today = new Date();
      const processedData = data.map(inst => {
        const dueDate = new Date(inst.due_date);
        if (dueDate < today && inst.status === 'pending') {
          return { ...inst, status: 'overdue' as const };
        }
        return inst;
      });
      
      setInstallments(processedData);
    } catch (error) {
      console.error('Error cargando cuotas:', error);
      toast.error('Error al cargar las cuotas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInstallments = async () => {
    if (formData.numberOfInstallments < 2 || formData.numberOfInstallments > 60) {
      toast.error('El número de cuotas debe estar entre 2 y 60');
      return;
    }

    try {
      setIsCreating(true);
      await CuentaPorPagarDetailService.crearCuotas(
        accountId,
        totalAmount,
        formData.numberOfInstallments,
        new Date(),
        formData.interestRate
      );
      
      toast.success('Cuotas creadas exitosamente');
      setShowCreateDialog(false);
      await loadInstallments();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error creando cuotas:', error);
      toast.error('Error al crear las cuotas');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInstallments = async () => {
    try {
      await CuentaPorPagarDetailService.eliminarCuotas(accountId);
      toast.success('Cuotas eliminadas');
      setShowDeleteDialog(false);
      setInstallments([]);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error eliminando cuotas:', error);
      toast.error('Error al eliminar las cuotas');
    }
  };

  // Abrir diálogo para pagar cuota
  const openPayDialog = async (installment: APInstallment) => {
    setSelectedInstallment(installment);
    setPaymentData({
      amount: installment.balance.toString(),
      method: '',
      reference: ''
    });
    
    // Cargar métodos de pago
    try {
      const methods = await CuentaPorPagarDetailService.obtenerMetodosPago();
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
      await CuentaPorPagarDetailService.pagarCuota(
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
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error pagando cuota:', error);
      toast.error('Error al registrar el pago');
    } finally {
      setIsPaying(false);
    }
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
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Plan de Cuotas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Plan de Cuotas
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              {installments.length > 0 
                ? `${installments.length} cuotas programadas`
                : 'Crea un plan de pagos fraccionados'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {installments.length === 0 ? (
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500">
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Cuotas
                  </Button>
                </DialogTrigger>
                <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-gray-900 dark:text-white">Crear Plan de Cuotas</DialogTitle>
                    <DialogDescription className="dark:text-gray-400">
                      Divide el saldo pendiente de {formatCurrency(totalAmount)} en cuotas mensuales
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="installments" className="text-gray-700 dark:text-gray-300">
                        Número de cuotas
                      </Label>
                      <Input
                        id="installments"
                        type="number"
                        min={2}
                        max={60}
                        value={formData.numberOfInstallments}
                        onChange={(e) => setFormData({ ...formData, numberOfInstallments: parseInt(e.target.value) })}
                        className="mt-1 dark:bg-gray-900 dark:border-gray-600"
                      />
                    </div>
                    <div>
                      <Label htmlFor="interestRate" className="text-gray-700 dark:text-gray-300">
                        Tasa de interés mensual (%)
                      </Label>
                      <Input
                        id="interestRate"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={formData.interestRate}
                        onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) })}
                        className="mt-1 dark:bg-gray-900 dark:border-gray-600"
                      />
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <strong>Cuota estimada:</strong>{' '}
                        {formatCurrency(
                          (totalAmount / formData.numberOfInstallments) * 
                          (1 + formData.interestRate / 100)
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
                      {isCreating ? 'Creando...' : 'Crear Cuotas'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400 dark:border-gray-600">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar Plan
                  </Button>
                </DialogTrigger>
                <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-gray-900 dark:text-white">¿Eliminar plan de cuotas?</DialogTitle>
                    <DialogDescription className="dark:text-gray-400">
                      Esta acción eliminará todas las cuotas programadas. Los pagos ya realizados no se verán afectados.
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
        </div>
      </CardHeader>
      <CardContent>
        {installments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay cuotas programadas</p>
            <p className="text-sm mt-1">Crea un plan de cuotas para fraccionar el pago</p>
          </div>
        ) : (
          <div className="space-y-3">
            {installments.map((installment) => {
              const config = statusConfig[installment.status] || statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <div
                  key={installment.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold">
                      {installment.installment_number}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(installment.amount)}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Vence: {formatDate(installment.due_date)}
                      </p>
                      {installment.paid_amount > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Pagado: {formatCurrency(installment.paid_amount)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={config.className}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
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
              );
            })}
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
