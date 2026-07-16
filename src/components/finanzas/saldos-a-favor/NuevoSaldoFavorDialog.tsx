'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { saldosAFavorService, ClienteSimple } from './saldosAFavorService';

interface NuevoSaldoFavorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  onSuccess?: () => void;
}

export function NuevoSaldoFavorDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: NuevoSaldoFavorDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [clientes, setClientes] = useState<ClienteSimple[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [cashAccount, setCashAccount] = useState('1110');
  const [notes, setNotes] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    if (open && organizationId) {
      saldosAFavorService
        .listarClientes(organizationId)
        .then(setClientes)
        .catch(() => setClientes([]));
      setCustomerId('');
      setAmount(0);
      setCashAccount('1110');
      setNotes('');
      setExpiry('');
    }
  }, [open, organizationId]);

  const handleSubmit = async () => {
    if (!customerId) {
      toast({ title: 'Error', description: 'Selecciona un cliente', variant: 'destructive' });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      await saldosAFavorService.crear({
        organizationId,
        customerId,
        amount,
        cashAccount,
        notes,
        expiry: expiry || null,
      });
      toast({ title: 'Saldo a favor creado', description: 'El saldo a favor se registró correctamente.' });
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo crear el saldo a favor',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nuevo saldo a favor</DialogTitle>
          <DialogDescription>
            Registra un anticipo o saldo a favor del cliente. Genera el asiento contable (crédito a Anticipos 2805).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Cliente</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="montoSaldo">Monto</Label>
            <Input
              id="montoSaldo"
              type="number"
              min="0"
              value={amount || 0}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Origen del dinero</Label>
            <Select value={cashAccount} onValueChange={setCashAccount}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1110">Bancos (1110)</SelectItem>
                <SelectItem value="1105">Caja (1105)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expirySaldo">Vencimiento (opcional)</Label>
            <Input
              id="expirySaldo"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="notasSaldo">Notas (opcional)</Label>
            <Textarea
              id="notasSaldo"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Motivo del saldo a favor..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear saldo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
