'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard,
  Calendar,
  DollarSign,
  Building2,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { AccountPayable, RegistrarPagoForm } from './types';
import { OrganizationPaymentMethod } from '../facturas-compra/types';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface RegistrarPagoModalProps {
  cuenta: AccountPayable;
  isOpen: boolean;
  onClose: () => void;
  onPagoRegistrado: () => void;
}

export function RegistrarPagoModal({
  cuenta,
  isOpen,
  onClose,
  onPagoRegistrado
}: RegistrarPagoModalProps) {
  // Estados del formulario
  const [formData, setFormData] = useState<RegistrarPagoForm>({
    account_payable_id: cuenta.id,
    amount: cuenta.balance,
    payment_method: '',
    reference: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Estados de carga y datos
  const [loading, setLoading] = useState(false);
  const [metodosPago, setMetodosPago] = useState<OrganizationPaymentMethod[]>([]);
  const [loadingMetodos, setLoadingMetodos] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      cargarMetodosPago();
      resetForm();
    }
  }, [isOpen, cuenta]);

  const resetForm = () => {
    setFormData({
      account_payable_id: cuenta.id,
      amount: cuenta.balance,
      payment_method: '',
      reference: '',
      payment_date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setErrors({});
  };

  const cargarMetodosPago = async () => {
    try {
      setLoadingMetodos(true);
      const metodos = await CuentasPorPagarService.obtenerMetodosPago();
      setMetodosPago(metodos);
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los métodos de pago",
        variant: "destructive",
      });
    } finally {
      setLoadingMetodos(false);
    }
  };

  // Validaciones
  const validarFormulario = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'El monto debe ser mayor a 0';
    }

    if (formData.amount > cuenta.balance) {
      newErrors.amount = 'El monto no puede ser mayor al saldo pendiente';
    }

    if (!formData.payment_method) {
      newErrors.payment_method = 'Debe seleccionar un método de pago';
    }

    if (!formData.payment_date) {
      newErrors.payment_date = 'Debe seleccionar una fecha de pago';
    }

    // Validar referencia si es requerida
    const metodoSeleccionado = metodosPago.find(m => 
      m.payment_method_code === formData.payment_method
    );
    
    if (metodoSeleccionado?.payment_methods?.requires_reference && !formData.reference) {
      newErrors.reference = 'La referencia es requerida para este método de pago';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handlers
  const handleInputChange = (field: keyof RegistrarPagoForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Validación en tiempo real para el monto
    if (field === 'amount') {
      const monto = parseFloat(value) || 0;
      if (monto > cuenta.balance) {
        setErrors(prev => ({ 
          ...prev, 
          [field]: `El monto excede el saldo pendiente de ${formatCurrency(cuenta.balance)}` 
        }));
        
        // Mostrar toast de alerta
        toast({
          title: "Monto excedido",
          description: `El monto ingresado (${formatCurrency(monto)}) excede el saldo pendiente de ${formatCurrency(cuenta.balance)}`,
          variant: "destructive",
        });
        return;
      }
    }
    
    // Limpiar error del campo si está correcto
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validarFormulario()) {
      return;
    }

    try {
      setLoading(true);
      
      await CuentasPorPagarService.registrarPago(formData);
      
      toast({
        title: "Pago registrado",
        description: `Se registró el pago de ${formatCurrency(formData.amount)} correctamente`,
      });
      
      onPagoRegistrado();
    } catch (error: any) {
      console.error('Error registrando pago:', error);
      toast({
        title: "Error al registrar pago",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getMetodoNombre = (codigo: string) => {
    const metodo = metodosPago.find(m => m.payment_method_code === codigo);
    return metodo?.payment_methods?.name || codigo;
  };

  const requiereReferencia = (codigo: string) => {
    const metodo = metodosPago.find(m => m.payment_method_code === codigo);
    return metodo?.payment_methods?.requires_reference || false;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Registrar Pago
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información de la cuenta */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">
                      {cuenta.supplier?.name || 'Sin nombre'}
                    </span>
                  </div>
                  
                  {cuenta.supplier?.nit && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      NIT: {cuenta.supplier.nit}
                    </p>
                  )}
                  
                  {cuenta.invoice_purchase?.number_ext && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Factura: {cuenta.invoice_purchase.number_ext}
                    </p>
                  )}
                  
                  {cuenta.due_date && (
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>Vence: {formatDate(cuenta.due_date)}</span>
                      {cuenta.days_overdue && cuenta.days_overdue > 0 && (
                        <Badge variant="destructive" className="ml-2">
                          Vencida {cuenta.days_overdue}d
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Saldo pendiente</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(cuenta.balance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Monto del pago */}
            <div className="space-y-2">
              <Label htmlFor="amount">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Monto del Pago *
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  max={cuenta.balance}
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                  className={`${errors.amount ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''} ${formData.amount > cuenta.balance ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
                />
                {formData.amount > cuenta.balance && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                )}
              </div>
              
              {/* Indicador de exceso de monto */}
              {formData.amount > cuenta.balance && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">Monto excedido</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    El monto ingresado ({formatCurrency(formData.amount)}) excede el saldo pendiente de {formatCurrency(cuenta.balance)}
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Exceso: {formatCurrency(formData.amount - cuenta.balance)}
                  </p>
                </div>
              )}
              
              {errors.amount && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.amount}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleInputChange('amount', cuenta.balance)}
                >
                  Pago completo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleInputChange('amount', cuenta.balance / 2)}
                >
                  50%
                </Button>
              </div>
            </div>

            {/* Fecha del pago */}
            <div className="space-y-2">
              <Label htmlFor="payment_date">
                <Calendar className="w-4 h-4 inline mr-1" />
                Fecha del Pago *
              </Label>
              <Input
                id="payment_date"
                name="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleInputChange('payment_date', e.target.value)}
                className={errors.payment_date ? 'border-red-500' : ''}
              />
              {errors.payment_date && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.payment_date}
                </p>
              )}
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <Label>
              <CreditCard className="w-4 h-4 inline mr-1" />
              Método de Pago *
            </Label>
            <Select 
              value={formData.payment_method} 
              onValueChange={(value) => handleInputChange('payment_method', value)}
              disabled={loadingMetodos}
            >
              <SelectTrigger className={errors.payment_method ? 'border-red-500' : ''}>
                <SelectValue placeholder="Seleccionar método de pago" />
              </SelectTrigger>
              <SelectContent>
                {metodosPago.map((metodo) => (
                  <SelectItem 
                    key={metodo.payment_method_code} 
                    value={metodo.payment_method_code}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{metodo.payment_methods?.name || metodo.payment_method_code}</span>
                      {metodo.payment_methods?.requires_reference && (
                        <Badge variant="outline" className="ml-2">
                          Requiere referencia
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.payment_method && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.payment_method}
              </p>
            )}
          </div>

          {/* Referencia */}
          <div className="space-y-2">
            <Label htmlFor="reference">
              Referencia {requiereReferencia(formData.payment_method) && '*'}
            </Label>
            <Input
              id="reference"
              name="reference"
              placeholder="Número de transacción, cheque, etc."
              value={formData.reference}
              onChange={(e) => handleInputChange('reference', e.target.value)}
              className={errors.reference ? 'border-red-500' : ''}
            />
            {errors.reference && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.reference}
              </p>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Comentarios adicionales sobre el pago..."
              rows={3}
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || formData.amount > cuenta.balance || formData.amount <= 0}
              className={`min-w-[120px] ${
                formData.amount > cuenta.balance 
                  ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400' 
                  : ''
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : formData.amount > cuenta.balance ? (
                <>
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Monto Excedido
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Registrar Pago
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
