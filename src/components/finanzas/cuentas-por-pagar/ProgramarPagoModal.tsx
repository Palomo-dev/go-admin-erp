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
  Clock,
  Calendar,
  DollarSign,
  Building2,
  AlertCircle,
  CheckCircle,
  Loader2,
  Info
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { AccountPayable, ProgramarPagoForm } from './types';
import { OrganizationPaymentMethod } from '../facturas-compra/types';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface ProgramarPagoModalProps {
  cuenta: AccountPayable;
  isOpen: boolean;
  onClose: () => void;
  onPagoProgramado: () => void;
}

export function ProgramarPagoModal({
  cuenta,
  isOpen,
  onClose,
  onPagoProgramado
}: ProgramarPagoModalProps) {
  // Estados del formulario
  const [formData, setFormData] = useState<ProgramarPagoForm>({
    account_payable_id: cuenta.id,
    amount: cuenta.balance,
    scheduled_date: '',
    payment_method: '',
    reference: '',
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
    // Sugerir fecha de vencimiento o mañana
    const fechaSugerida = cuenta.due_date 
      ? cuenta.due_date.split('T')[0]
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    setFormData({
      account_payable_id: cuenta.id,
      amount: cuenta.balance,
      scheduled_date: fechaSugerida,
      payment_method: '',
      reference: '',
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

    if (!formData.scheduled_date) {
      newErrors.scheduled_date = 'Debe seleccionar una fecha para el pago';
    } else {
      const fechaProgramada = new Date(formData.scheduled_date + 'T00:00:00');
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      if (fechaProgramada < hoy) {
        newErrors.scheduled_date = 'La fecha programada no puede ser anterior a hoy';
      }
    }

    if (!formData.payment_method) {
      newErrors.payment_method = 'Debe seleccionar un método de pago';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handlers
  const handleInputChange = (field: keyof ProgramarPagoForm, value: any) => {
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
      
      await CuentasPorPagarService.programarPago(formData);
      
      toast({
        title: "Pago programado",
        description: `Se programó el pago de ${formatCurrency(formData.amount)} para el ${formatDate(formData.scheduled_date)}`,
      });
      
      onPagoProgramado();
    } catch (error: any) {
      console.error('Error programando pago:', error);
      toast({
        title: "Error al programar pago",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDiasHastaVencimiento = () => {
    if (!cuenta.due_date) return null;
    
    const vencimiento = new Date(cuenta.due_date);
    const hoy = new Date();
    const diffTime = vencimiento.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  const getSugerenciaFecha = () => {
    const dias = getDiasHastaVencimiento();
    
    if (dias === null) return "Sin fecha de vencimiento";
    if (dias < 0) return `Vencida hace ${Math.abs(dias)} días`;
    if (dias === 0) return "Vence hoy";
    if (dias === 1) return "Vence mañana";
    return `Vence en ${dias} días`;
  };

  const getColorVencimiento = () => {
    const dias = getDiasHastaVencimiento();
    
    if (dias === null) return "text-gray-500 dark:text-gray-400";
    if (dias < 0) return "text-red-600 dark:text-red-400";
    if (dias <= 3) return "text-orange-600 dark:text-orange-400";
    if (dias <= 7) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Programar Pago</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Información de la cuenta */}
          <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                      {cuenta.supplier?.name || 'Sin nombre'}
                    </span>
                  </div>
                  
                  {cuenta.supplier?.nit && (
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      NIT: {cuenta.supplier.nit}
                    </p>
                  )}
                  
                  {cuenta.invoice_purchase?.number_ext && (
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      Factura: {cuenta.invoice_purchase.number_ext}
                    </p>
                  )}
                  
                  <div className={`flex items-center gap-1 text-xs sm:text-sm ${getColorVencimiento()}`}>
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{getSugerenciaFecha()}</span>
                  </div>
                </div>
                
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Saldo pendiente</p>
                  <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(cuenta.balance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información sobre programación */}
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Acerca de la programación de pagos
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Los pagos programados quedan pendientes de aprobación por un supervisor. 
                    Una vez aprobados, podrán ser procesados o exportados para banca online.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Monto del pago */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="amount" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                <span>Monto del Pago *</span>
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
                  className={`h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.amount ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''} ${formData.amount > cuenta.balance ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
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
                <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{errors.amount}</span>
                </p>
              )}
              <div className="flex gap-1.5 sm:gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleInputChange('amount', cuenta.balance)}
                  className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Pago completo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleInputChange('amount', cuenta.balance / 2)}
                  className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  50%
                </Button>
              </div>
            </div>

            {/* Fecha programada */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="scheduled_date" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                <span>Fecha Programada *</span>
              </Label>
              <Input
                id="scheduled_date"
                name="scheduled_date"
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={formData.scheduled_date}
                onChange={(e) => handleInputChange('scheduled_date', e.target.value)}
                className={`h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.scheduled_date ? 'border-red-500' : ''}`}
              />
              {errors.scheduled_date && (
                <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{errors.scheduled_date}</span>
                </p>
              )}
              <div className="flex gap-1.5 sm:gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleInputChange('scheduled_date', new Date().toISOString().split('T')[0])}
                  className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Hoy
                </Button>
                {cuenta.due_date && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleInputChange('scheduled_date', cuenta.due_date!.split('T')[0])}
                    className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Vencimiento
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Método de Pago Preferido *
            </Label>
            <Select 
              value={formData.payment_method} 
              onValueChange={(value) => handleInputChange('payment_method', value)}
              disabled={loadingMetodos}
            >
              <SelectTrigger className={`h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.payment_method ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="Seleccionar método de pago" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {metodosPago.map((metodo) => (
                  <SelectItem 
                    key={metodo.payment_method_code} 
                    value={metodo.payment_method_code}
                    className="text-xs sm:text-sm dark:text-gray-300"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{metodo.payment_methods?.name || metodo.payment_method_code}</span>
                      {metodo.payment_methods?.requires_reference && (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 dark:border-gray-600 dark:text-gray-300">
                          Requiere referencia
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.payment_method && (
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{errors.payment_method}</span>
              </p>
            )}
          </div>

          {/* Referencia sugerida */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="reference" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Referencia Sugerida
            </Label>
            <Input
              id="reference"
              name="reference"
              placeholder="Número de transacción, cheque, etc."
              value={formData.reference}
              onChange={(e) => handleInputChange('reference', e.target.value)}
              className="h-9 sm:h-10 text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
              Opcional: Se puede completar al momento de la aprobación
            </p>
          </div>

          {/* Notas */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="notes" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Notas / Justificación</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Motivo de la programación, instrucciones especiales, etc."
              rows={3}
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              className="text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || formData.amount > cuenta.balance || formData.amount <= 0}
              className={`w-full sm:w-auto min-w-[120px] h-9 sm:h-10 text-sm sm:text-base ${
                formData.amount > cuenta.balance 
                  ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400 dark:bg-red-600 dark:hover:bg-red-700' 
                  : 'dark:bg-blue-600 dark:hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 animate-spin" />
                  <span>Programando...</span>
                </>
              ) : formData.amount > cuenta.balance ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                  <span>Monto Excedido</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                  <span>Programar Pago</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
