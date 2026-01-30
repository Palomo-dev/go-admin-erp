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
import { Loader2, ArrowLeftRight, ArrowRight, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { transferenciasService, BankAccount } from '@/lib/services/transferenciasService';
import { formatCurrency } from '@/utils/Utils';

interface NuevaTransferenciaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NuevaTransferenciaDialog({
  open,
  onOpenChange,
  onSuccess,
}: NuevaTransferenciaDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    transfer_date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      loadBankAccounts();
      setFormData({
        from_account_id: '',
        to_account_id: '',
        amount: '',
        transfer_date: new Date().toISOString().split('T')[0],
        reference: '',
        notes: '',
      });
    }
  }, [open]);

  const loadBankAccounts = async () => {
    const accounts = await transferenciasService.getBankAccounts();
    setBankAccounts(accounts);
  };

  const selectedFromAccount = bankAccounts.find(
    a => a.id.toString() === formData.from_account_id
  );
  const selectedToAccount = bankAccounts.find(
    a => a.id.toString() === formData.to_account_id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.from_account_id) {
      toast({ title: 'Error', description: 'Seleccione la cuenta origen', variant: 'destructive' });
      return;
    }

    if (!formData.to_account_id) {
      toast({ title: 'Error', description: 'Seleccione la cuenta destino', variant: 'destructive' });
      return;
    }

    if (formData.from_account_id === formData.to_account_id) {
      toast({ title: 'Error', description: 'Las cuentas deben ser diferentes', variant: 'destructive' });
      return;
    }
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
      return;
    }

    // Validar saldo suficiente
    if (selectedFromAccount && amount > selectedFromAccount.balance) {
      toast({ 
        title: 'Advertencia', 
        description: `Saldo insuficiente. Disponible: ${formatCurrency(selectedFromAccount.balance)}`,
        variant: 'destructive' 
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await transferenciasService.createTransfer({
        from_account_id: parseInt(formData.from_account_id),
        to_account_id: parseInt(formData.to_account_id),
        amount,
        transfer_date: formData.transfer_date,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      });

      if (result.success) {
        toast({ title: 'Éxito', description: 'Transferencia realizada correctamente' });
        onSuccess();
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Error al realizar la transferencia', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            Nueva Transferencia
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Transfiera fondos entre sus cuentas bancarias
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cuenta Origen */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Cuenta Origen *
            </Label>
            <Select
              value={formData.from_account_id}
              onValueChange={(value) => setFormData({ ...formData, from_account_id: value })}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Seleccione cuenta origen" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                {bankAccounts
                  .filter(a => a.id.toString() !== formData.to_account_id)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.bank_name || 'Banco'} - {account.name}</span>
                        <span className="ml-4 text-gray-500">
                          {formatCurrency(account.balance)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedFromAccount && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Saldo disponible: <span className="font-medium text-green-600">{formatCurrency(selectedFromAccount.balance)}</span>
              </p>
            )}
          </div>

          {/* Indicador visual */}
          <div className="flex items-center justify-center py-2">
            <div className="flex items-center gap-2 text-gray-400">
              <Building2 className="h-4 w-4" />
              <ArrowRight className="h-5 w-5 text-blue-500" />
              <Building2 className="h-4 w-4" />
            </div>
          </div>

          {/* Cuenta Destino */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Cuenta Destino *
            </Label>
            <Select
              value={formData.to_account_id}
              onValueChange={(value) => setFormData({ ...formData, to_account_id: value })}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Seleccione cuenta destino" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                {bankAccounts
                  .filter(a => a.id.toString() !== formData.from_account_id)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.bank_name || 'Banco'} - {account.name}</span>
                        <span className="ml-4 text-gray-500">
                          {formatCurrency(account.balance)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Monto */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-gray-700 dark:text-gray-300">
              Monto a Transferir *
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

          {/* Fecha */}
          <div className="space-y-2">
            <Label htmlFor="transfer_date" className="text-gray-700 dark:text-gray-300">
              Fecha de Transferencia
            </Label>
            <Input
              id="transfer_date"
              type="date"
              value={formData.transfer_date}
              onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Referencia */}
          <div className="space-y-2">
            <Label htmlFor="reference" className="text-gray-700 dark:text-gray-300">
              Referencia / Comprobante
            </Label>
            <Input
              id="reference"
              placeholder="Ej: TRF-001, Comprobante #..."
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
              Notas (Opcional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Información adicional..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
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
                  Procesando...
                </>
              ) : (
                'Realizar Transferencia'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
