'use client';

import { useState } from 'react';
import { MessageCircle, CreditCard, CheckCircle, Edit, Send, DollarSign, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CuentaPorCobrarDetalle, AccountActions } from './types';
import { CuentaPorCobrarDetailService } from './service';
import { formatCurrency } from '@/utils/Utils';

interface Installment {
  id: string;
  installment_number: number;
  amount: number;
  balance: number;
  status: string;
  due_date: string;
}

interface AccountActionsCardProps {
  account: CuentaPorCobrarDetalle;
  actions: AccountActions;
  onUpdate: () => void;
}

export function AccountActionsCard({ account, actions, onUpdate }: AccountActionsCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: '',
    reference: '',
    installmentId: ''
  });

  // Cargar métodos de pago e installments al abrir el diálogo
  const loadPaymentData = async () => {
    try {
      const [methods, cuotas] = await Promise.all([
        CuentaPorCobrarDetailService.obtenerMetodosPago(),
        CuentaPorCobrarDetailService.obtenerCuotas(account.id)
      ]);
      setPaymentMethods(methods);
      setInstallments(cuotas.filter((c: Installment) => c.status !== 'paid'));
    } catch (error) {
      console.error('Error cargando datos de pago:', error);
    }
  };

  const handleSendReminder = async () => {
    if (!reminderMessage.trim()) {
      toast.error('Por favor ingresa un mensaje para el recordatorio');
      return;
    }

    try {
      setIsLoading(true);
      await CuentaPorCobrarDetailService.enviarRecordatorio(account.id, reminderMessage);
      toast.success('Recordatorio enviado exitosamente');
      setReminderMessage('');
      onUpdate();
    } catch (error) {
      console.error('Error al enviar recordatorio:', error);
      toast.error('Error al enviar el recordatorio');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPayment = async () => {
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      toast.error('Por favor ingresa un monto válido');
      return;
    }

    if (!paymentData.method) {
      toast.error('Por favor selecciona un método de pago');
      return;
    }

    const amount = parseFloat(paymentData.amount);

    try {
      setIsLoading(true);

      // Si seleccionó una cuota específica, pagar esa cuota
      if (paymentData.installmentId && paymentData.installmentId !== 'general') {
        const selectedInstallment = installments.find(i => i.id === paymentData.installmentId);
        if (selectedInstallment && amount > selectedInstallment.balance) {
          toast.error('El monto no puede ser mayor al saldo de la cuota');
          setIsLoading(false);
          return;
        }

        await CuentaPorCobrarDetailService.pagarCuota(
          paymentData.installmentId,
          amount,
          paymentData.method,
          paymentData.reference || undefined
        );
      } else {
        // Pago general - aplicar automáticamente a cuotas pendientes (de la más antigua a la más nueva)
        if (amount > account.balance) {
          toast.error('El monto no puede ser mayor al balance pendiente');
          setIsLoading(false);
          return;
        }

        // Si hay cuotas pendientes, aplicar el pago automáticamente
        if (installments.length > 0) {
          let remainingAmount = amount;
          for (const installment of installments) {
            if (remainingAmount <= 0) break;
            
            const paymentForInstallment = Math.min(remainingAmount, installment.balance);
            await CuentaPorCobrarDetailService.pagarCuota(
              installment.id,
              paymentForInstallment,
              paymentData.method,
              paymentData.reference || undefined
            );
            remainingAmount -= paymentForInstallment;
          }
        } else {
          // Si no hay cuotas, aplicar pago directo a la cuenta
          await CuentaPorCobrarDetailService.aplicarPago(
            account.id,
            amount,
            paymentData.method,
            paymentData.reference || undefined
          );
        }
      }
      
      toast.success('Pago aplicado exitosamente');
      setPaymentData({ amount: '', method: '', reference: '', installmentId: '' });
      setShowPaymentDialog(false);
      onUpdate();
    } catch (error) {
      console.error('Error al aplicar pago:', error);
      toast.error('Error al aplicar el pago');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    try {
      setIsLoading(true);
      await CuentaPorCobrarDetailService.aplicarPago(
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

  const getDefaultReminderMessage = () => {
    return `Estimado/a ${account.customer_name},

Le recordamos que tiene una cuenta pendiente por valor de ${formatCurrency(account.balance)} con ${account.days_overdue} días de atraso.

Fecha de vencimiento: ${new Date(account.due_date).toLocaleDateString('es-CO')}

Le agradecemos realizar el pago lo antes posible.

Saludos cordiales.`;
  };

  const getSeverityBadge = () => {
    if (account.days_overdue <= 0) return null;
    
    if (account.days_overdue <= 30) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          Atención requerida
        </Badge>
      );
    } else if (account.days_overdue <= 60) {
      return (
        <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
          Urgente
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Crítico
        </Badge>
      );
    }
  };

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Acciones de Cuenta
            </CardTitle>
            <CardDescription>
              Gestiona pagos y recordatorios para esta cuenta
            </CardDescription>
          </div>
          {getSeverityBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Send Reminder */}
        {actions.canSendReminder && (
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto p-4 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                <MessageCircle className="h-4 w-4 mr-3 text-orange-600 dark:text-orange-400" />
                <div className="text-left">
                  <div className="font-medium">Enviar Recordatorio</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Notificar al cliente sobre el pago pendiente
                  </div>
                </div>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Enviar Recordatorio de Pago
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400">
                  Envía un recordatorio al cliente sobre el pago pendiente
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="message" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Mensaje del recordatorio
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Escribe tu mensaje aquí..."
                    value={reminderMessage || getDefaultReminderMessage()}
                    onChange={(e) => setReminderMessage(e.target.value)}
                    className="min-h-[200px] dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setReminderMessage(getDefaultReminderMessage())}
                    variant="outline"
                    size="sm"
                    className="dark:border-gray-600"
                  >
                    Usar plantilla
                  </Button>
                  <Button
                    onClick={handleSendReminder}
                    disabled={isLoading}
                    className="bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isLoading ? 'Enviando...' : 'Enviar Recordatorio'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Apply Payment */}
        {actions.canApplyPayment && (
          <Dialog open={showPaymentDialog} onOpenChange={(open) => {
            setShowPaymentDialog(open);
            if (open) loadPaymentData();
          }}>
            <DialogTrigger asChild>
              <Button 
                id="btn-registrar-cobro"
                variant="outline" 
                className="w-full justify-start h-auto p-4 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                <CreditCard className="h-4 w-4 mr-3 text-blue-600 dark:text-blue-400" />
                <div className="text-left">
                  <div className="font-medium">Registrar Cobro</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Registrar un pago parcial o total
                  </div>
                </div>
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Registrar Cobro
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400">
                  Balance pendiente: {formatCurrency(account.balance)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Selector de cuota si hay cuotas */}
                {installments.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <Label htmlFor="paymentAmount" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Monto del pago
                  </Label>
                  <Input
                    id="paymentAmount"
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
                  <Label htmlFor="paymentMethod" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Método de pago
                  </Label>
                  <Select value={paymentData.method} onValueChange={(value) => setPaymentData({ ...paymentData, method: value })}>
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
                <div>
                  <Label htmlFor="paymentReference" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Referencia (Opcional)
                  </Label>
                  <Input
                    id="paymentReference"
                    placeholder="Número de comprobante o referencia"
                    value={paymentData.reference}
                    onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                <Button 
                  onClick={handleApplyPayment}
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {isLoading ? 'Aplicando...' : 'Registrar Cobro'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Mark as Paid */}
        {actions.canMarkAsPaid && (
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                id="btn-marcar-cobrada"
                variant="outline" 
                className="w-full justify-start h-auto p-4 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                <CheckCircle className="h-4 w-4 mr-3 text-green-600 dark:text-green-400" />
                <div className="text-left">
                  <div className="font-medium">Marcar como Pagada</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Marcar la cuenta como completamente pagada
                  </div>
                </div>
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">
                  Marcar como Pagada
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400">
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
                <div className="flex gap-2">
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1 dark:border-gray-600">
                      Cancelar
                    </Button>
                  </DialogTrigger>
                  <Button 
                    onClick={handleMarkAsPaid}
                    disabled={isLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isLoading ? 'Procesando...' : 'Confirmar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Account Information */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Monto original:</span>
              <span className="font-medium">{formatCurrency(account.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total pagado:</span>
              <span className="font-medium">{formatCurrency(account.amount - account.balance)}</span>
            </div>
            <div className="flex justify-between">
              <span>Balance pendiente:</span>
              <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(account.balance)}</span>
            </div>
            {account.last_reminder_date && (
              <div className="flex justify-between">
                <span>Último recordatorio:</span>
                <span className="font-medium">
                  {new Date(account.last_reminder_date).toLocaleDateString('es-CO')}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
