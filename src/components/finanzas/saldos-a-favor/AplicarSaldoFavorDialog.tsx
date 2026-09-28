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
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  saldosAFavorService,
  SaldoAFavor,
  FacturaPendiente,
  ErrorPeticionSaldoFavor,
  nuevaClaveIdempotencia,
} from './saldosAFavorService';

interface AplicarSaldoFavorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  saldo: SaldoAFavor | null;
  onSuccess?: () => void;
}

export function AplicarSaldoFavorDialog({
  open,
  onOpenChange,
  organizationId,
  saldo,
  onSuccess,
}: AplicarSaldoFavorDialogProps) {
  const { toast } = useToast();
  const t = useTranslations('saldosAFavor');
  // Saldos y facturas pendientes sin moneda propia en la consulta: moneda base de la organización.
  const { formatear: formatCurrency } = useMonedaOrganizacion();
  const [isLoading, setIsLoading] = useState(false);
  const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  // Una clave por apertura: un doble clic o un reintento no aplica dos veces.
  const [clave, setClave] = useState('');
  const [errorFacturas, setErrorFacturas] = useState(false);

  const facturaSel = facturas.find((f) => f.id === invoiceId);

  useEffect(() => {
    if (open && saldo && organizationId) {
      setInvoiceId('');
      setAmount(0);
      setClave(nuevaClaveIdempotencia('aplicar'));
      setErrorFacturas(false);
      saldosAFavorService
        .listarFacturasPendientes(saldo.customer_id)
        .then(setFacturas)
        .catch(() => {
          setFacturas([]);
          setErrorFacturas(true);
        });
    }
  }, [open, saldo, organizationId]);

  // Al elegir la factura se propone lo que alcance: el menor entre su saldo y el disponible.
  const elegirFactura = (id: string) => {
    setInvoiceId(id);
    const factura = facturas.find((f) => f.id === id);
    if (factura && saldo) setAmount(Math.min(Number(factura.balance), Number(saldo.balance)));
  };

  const handleSubmit = async () => {
    if (!saldo) return;
    if (!invoiceId) {
      toast({ title: 'Error', description: 'Selecciona una factura', variant: 'destructive' });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
      return;
    }
    if (amount > Number(saldo.balance)) {
      toast({ title: 'Error', description: 'El monto excede el saldo disponible', variant: 'destructive' });
      return;
    }
    if (facturaSel && amount > Number(facturaSel.balance)) {
      toast({ title: 'Error', description: 'El monto excede el saldo de la factura', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      await saldosAFavorService.aplicar({ creditId: saldo.id, invoiceId, amount, claveIdempotencia: clave });
      toast({ title: 'Saldo aplicado', description: 'El saldo a favor se aplicó a la factura.' });
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: unknown) {
      const codigo = error instanceof ErrorPeticionSaldoFavor ? error.codigo : 'error_desconocido';
      toast({
        title: 'Error',
        description: t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_desconocido'),
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
          <DialogTitle>Aplicar saldo a favor</DialogTitle>
          <DialogDescription>
            {saldo ? (
              <>
                Cliente: <strong>{saldo.customer_name || 'N/A'}</strong> · Disponible:{' '}
                <strong>{formatCurrency(Number(saldo.balance))}</strong>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Factura pendiente</Label>
            <Select value={invoiceId} onValueChange={elegirFactura}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una factura" />
              </SelectTrigger>
              <SelectContent>
                {facturas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.number} — saldo {formatCurrency(Number(f.balance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorFacturas ? (
              <p className="text-xs text-red-600 dark:text-red-400">{t('errorFacturas')}</p>
            ) : (
              facturas.length === 0 && (
                <p className="text-xs text-muted-foreground">Este cliente no tiene facturas pendientes.</p>
              )
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="montoAplicar">Monto a aplicar</Label>
            <Input
              id="montoAplicar"
              type="number"
              min="0"
              value={amount || 0}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !invoiceId}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
