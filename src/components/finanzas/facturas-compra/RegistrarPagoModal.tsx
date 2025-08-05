'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, AlertCircle } from 'lucide-react';
import { FacturasCompraService } from './FacturasCompraService';
import { InvoicePurchase, OrganizationPaymentMethod } from './types';
import { formatCurrency } from '@/utils/Utils';

interface RegistrarPagoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: InvoicePurchase | null;
  onPagoRegistrado: () => void;
}

interface FormData {
  amount: string;
  payment_method: string;
  reference: string;
  notes: string;
}

export function RegistrarPagoModal({
  open,
  onOpenChange,
  factura,
  onPagoRegistrado
}: RegistrarPagoModalProps) {
  const [loading, setLoading] = useState(false);
  const [metodosPago, setMetodosPago] = useState<OrganizationPaymentMethod[]>([]);
  const [montoExcedido, setMontoExcedido] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    amount: '',
    payment_method: '',
    reference: '',
    notes: ''
  });

  // Cargar métodos de pago
  useEffect(() => {
    if (open) {
      cargarMetodosPago();
      // Establecer monto inicial como el balance pendiente
      if (factura) {
        setFormData(prev => ({
          ...prev,
          amount: factura.balance.toString()
        }));
      }
    }
  }, [open, factura]);

  const cargarMetodosPago = async () => {
    try {
      const metodos = await FacturasCompraService.obtenerMetodosPago();
      setMetodosPago(metodos);
      
      // Auto-seleccionar el primer método disponible
      if (metodos.length > 0) {
        setFormData(prev => ({
          ...prev,
          payment_method: metodos[0].payment_method_code
        }));
      }
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
    }
  };

  const handleMontoChange = (value: string) => {
    // Permitir solo números y punto decimal
    if (/^\d*\.?\d*$/.test(value)) {
      setFormData(prev => ({ ...prev, amount: value }));
      
      // Verificar si el monto excede el balance
      if (factura && value) {
        const monto = parseFloat(value);
        setMontoExcedido(monto > factura.balance);
      } else {
        setMontoExcedido(false);
      }
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    if (field === 'amount') {
      handleMontoChange(value);
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const getMetodoSeleccionado = () => {
    return metodosPago.find(m => m.payment_method_code === formData.payment_method);
  };

  const requiereReferencia = () => {
    const metodo = getMetodoSeleccionado();
    return metodo?.payment_methods?.requires_reference || false;
  };

  const resetForm = () => {
    setFormData({
      amount: factura?.balance.toString() || '0',
      payment_method: metodosPago.length > 0 ? metodosPago[0].payment_method_code : '',
      reference: '',
      notes: ''
    });
    setMontoExcedido(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!factura) return;

    // Validaciones
    const monto = parseFloat(formData.amount);
    if (!monto || monto <= 0) {
      alert('El monto debe ser mayor a 0');
      return;
    }

    if (montoExcedido) {
      alert('El monto no puede exceder el balance pendiente');
      return;
    }

    if (requiereReferencia() && !formData.reference.trim()) {
      alert('La referencia es requerida para este método de pago');
      return;
    }

    try {
      setLoading(true);
      
      // Registrar el pago usando el servicio
      await FacturasCompraService.registrarPago(factura.id, {
        amount: monto,
        payment_method: formData.payment_method,
        reference: formData.reference,
        notes: formData.notes
      });
      
      // Notificar éxito (podrías usar un toast aquí)
      console.log('Pago registrado exitosamente');
      
      onPagoRegistrado();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error registrando pago:', error);
      const mensaje = error?.message || 'Error al registrar el pago. Por favor, inténtelo de nuevo.';
      alert(mensaje);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    resetForm();
  };

  if (!factura) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
            Registrar Pago
          </DialogTitle>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Factura: {factura.number_ext} - {factura.supplier?.name}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Información de la factura */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-blue-600 dark:text-blue-400">Balance pendiente:</span>
              <span className="font-semibold text-blue-800 dark:text-blue-300">
                {formatCurrency(factura.balance, factura.currency)}
              </span>
            </div>
          </div>

          {/* Monto del pago */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="dark:text-gray-300">
              Monto del Pago *
            </Label>
            <Input
              id="amount"
              type="text"
              value={formData.amount}
              onChange={(e) => handleMontoChange(e.target.value)}
              placeholder="0.00"
              className={`dark:bg-gray-700 dark:border-gray-600 ${
                montoExcedido ? 'border-red-500' : ''
              }`}
            />
            {montoExcedido && (
              <Alert className="border-red-500 bg-red-50 dark:bg-red-900/20">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 dark:text-red-300">
                  El monto ({formatCurrency(parseFloat(formData.amount), factura.currency)}) 
                  excede el balance pendiente ({formatCurrency(factura.balance, factura.currency)})
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <Label htmlFor="payment_method" className="dark:text-gray-300">
              Método de Pago *
            </Label>
            <Select
              value={formData.payment_method}
              onValueChange={(value) => handleInputChange('payment_method', value)}
            >
              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                <SelectValue placeholder="Seleccionar método..." />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                {metodosPago.map((metodo) => (
                  <SelectItem key={metodo.id} value={metodo.payment_method_code}>
                    {metodo.payment_methods?.name || metodo.payment_method_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Referencia (condicional) */}
          {requiereReferencia() && (
            <div className="space-y-2">
              <Label htmlFor="reference" className="dark:text-gray-300">
                Referencia *
              </Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) => handleInputChange('reference', e.target.value)}
                placeholder="Número de transacción, cheque, etc."
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          )}

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="dark:text-gray-300">
              Notas
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Notas adicionales sobre el pago..."
              className="dark:bg-gray-700 dark:border-gray-600"
              rows={3}
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || montoExcedido || !formData.amount || 
                       (requiereReferencia() && !formData.reference.trim())}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Registrando...
                </>
              ) : (
                'Registrar Pago'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
