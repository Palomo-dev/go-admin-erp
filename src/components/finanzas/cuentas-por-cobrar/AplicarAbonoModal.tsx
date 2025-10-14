'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, DollarSign, User, Calendar, Loader2, AlertCircle } from 'lucide-react';
import { CuentaPorCobrar } from './types';
import { CuentasPorCobrarService } from './service';
import { formatCurrency } from '@/utils/Utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface AplicarAbonoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuenta: CuentaPorCobrar;
  onSuccess: () => void;
}

// Interfaces para tipar los métodos de pago
interface PaymentMethod {
  code: string;
  name: string;
  requires_reference?: boolean;
}

interface FormattedPaymentMethod {
  code: string;
  name: string;
  requires_reference?: boolean;
}

export function AplicarAbonoModal({ open, onOpenChange, cuenta, onSuccess }: AplicarAbonoModalProps) {
  const organizationId = getOrganizationId();
  
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: '',
    reference: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metodosPago, setMetodosPago] = useState<FormattedPaymentMethod[]>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false);
  const [montoExcedido, setMontoExcedido] = useState(false);

  // Cargar métodos de pago disponibles
  useEffect(() => {
    const cargarMetodosPago = async () => {
      if (!organizationId) return;

      setIsLoadingPaymentMethods(true);
      try {
        // Consultar los métodos de pago de la organización uniendo con payment_methods
        const { data, error } = await supabase
          .from('organization_payment_methods')
          .select(`
            *,
            payment_methods:payment_method_code(*)
          `)
          .eq('organization_id', organizationId)
          .eq('is_active', true);

        if (error) throw error;
        
        // Transformar los datos para facilitar su uso
        const metodosPagoFormateados = data?.map((item): FormattedPaymentMethod => ({
          code: item.payment_method_code,
          name: item.payment_methods ? item.payment_methods.name : item.payment_method_code,
          requires_reference: item.payment_methods ? item.payment_methods.requires_reference : false
        })) || [];
        
        setMetodosPago(metodosPagoFormateados);
        
        // Establecer método de pago predeterminado si existe
        if (metodosPagoFormateados.length > 0 && !formData.payment_method) {
          setFormData(prev => ({
            ...prev,
            payment_method: metodosPagoFormateados[0].code
          }));
        }
      } catch (error: any) {
        console.error('Error al cargar métodos de pago:', error);
        toast.error('Error al cargar los métodos de pago');
      } finally {
        setIsLoadingPaymentMethods(false);
      }
    };

    if (open) {
      cargarMetodosPago();
      // Establecer monto predeterminado con el balance pendiente
      setFormData(prev => ({
        ...prev,
        amount: cuenta.balance?.toString() || '0'
      }));
      // Reset estado de monto excedido
      setMontoExcedido(false);
    }
  }, [open, organizationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.payment_method) {
      toast.error('Por favor complete todos los campos requeridos');
      return;
    }

    // Validar referencia si es requerida
    if (requiereReferencia() && !formData.reference.trim()) {
      toast.error('La referencia es requerida para este método de pago');
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
      amount: cuenta.balance?.toString() || '0',
      payment_method: '',
      reference: '',
      notes: '',
      payment_date: new Date().toISOString().split('T')[0],
    });
    // Reset estado de monto excedido
    setMontoExcedido(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Manejar cambio en monto con validación de exceso
  const handleMontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Validar que sea un número válido
    if (/^\d*\.?\d*$/.test(value) || value === '') {
      setFormData(prev => ({
        ...prev,
        amount: value
      }));
      
      // Validar que el monto no exceda el balance pendiente
      if (value && cuenta.balance) {
        const montoNumerico = parseFloat(value);
        const balancePendiente = parseFloat(cuenta.balance.toString());
        
        if (montoNumerico > balancePendiente) {
          setMontoExcedido(true);
        } else {
          setMontoExcedido(false);
        }
      } else {
        setMontoExcedido(false);
      }
    }
  };

  // Determinar si se requiere referencia según el método de pago
  const requiereReferencia = () => {
    const metodo = metodosPago.find(m => m.code === formData.payment_method);
    return metodo?.requires_reference || false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
            <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span>Aplicar Abono</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Información de la cuenta */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Información de la Cuenta</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Cliente</Label>
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{cuenta.customer_name}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Balance Pendiente</Label>
                  <p className="text-base sm:text-lg font-medium text-red-600 dark:text-red-400">
                    {formatCurrency(cuenta.balance)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Monto Total</Label>
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{formatCurrency(cuenta.amount)}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Fecha Vencimiento</Label>
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                    {new Date(cuenta.due_date).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formulario de abono */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Detalles del Abono</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="amount" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    Monto del Abono *
                  </Label>
                  <Input
                    id="amount"
                    type="text"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={handleMontoChange}
                    className={`h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      montoExcedido ? "border-red-500" : ""
                    }`}
                    required
                  />
                  {montoExcedido && (
                    <Alert 
                      variant="destructive" 
                      className="py-2 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 text-red-800 dark:text-red-300 transition-all animate-fadeIn"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 text-red-500" />
                        <AlertDescription className="text-xs sm:text-sm font-medium">
                          El monto ingresado ({formatCurrency(parseFloat(formData.amount) || 0)}) excede el balance pendiente ({formatCurrency(cuenta.balance)})
                        </AlertDescription>
                      </div>
                    </Alert>
                  )}
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="payment_method" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    Método de Pago *
                  </Label>
                  <Select 
                    value={formData.payment_method} 
                    onValueChange={(value) => handleInputChange('payment_method', value)}
                    disabled={isLoadingPaymentMethods}
                  >
                    <SelectTrigger className="h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      {isLoadingPaymentMethods ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                          <span>Cargando...</span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Seleccione método" />
                      )}
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                      {metodosPago.map((metodo) => (
                        <SelectItem key={metodo.code} value={metodo.code} className="text-xs sm:text-sm dark:text-gray-300">
                          {metodo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="payment_date" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fecha de Pago
                  </Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => handleInputChange('payment_date', e.target.value)}
                    className="h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
                
                {requiereReferencia() && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="reference" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                      Referencia / Transacción *
                    </Label>
                    <Input
                      id="reference"
                      placeholder="Número de transacción, últimos 4 dígitos, etc."
                      value={formData.reference}
                      onChange={(e) => handleInputChange('reference', e.target.value)}
                      className="h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="notes" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notas
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Comentarios adicionales sobre el abono..."
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className="text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          {formData.amount && (
            <Card className="dark:bg-gray-900/50 dark:border-gray-600">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Balance después del abono:</p>
                    <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrency(cuenta.balance - parseFloat(formData.amount || '0'))}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Estado resultante:</p>
                    <p className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">
                      {cuenta.balance - parseFloat(formData.amount || '0') <= 0 ? 'Pagado' : 'Parcial'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || 
                !formData.amount || 
                !formData.payment_method ||
                (requiereReferencia() && !formData.reference.trim()) ||
                montoExcedido
              }
              className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {isSubmitting ? 'Aplicando...' : 'Aplicar Abono'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
