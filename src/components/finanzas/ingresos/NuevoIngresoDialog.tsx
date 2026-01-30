'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, DollarSign, Wallet, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { movimientosService, BankAccount } from '@/lib/services/movimientosService';
import { getCurrentUserId } from '@/lib/hooks/useOrganization';

interface NuevoIngresoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NuevoIngresoDialog({
  open,
  onOpenChange,
  onSuccess,
}: NuevoIngresoDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    concept: '',
    amount: '',
    notes: '',
    source: 'cash' as 'cash' | 'bank',
    bank_account_id: '',
  });

  useEffect(() => {
    if (open) {
      loadBankAccounts();
    }
  }, [open]);

  const loadBankAccounts = async () => {
    const accounts = await movimientosService.getBankAccounts();
    setBankAccounts(accounts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.concept.trim()) {
      toast({ title: 'Error', description: 'El concepto es requerido', variant: 'destructive' });
      return;
    }
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
      return;
    }

    if (formData.source === 'bank' && !formData.bank_account_id) {
      toast({ title: 'Error', description: 'Seleccione una cuenta bancaria', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const userId = await getCurrentUserId();
      
      let result;
      if (formData.source === 'cash') {
        result = await movimientosService.createCashMovement(
          {
            type: 'income',
            concept: formData.concept,
            amount,
            notes: formData.notes,
            source: 'cash',
          },
          userId || ''
        );
      } else {
        result = await movimientosService.createBankTransaction({
          type: 'income',
          concept: formData.concept,
          amount,
          notes: formData.notes,
          source: 'bank',
          bank_account_id: parseInt(formData.bank_account_id),
        });
      }

      if (result.success) {
        toast({ title: 'Éxito', description: 'Ingreso registrado correctamente' });
        setFormData({
          concept: '',
          amount: '',
          notes: '',
          source: 'cash',
          bank_account_id: '',
        });
        onSuccess();
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al registrar el ingreso', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <DollarSign className="h-5 w-5 text-green-600" />
            Nuevo Ingreso
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Registre un ingreso que no proviene de ventas ni facturas
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="concept" className="text-gray-700 dark:text-gray-300">
              Concepto *
            </Label>
            <Input
              id="concept"
              placeholder="Ej: Aporte de socio, Préstamo, Ajuste..."
              value={formData.concept}
              onChange={(e) => setFormData({ ...formData, concept: e.target.value })}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-gray-700 dark:text-gray-300">
              Monto *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="pl-8 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Origen</Label>
            <RadioGroup
              value={formData.source}
              onValueChange={(value) => setFormData({ ...formData, source: value as 'cash' | 'bank' })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                  <Wallet className="h-4 w-4" />
                  Caja
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bank" id="bank" />
                <Label htmlFor="bank" className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                  <Building2 className="h-4 w-4" />
                  Banco
                </Label>
              </div>
            </RadioGroup>
          </div>

          {formData.source === 'bank' && (
            <div className="space-y-2">
              <Label htmlFor="bank_account" className="text-gray-700 dark:text-gray-300">
                Cuenta Bancaria *
              </Label>
              <Select
                value={formData.bank_account_id}
                onValueChange={(value) => setFormData({ ...formData, bank_account_id: value })}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccione una cuenta" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.bank_name || 'Banco'} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
              Notas (Opcional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Información adicional..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="dark:border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Ingreso'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
