'use client';

import { useState, useEffect } from 'react';
import type { CreateLoanDTO } from '@/lib/services/employeeLoansService';
import { formatCurrency } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Banknote, Save, X, Loader2, Calculator } from 'lucide-react';

interface LoanFormProps {
  employees: { id: string; name: string; code: string | null }[];
  loanTypes: { value: string; label: string }[];
  currencies: string[];
  onSubmit: (data: CreateLoanDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function LoanForm({
  employees,
  loanTypes,
  currencies,
  onSubmit,
  onCancel,
  isLoading,
}: LoanFormProps) {
  const [formData, setFormData] = useState<CreateLoanDTO>({
    employment_id: '',
    loan_type: 'general',
    description: '',
    currency_code: 'COP',
    principal: 0,
    interest_rate: 0,
    installments_total: 12,
    first_payment_date: '',
    auto_deduct: true,
    max_deduction_pct: 30,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Calculated values
  const [calculated, setCalculated] = useState({
    totalInterest: 0,
    totalAmount: 0,
    installmentAmount: 0,
  });

  useEffect(() => {
    const principal = formData.principal || 0;
    const rate = formData.interest_rate || 0;
    const installments = formData.installments_total || 1;

    const totalInterest = (principal * rate * installments) / 100 / 12;
    const totalAmount = principal + totalInterest;
    const installmentAmount = totalAmount / installments;

    setCalculated({
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      installmentAmount: Math.round(installmentAmount * 100) / 100,
    });
  }, [formData.principal, formData.interest_rate, formData.installments_total]);

  // Set default first payment date
  useEffect(() => {
    if (!formData.first_payment_date) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      setFormData(prev => ({
        ...prev,
        first_payment_date: nextMonth.toISOString().split('T')[0],
      }));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employment_id || !formData.principal || !formData.first_payment_date) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreateLoanDTO, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Banknote className="h-5 w-5 text-blue-600" />
          Nueva Solicitud de Préstamo
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Complete el formulario para solicitar un préstamo
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Employee Selection */}
          <div className="space-y-2">
            <Label htmlFor="employment_id" className="text-gray-700 dark:text-gray-300">
              Empleado *
            </Label>
            <Select
              value={formData.employment_id}
              onValueChange={(value) => handleChange('employment_id', value)}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Seleccionar empleado" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 max-h-60">
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} {emp.code ? `(${emp.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Loan Type & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="loan_type" className="text-gray-700 dark:text-gray-300">
                Tipo de Préstamo
              </Label>
              <Select
                value={formData.loan_type}
                onValueChange={(value) => handleChange('loan_type', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {loanTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency_code" className="text-gray-700 dark:text-gray-300">
                Moneda
              </Label>
              <Select
                value={formData.currency_code}
                onValueChange={(value) => handleChange('currency_code', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {currencies.map((curr) => (
                    <SelectItem key={curr} value={curr}>
                      {curr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">
              Descripción / Motivo
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describa el motivo del préstamo"
              rows={2}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Loan Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="principal" className="text-gray-700 dark:text-gray-300">
                Monto Principal *
              </Label>
              <Input
                id="principal"
                type="number"
                value={formData.principal || ''}
                onChange={(e) => handleChange('principal', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                min="0"
                step="1000"
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interest_rate" className="text-gray-700 dark:text-gray-300">
                Tasa de Interés (% anual)
              </Label>
              <Input
                id="interest_rate"
                type="number"
                value={formData.interest_rate || ''}
                onChange={(e) => handleChange('interest_rate', parseFloat(e.target.value) || 0)}
                placeholder="0"
                min="0"
                max="100"
                step="0.1"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installments_total" className="text-gray-700 dark:text-gray-300">
                Número de Cuotas *
              </Label>
              <Input
                id="installments_total"
                type="number"
                value={formData.installments_total}
                onChange={(e) => handleChange('installments_total', parseInt(e.target.value) || 1)}
                placeholder="12"
                min="1"
                max="60"
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Calculated Summary */}
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-900 dark:text-blue-100">
                Resumen del Préstamo
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-blue-700 dark:text-blue-300">Principal</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {formatCurrency(formData.principal || 0, formData.currency_code)}
                </p>
              </div>
              <div>
                <p className="text-blue-700 dark:text-blue-300">Interés Total</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {formatCurrency(calculated.totalInterest, formData.currency_code)}
                </p>
              </div>
              <div>
                <p className="text-blue-700 dark:text-blue-300">Total a Pagar</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {formatCurrency(calculated.totalAmount, formData.currency_code)}
                </p>
              </div>
              <div>
                <p className="text-blue-700 dark:text-blue-300">Cuota Mensual</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {formatCurrency(calculated.installmentAmount, formData.currency_code)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_payment_date" className="text-gray-700 dark:text-gray-300">
                Fecha Primera Cuota *
              </Label>
              <Input
                id="first_payment_date"
                type="date"
                value={formData.first_payment_date}
                onChange={(e) => handleChange('first_payment_date', e.target.value)}
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_deduction_pct" className="text-gray-700 dark:text-gray-300">
                Máx. Descuento en Nómina (%)
              </Label>
              <Input
                id="max_deduction_pct"
                type="number"
                value={formData.max_deduction_pct || ''}
                onChange={(e) => handleChange('max_deduction_pct', parseFloat(e.target.value) || 0)}
                placeholder="30"
                min="0"
                max="100"
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Auto Deduct */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Descuento Automático</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Descontar cuotas automáticamente de la nómina
              </p>
            </div>
            <Switch
              checked={formData.auto_deduct}
              onCheckedChange={(checked) => handleChange('auto_deduct', checked)}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
              Notas Adicionales
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Notas o comentarios adicionales"
              rows={2}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !formData.employment_id || !formData.principal || !formData.first_payment_date}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Solicitar Préstamo
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
