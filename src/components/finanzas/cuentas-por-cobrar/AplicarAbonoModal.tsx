'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, DollarSign, User, Calendar } from 'lucide-react';
import { CuentaPorCobrar } from './types';
import { CuentasPorCobrarService } from './service';
import { formatCurrency } from '@/utils/Utils';
import { toast } from 'sonner';

interface AplicarAbonoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuenta: CuentaPorCobrar;
  onSuccess: () => void;
}

export function AplicarAbonoModal({ open, onOpenChange, cuenta, onSuccess }: AplicarAbonoModalProps) {
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: '',
    reference: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.payment_method) {
      toast.error('Por favor complete todos los campos requeridos');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('El monto debe ser un número válido mayor a 0');
      return;
    }

    if (amount > cuenta.balance) {
      toast.error('El monto no puede ser mayor al balance pendiente');
      return;
    }

    setIsSubmitting(true);

    try {
      await CuentasPorCobrarService.aplicarAbono(cuenta.id, {
        amount,
        payment_method: formData.payment_method,
        reference: formData.reference,
        notes: formData.notes,
        payment_date: formData.payment_date,
      });

      toast.success('Abono aplicado exitosamente');
      onSuccess();
      resetForm();
    } catch (error) {
      console.error('Error al aplicar abono:', error);
      toast.error('Error al aplicar el abono');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      amount: '',
      payment_method: '',
      reference: '',
      notes: '',
      payment_date: new Date().toISOString().split('T')[0],
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const paymentMethods = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'card', label: 'Tarjeta' },
    { value: 'check', label: 'Cheque' },
    { value: 'credit', label: 'Crédito' },
    { value: 'other', label: 'Otro' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Aplicar Abono
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información de la cuenta */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader>
              <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                <User className="h-4 w-4" />
                Información de la Cuenta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Cliente</Label>
                  <p className="font-medium text-gray-900 dark:text-white">{cuenta.customer_name}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Balance Pendiente</Label>
                  <p className="font-medium text-red-600 dark:text-red-400 text-lg">
                    {formatCurrency(cuenta.balance)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Monto Total</Label>
                  <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(cuenta.amount)}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400">Fecha Vencimiento</Label>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(cuenta.due_date).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formulario de abono */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader>
              <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Detalles del Abono
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Monto del Abono *
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={cuenta.balance}
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => handleInputChange('amount', e.target.value)}
                    className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_method" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Método de Pago *
                  </Label>
                  <Select value={formData.payment_method} onValueChange={(value) => handleInputChange('payment_method', value)}>
                    <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600">
                      <SelectValue placeholder="Seleccione método" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reference" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Referencia
                  </Label>
                  <Input
                    id="reference"
                    placeholder="Número de referencia o comprobante"
                    value={formData.reference}
                    onChange={(e) => handleInputChange('reference', e.target.value)}
                    className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_date" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fecha de Pago
                  </Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => handleInputChange('payment_date', e.target.value)}
                    className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notas
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Comentarios adicionales sobre el abono..."
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          {formData.amount && (
            <Card className="dark:bg-gray-900/50 dark:border-gray-600">
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Balance después del abono:</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(cuenta.balance - parseFloat(formData.amount || '0'))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Estado resultante:</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {cuenta.balance - parseFloat(formData.amount || '0') <= 0 ? 'Pagado' : 'Parcial'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.amount || !formData.payment_method}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {isSubmitting ? 'Aplicando...' : 'Aplicar Abono'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
