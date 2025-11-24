'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  Wallet, 
  DollarSign, 
  Building2, 
  Check,
  Smartphone,
  Globe,
  Banknote,
  FileText,
} from 'lucide-react';

interface PaymentMethod {
  id: number;
  payment_method_code: string;
  is_active: boolean;
  settings?: Record<string, any>;
}

interface StepPaymentProps {
  paymentMethod: string;
  paymentAmount: number;
  totalEstimated: number;
  notes: string;
  availablePaymentMethods: PaymentMethod[];
  onPaymentMethodChange: (method: string) => void;
  onPaymentAmountChange: (amount: number) => void;
  onNotesChange: (notes: string) => void;
  onNext: () => void;
  onBack: () => void;
}

// Mapeo de códigos a nombres e iconos
const PAYMENT_METHOD_INFO: Record<string, { name: string; icon: React.ReactNode }> = {
  cash: { name: 'Efectivo', icon: <Wallet className="h-6 w-6" /> },
  card: { name: 'Tarjeta', icon: <CreditCard className="h-6 w-6" /> },
  transfer: { name: 'Transferencia', icon: <Building2 className="h-6 w-6" /> },
  nequi: { name: 'Nequi', icon: <Smartphone className="h-6 w-6" /> },
  daviplata: { name: 'Daviplata', icon: <Smartphone className="h-6 w-6" /> },
  pse: { name: 'PSE', icon: <Globe className="h-6 w-6" /> },
  payu: { name: 'PayU', icon: <Globe className="h-6 w-6" /> },
  mp: { name: 'Mercado Pago', icon: <Globe className="h-6 w-6" /> },
  credit: { name: 'Crédito', icon: <FileText className="h-6 w-6" /> },
  check: { name: 'Cheque', icon: <Banknote className="h-6 w-6" /> },
  guarantee: { name: 'Solo Garantía', icon: <DollarSign className="h-6 w-6" /> },
};

export function StepPayment({
  paymentMethod,
  paymentAmount,
  totalEstimated,
  notes,
  availablePaymentMethods,
  onPaymentMethodChange,
  onPaymentAmountChange,
  onNotesChange,
  onNext,
  onBack,
}: StepPaymentProps) {
  const isValid = paymentMethod !== '';

  const handleSetPercentage = (percentage: number) => {
    const amount = (totalEstimated * percentage) / 100;
    onPaymentAmountChange(Math.round(amount * 100) / 100);
  };

  // Construir lista de métodos disponibles con info de display
  const displayMethods = availablePaymentMethods.map((method, index) => {
    const info = PAYMENT_METHOD_INFO[method.payment_method_code] || {
      name: method.payment_method_code,
      icon: <DollarSign key={`icon-fallback-${index}`} className="h-6 w-6" />,
    };
    return {
      code: method.payment_method_code,
      name: info.name,
      icon: React.cloneElement(info.icon as React.ReactElement, { key: `icon-${method.payment_method_code}` }),
      settings: method.settings,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Pago y Garantía
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Selecciona el método de pago y el monto inicial
        </p>
      </div>

      {/* Resumen del total */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Total Estimado
            </p>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              ${totalEstimated.toFixed(2)}
            </p>
          </div>
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white">
            <DollarSign className="h-8 w-8" />
          </div>
        </div>
      </Card>

      {/* Método de pago */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Método de Pago
        </h3>

        <div className="grid sm:grid-cols-2 gap-3">
          {displayMethods.map((method) => {
            const isSelected = paymentMethod === method.code;

            return (
              <Card
                key={method.code}
                className={`p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                    : 'hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                onClick={() => onPaymentMethodChange(method.code)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {method.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {method.name}
                    </h4>
                    {method.settings?.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {method.settings.description}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {displayMethods.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No hay métodos de pago configurados para esta organización
          </div>
        )}
      </Card>

      {/* Monto del pago */}
      {paymentMethod && paymentMethod !== 'guarantee' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Monto del Pago Inicial
          </h3>

          <div className="space-y-4">
            <div>
              <Label htmlFor="payment_amount">Monto ($)</Label>
              <Input
                id="payment_amount"
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => onPaymentAmountChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>

            {/* Botones de porcentaje */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSetPercentage(25)}
              >
                25%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSetPercentage(50)}
              >
                50%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSetPercentage(100)}
              >
                100%
              </Button>
            </div>

            {paymentAmount > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Pago inicial:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    ${paymentAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    Saldo pendiente:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    ${(totalEstimated - paymentAmount).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Notas */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Notas Adicionales
        </h3>
        <Textarea
          placeholder="Agrega notas sobre la reserva, preferencias del huésped, etc."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
        />
      </Card>

      {/* Botones de navegación */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Continuar
        </Button>
      </div>
    </div>
  );
}
