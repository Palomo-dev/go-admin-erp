'use client';

import React, { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CreditCard, Banknote, Wallet, Smartphone } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface RegisterPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingAmount: number;
  onSubmit: (data: { amount: number; method: string; reference?: string }) => Promise<void>;
}

const paymentMethods = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: Wallet },
  { value: 'nequi', label: 'Nequi', icon: Smartphone },
  { value: 'daviplata', label: 'Daviplata', icon: Smartphone },
];

export function RegisterPaymentDialog({
  open,
  onOpenChange,
  pendingAmount,
  onSubmit,
}: RegisterPaymentDialogProps) {
  const [amount, setAmount] = useState(pendingAmount.toString());
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsSaving(true);
    try {
      await onSubmit({
        amount: numAmount,
        method,
        reference: reference || undefined,
      });
      onOpenChange(false);
      setAmount(pendingAmount.toString());
      setMethod('cash');
      setReference('');
    } finally {
      setIsSaving(false);
    }
  };

  const needsReference = method !== 'cash';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Registrar Pago
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Monto Pendiente</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(pendingAmount)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Monto a Pagar</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Método de Pago</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.value} value={pm.value}>
                    <div className="flex items-center gap-2">
                      <pm.icon className="h-4 w-4" />
                      {pm.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsReference && (
            <div className="space-y-2">
              <Label htmlFor="reference">Referencia</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Número de referencia o aprobación"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || parseFloat(amount) <= 0}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
